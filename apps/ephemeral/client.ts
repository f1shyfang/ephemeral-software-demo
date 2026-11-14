import { emptyPreferences, planSchema, preferencesSchema, type Plan, type Section } from './schema.js';
import type { GithubItem, GithubResult } from './github.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const prompt = $<HTMLTextAreaElement>('prompt'), repo = $<HTMLInputElement>('repository');
const workspace = $('workspace'), welcome = workspace.innerHTML;
const memoryKey = 'ephemeral.preferences.v1', repoKey = 'ephemeral.repository.v1';
let preferences = preferencesSchema.parse(emptyPreferences);
let storageAvailable = true;
try { const saved = localStorage.getItem(memoryKey); if (saved) preferences = preferencesSchema.parse(JSON.parse(saved)); } catch { /* Corrupt memory is ignored. */ }
let status: {cerebras: boolean; model: string; login: string; github: boolean; repository: string; remaining: number} | null = null;
type SectionState = { section: Section; result?: GithubResult; error?: string };
let plan: Plan | null = null, sections: SectionState[] = [], history: {role:'user'|'assistant';content:string}[] = [];
let busy = false, filter = '', activeRepository = '', generation: AbortController | null = null;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const notice = (text: string, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
function savePreferences() {
  try { localStorage.setItem(memoryKey, JSON.stringify(preferences)); } catch { storageAvailable = false; notice('Browser storage is unavailable. Preferences will last for this tab only.', true); }
  renderMemory();
}
function renderMemory() {
  const names = { layout:'Layout', density:'Density', descriptions:'Descriptions', groupBy:'Group by' };
  const entries = Object.entries(preferences).filter(([,value]) => value !== null);
  $('clear-memory').hidden = !entries.length;
  $('preferences').innerHTML = entries.length ? entries.map(([key,value]) => `<div class="preference"><span>${names[key as keyof typeof names]} · ${escape(typeof value === 'boolean' ? value ? 'shown' : 'hidden' : value)}</span><button type="button" data-forget="${key}" aria-label="Forget ${names[key as keyof typeof names].toLowerCase()}">Remove</button></div>`).join('') : '<p class="memory-empty">A fresh start. No preferences saved yet.</p>';
}
function renderHistory() {
  $('history').innerHTML = history.map(item => `<p class="message ${item.role}"><strong>${item.role === 'user' ? 'You' : 'Ephemeral'}</strong>${escape(item.content)}</p>`).join('');
  $('history').parentElement!.scrollTop = $('history').parentElement!.scrollHeight;
}
function groups(items: GithubItem[], groupBy: Section['groupBy']) {
  const map = new Map<string, GithubItem[]>();
  for (const item of items) {
    const name = groupBy === 'state' ? item.state : groupBy === 'repository' ? item.repository : groupBy === 'assignee' ? item.assignees.join(', ') || 'Unassigned' : '';
    map.set(name, [...(map.get(name) ?? []), item]);
  }
  return [...map.entries()];
}
const labelHTML = (labels: string[]) => labels.map(label => `<span class="label">${escape(label)}</span>`).join('');
function cell(item: GithubItem, column: Section['columns'][number], description: boolean): string {
  switch (column) {
    case 'number': return `<span class="data-meta">#${item.number}</span>`;
    case 'title': return `<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a>${description && item.description ? `<p class="item-description">${escape(item.description.slice(0,220))}</p>` : ''}`;
    case 'state': return `<span class="state ${item.state === 'closed' ? 'closed' : ''}">${escape(item.state)}</span>`;
    case 'labels': return labelHTML(item.labels);
    case 'assignees': return `<span class="data-meta">${escape(item.assignees.join(', ') || 'Unassigned')}</span>`;
    case 'updated': return `<span class="data-meta">${escape(new Date(item.updated).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))}</span>`;
    case 'repository': return `<span class="data-meta">${escape(item.repository)}</span>`;
  }
}
function itemHTML(item: GithubItem, section: Section) {
  const cols = section.columns;
  return `<a class="list-item" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer"><h3>${escape(item.title)}</h3>${section.descriptions && item.description ? `<p class="item-description">${escape(item.description.slice(0,220))}</p>` : ''}<div class="data-meta"><span>#${item.number}</span>${cols.includes('state') ? `<span class="state">${escape(item.state)}</span>` : ''}${cols.includes('assignees') ? `<span>${escape(item.assignees.join(', ') || 'Unassigned')}</span>` : ''}${cols.includes('repository') ? `<span>${escape(item.repository)}</span>` : ''}${cols.includes('updated') ? `<span>${escape(new Date(item.updated).toLocaleDateString())}</span>` : ''}</div>${cols.includes('labels') ? `<div>${labelHTML(item.labels)}</div>` : ''}</a>`;
}
function sectionHTML(state: SectionState) {
  const s = state.section, result = state.result;
  let content = '';
  const items = (result?.items ?? []).filter(item => `${item.title} ${item.assignees.join(' ')} ${item.labels.join(' ')} #${item.number}`.toLowerCase().includes(filter.toLowerCase()));
  if (state.error) content = `<p class="section-error">${escape(state.error)} Refine the request or generate again to retry.</p>`;
  else if (!result) content = '<div class="loading-lines" aria-label="Fetching GitHub records"><div></div><div></div><div></div></div>';
  else if (!items.length) content = `<p class="empty-data">${filter ? 'No records match your filter.' : 'No matching records in this repository. Try a broader request or a different repository.'}</p>`;
  else {
    const groupBy = s.layout === 'board' && s.groupBy === 'none' ? 'state' : s.groupBy;
    content = groups(items, groupBy).map(([name, group]) => {
      const heading = name ? `<h3 class="group-heading">${escape(name)} <span class="section-count">${group.length}</span></h3>` : '';
      if (s.layout === 'table') {
        const columns = [...new Set(s.columns.includes('title') ? s.columns : ['title' as const, ...s.columns])];
        const names = {number:'#',title:'Title',state:'State',labels:'Labels',assignees:'Assignees',updated:'Updated',repository:'Repository'};
        return `${heading}<div class="table-wrap"><table><caption hidden>${escape(s.title)}${name ? ` — ${escape(name)}` : ''}</caption><thead><tr>${columns.map(c=>`<th scope="col">${names[c]}</th>`).join('')}</tr></thead><tbody>${group.map(item => `<tr>${columns.map(c=>`<td class="${c}">${cell(item,c,s.descriptions)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      return `<div class="${s.layout === 'board' ? 'board-column' : ''}">${heading}<div class="${s.layout === 'cards' ? 'cards' : 'items-list'}">${group.map(item=>itemHTML(item,s)).join('')}</div></div>`;
    }).join('');
    if (s.layout === 'board') content = `<div class="board">${content}</div>`;
  }
  return `<section class="generated-section ${s.density}"><div class="section-top"><h3>${escape(s.title)}</h3><span class="section-count">${result ? `${items.length} shown${result.total > result.items.length ? ` of ${result.total.toLocaleString()}` : ''}` : state.error ? 'Unavailable' : 'Fetching…'}</span></div>${content}${result ? `<details class="query-details"><summary>GitHub query${result.incomplete ? ' · GitHub reports incomplete results' : ''}${result.total > 100 ? ' · first 100 records' : ''}</summary><code>${escape(result.query)}</code></details>` : ''}</section>`;
}
function renderWorkspace(draft = false) {
  if (!plan && !sections.length) { workspace.innerHTML = busy ? '<p class="generation-note">Listening to your request. Cerebras is composing the first section…</p><div class="loading-lines"><div></div><div></div><div></div></div>' : welcome; return; }
  workspace.innerHTML = `<div class="workspace-heading"><div><h2>${escape(draft ? 'Your workspace is taking shape' : plan?.title ?? 'Your workspace')}</h2><p>${escape(draft ? 'Sections arrive as Cerebras generates them. GitHub supplies the data.' : plan?.description ?? '')}</p></div><input id="workspace-filter" type="search" aria-label="Filter visible records" placeholder="Filter visible records…" value="${escape(filter)}" ${busy ? 'disabled' : ''}></div>${sections.map(sectionHTML).join('')}`;
}
function setBusy(value: boolean) {
  busy = value; document.body.classList.toggle('generating', value); workspace.setAttribute('aria-busy', String(value));
  for (const id of ['generate','repository','new-workspace','connections']) ($<HTMLButtonElement>(id)).disabled = value;
  document.querySelectorAll<HTMLButtonElement>('#repo-form button, #clear-memory, [data-forget]').forEach(b => b.disabled = value);
  $('generate').textContent = value ? 'Generating…' : 'Generate view →';
  $<HTMLButtonElement>('mic').disabled = value || !Recognition;
}
async function refreshStatus() {
  const response = await fetch('/api/status');
  if (!response.ok) throw Error('Could not reach the local server. Restart npm run ephemeral.');
  status = await response.json();
  $('connection-dot').classList.toggle('connected', status!.cerebras);
  $('github-connection').textContent = status!.github ? `GitHub connected as ${status!.login}. Uses your local gh authentication.` : 'GitHub public access. Run gh auth login and restart for your assignments, review requests, and private repositories.';
  $<HTMLInputElement>('model').value = status!.model;
}
function useRepository() {
  if (listening) { voiceError = true; recognition.abort(); }
  const value = repo.value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) { notice('Enter a repository as owner/name.', true); repo.focus(); return false; }
  repo.value = value;
  if (activeRepository && activeRepository.toLowerCase() !== value.toLowerCase()) { plan = null; sections = []; history = []; filter = ''; renderWorkspace(); renderHistory(); }
  activeRepository = value;
  try { localStorage.setItem(repoKey,value); } catch { /* Storage can be unavailable. */ }
  $('data-source').textContent = `${value} · read-only`;
  return true;
}
async function generate() {
  if (busy || !prompt.value.trim()) return;
  if (listening) { recognition.stop(); return; }
  if (!useRepository()) return;
  if (!status?.cerebras) { $('connection-panel').hidden = false; $<HTMLInputElement>('api-key').focus(); notice('Add your Cerebras key to generate a live workspace.'); return; }
  const instruction = prompt.value.trim();
  const previous = plan, previousSections = sections;
  generation = new AbortController();
  sections = []; filter = ''; setBusy(true); renderWorkspace(true);
  notice('Connecting to Cerebras…');
  $('workspace-state').textContent = 'Generating live';
  const started = performance.now();
  let completed = false;
  try {
    const response = await fetch('/api/generate', { method:'POST', headers:{'content-type':'application/json'}, signal:generation.signal,
      body:JSON.stringify({prompt:instruction, repository:activeRepository, preferences, previous, history:history.slice(-12)}) });
    if (!response.ok) { const error = await response.json(); throw Error(error.error || 'Generation failed. Please retry.'); }
    if (!response.body) throw Error('No response stream. Please retry.');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    const event = (line: string) => {
      if (!line.trim()) return;
      const e = JSON.parse(line);
      if (e.type === 'error') throw Error(e.error);
      if (e.type === 'status') notice(e.message);
      if (e.type === 'progress') notice(`Cerebras is composing · ${e.characters.toLocaleString()} characters received`);
      if (e.type === 'section') { sections[e.index] = {section:e.section}; renderWorkspace(true); }
      if (e.type === 'data') { if (sections[e.index]) sections[e.index].result = e.result; renderWorkspace(true); }
      if (e.type === 'sectionError') { if (sections[e.index]) sections[e.index].error = e.error; renderWorkspace(true); }
      if (e.type === 'complete') {
        plan = planSchema.parse(e.plan); sections = e.sections; preferences = preferencesSchema.parse(plan.preferences); savePreferences();
        history.push({role:'user',content:instruction},{role:'assistant',content:plan.description}); history = history.slice(-12); renderHistory();
        prompt.value = ''; filter = ''; completed = true;
        const seconds = ((performance.now()-started)/1000).toFixed(2);
        $('timing').textContent = `${seconds}s end to end · ${e.model}`;
        notice(sections.some(s=>s.error) ? 'Layout generated. Some GitHub queries failed; see the affected sections.' : 'Workspace ready. Speak again to refine it.');
        $('workspace-state').textContent = 'Live GitHub data';
      }
    };
    try {
      while (true) {
        const {value,done} = await reader.read();
        if (done) {buffer += decoder.decode();break;}
        buffer += decoder.decode(value,{stream:true});
        let i:number; while ((i=buffer.indexOf('\n'))>=0) {event(buffer.slice(0,i));buffer=buffer.slice(i+1);}
      }
      if (buffer.trim()) event(buffer);
      if (!completed) throw Error('The response ended before the workspace was complete. Please retry.');
    } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  } catch(error) {
    plan = previous; sections = previousSections;
    notice(error instanceof Error ? error.message : 'Could not generate. Please retry.',true);
    $('workspace-state').textContent = previous ? 'Previous workspace preserved' : 'Ready to retry';
  } finally { generation = null; setBusy(false); renderWorkspace(); }
}
$('composer').addEventListener('submit',e=>{e.preventDefault();void generate();});
prompt.addEventListener('keydown',e=>{if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){e.preventDefault();void generate();}});
$('repo-form').addEventListener('submit',e=>{e.preventDefault();if(useRepository())notice(`Using ${activeRepository}. Describe the view you need.`);});
workspace.addEventListener('click',e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-prompt]');
  if(button && !busy){prompt.value=button.dataset.prompt!;void generate();}
});
workspace.addEventListener('input',e=>{
  if((e.target as HTMLElement).id !== 'workspace-filter')return;
  const input=e.target as HTMLInputElement, position=input.selectionStart;
  filter=input.value;renderWorkspace();const next=$<HTMLInputElement>('workspace-filter');next.focus();try{next.setSelectionRange(position,position);}catch{}
});
$('new-workspace').addEventListener('click',()=>{if(listening){voiceError=true;recognition.abort();}plan=null;sections=[];history=[];filter='';prompt.value='';renderWorkspace();renderHistory();notice('New workspace. Your remembered preferences will carry over.');$('workspace-state').textContent='Ready when you are';$('timing').textContent='Generated with Cerebras';prompt.focus();});
$('clear-memory').addEventListener('click',()=>{preferences=preferencesSchema.parse(emptyPreferences);savePreferences();notice('Saved preferences cleared. Your current workspace is unchanged.');});
$('preferences').addEventListener('click',e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-forget]');
  if(button&&!busy){preferences={...preferences,[button.dataset.forget!]:null};savePreferences();notice('Preference removed. New requests will use the updated defaults.');}
});
$('connections').addEventListener('click',()=>{$('connection-panel').hidden=!$('connection-panel').hidden;});
$('close-connections').addEventListener('click',()=>{$('connection-panel').hidden=true;});
$('connection-form').addEventListener('submit',async e=>{
  e.preventDefault();const input=$<HTMLInputElement>('api-key'); const button=document.querySelector<HTMLButtonElement>('#connection-form button')!; button.disabled=true;
  try {
    const response=await fetch('/api/connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:input.value,model:$<HTMLInputElement>('model').value})});
    const data=await response.json();if(!response.ok)throw Error(data.error);
    input.value='';await refreshStatus();$('connection-panel').hidden=true;notice('Connection saved. Your next request will use Cerebras.');prompt.focus();
  }catch(error){$('connection-notice').textContent=error instanceof Error?error.message:'Connection failed.';$('connection-notice').classList.add('error');}
  finally{button.disabled=false;}
});
// A single utterance is transcribed live, then submitted when recognition ends.
// Browser speech support is feature-detected; denied/network errors never submit.
const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition:any=null,listening=false,voiceError=false,voiceFinal='',voiceBase='';
if(!Recognition){$<HTMLButtonElement>('mic').disabled=true;$('speech-help').textContent='Dictation is unavailable in this browser. Use Chrome or type your request.';}
$('mic').addEventListener('click',()=>{
  if(!Recognition||busy)return;
  if(listening){recognition.stop();return;}
  recognition=new Recognition();recognition.lang=navigator.language||'en-AU';recognition.interimResults=true;recognition.continuous=false;
  voiceError=false;voiceFinal='';voiceBase=prompt.value.trim();
  recognition.onstart=()=>{listening=true;$('mic').setAttribute('aria-pressed','true');$('mic').setAttribute('aria-label','Stop dictation');$('mic-text').textContent='Stop';notice('Listening… pause when you’re finished.');$<HTMLButtonElement>('generate').disabled=true;};
  recognition.onresult=(event:any)=>{
    let interim='';voiceFinal='';
    for(let i=0;i<event.results.length;i++){const result=event.results[i];if(result.isFinal)voiceFinal+=result[0].transcript;else interim+=result[0].transcript;}
    prompt.value=[voiceBase,voiceFinal+interim].filter(Boolean).join(' ').slice(0,3000);
  };
  recognition.onerror=(event:any)=>{voiceError=true;notice(event.error==='not-allowed'?'Microphone access was denied. Allow it in browser settings, or type your request.':`Dictation failed (${event.error}). Try speaking again or type your request.`,true);};
  recognition.onend=()=>{
    listening=false;$('mic').setAttribute('aria-pressed','false');$('mic').setAttribute('aria-label','Start dictation');$('mic-text').textContent='Speak';$<HTMLButtonElement>('generate').disabled=busy;
    if(!voiceError&&voiceFinal.trim()){prompt.value=[voiceBase,voiceFinal.trim()].filter(Boolean).join(' ').slice(0,3000);void generate();}
    else if(!voiceError)notice('No speech detected. Try again, or type your request.');
  };
  try{recognition.start();}catch{notice('Could not start dictation. Try again or type your request.',true);}
});
renderMemory();
void refreshStatus().then(()=>{
  let saved:string|null=null;try{saved=localStorage.getItem(repoKey);}catch{storageAvailable=false;}
  repo.value=(saved === 'f1shyfang/formal-verification-pr-workflow' ? null : saved)||status!.repository;useRepository();
  if(!status!.cerebras){$('connection-panel').hidden=false;notice('Connect Cerebras to start generating. GitHub is ready.');}
  if(!storageAvailable)notice('Browser storage is unavailable. Preferences will last for this tab only.',true);
}).catch(error=>notice(error.message,true));
