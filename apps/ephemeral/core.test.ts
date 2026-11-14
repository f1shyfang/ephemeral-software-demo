import test from 'node:test';
import assert from 'node:assert/strict';
import { completedSections, emptyPreferences, planSchema, sectionSchema } from './schema.js';
import { generatePlan } from './generate.js';
import { searchGithub, searchQuery } from './github.js';
const section = sectionSchema.parse({title:'PRs with "quotes" and } braces',layout:'table',density:'compact',descriptions:false,groupBy:'assignee',columns:['title','assignees'],query:{kind:'pulls',state:'open',labels:['urgent'],assignee:'@me',reviewRequested:false,text:'',sort:'updated'}});
const plan = {title:'My PRs',description:'Your pull requests.',preferences:emptyPreferences,sections:[section,{...section,title:'Another section'}]};
test('incremental parser emits only complete sections at every split, including escaped quotes and braces',()=>{
  const text=JSON.stringify(plan);
  for(let end=0;end<=text.length;end++) {
    const found=completedSections(text.slice(0,end));
    assert.ok(found.length<=2);
    if(found.length) assert.deepEqual(found[0],section);
    if(found.length===2) assert.deepEqual(found[1],plan.sections[1]);
  }
  assert.deepEqual(completedSections(text),plan.sections);
  assert.deepEqual(completedSections('{"description":"sections", "sections" : ['+JSON.stringify(section)+']'),[section]);
});
test('schema rejects executable layouts and unsupported fields',()=>{
  assert.equal(planSchema.safeParse({...plan,html:'<script>'}).success,false);
  assert.equal(sectionSchema.safeParse({...section,layout:'iframe'}).success,false);
  assert.equal(planSchema.safeParse({...plan,sections:[]}).success,false);
});
test('queries stay repository-scoped and resolve @me; review filters require authentication',()=>{
  const query=searchQuery('owner/repo',section,'alice');
  assert.match(query,/^repo:owner\/repo is:pr is:open/);
  assert.match(query,/assignee:alice/);
  assert.match(query,/label:"urgent"/);
  assert.throws(()=>searchQuery('owner/repo',section,''),/account/);
  const review={...section,query:{...section.query,assignee:'',reviewRequested:true}};
  assert.throws(()=>searchQuery('owner/repo',review,''),/Connect GitHub/);
  assert.match(searchQuery('owner/repo',review,'alice'),/review-requested:alice/);
  const textQuery=searchQuery('owner/repo',{...section,query:{...section.query,text:'repo:other/private OR is:closed'}},'alice');
  assert.ok(textQuery.endsWith('"repo:other/private OR is:closed"'));
});
test('GitHub normalization preserves actual data and truncation information',async()=>{
  const result=await searchGithub('owner/repo',section,'token','alice',undefined,async (url, options)=>{
    assert.equal(new URL(String(url)).searchParams.get('per_page'),'100');
    assert.equal((options!.headers as Record<string,string>).authorization,'Bearer token');
    return Response.json({total_count:120,incomplete_results:true,items:[{number:7,title:'<img onerror=alert(1)>',state:'open',pull_request:{},labels:[{name:'bug'}],assignees:[{login:'alice'}],updated_at:'2026-11-01T00:00:00Z',body:'Real body'}]});
  });
  assert.equal(result.total,120);assert.equal(result.incomplete,true);assert.equal(result.items[0].url,'https://github.com/owner/repo/pull/7');assert.equal(result.items[0].description,'Real body');
});
function providerResponse(value: unknown, finish='stop') {
  const content=JSON.stringify(value);
  const wire=Array.from(content).map(char=>'data: '+JSON.stringify({model:'test-cerebras',choices:[{delta:{content:char}}]})+'\r\n\r\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:finish}],usage:{prompt_tokens:123,completion_tokens:456}})+'\n\ndata: [DONE]\n\n';
  const bytes=new TextEncoder().encode(wire);
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=17)controller.enqueue(bytes.slice(i,i+17));controller.close();}}));
}
test('Cerebras stream handles split SSE frames, emits sections before completion and validates final plan',async()=>{
  const emitted:unknown[]=[];
  const result=await generatePlan({prompt:'Show my PRs',repository:'owner/repo',preferences:emptyPreferences,previous:null,history:[]},{key:'test-key',model:'test-model',login:'alice',labels:['urgent'],signal:new AbortController().signal,onSection:s=>emitted.push(s),onProgress:()=>{},fetcher:async(url,init)=>{
    assert.equal(url,'https://api.cerebras.ai/v1/chat/completions');
    const body=JSON.parse(String(init!.body));assert.equal(body.stream,true);assert.equal(body.response_format.json_schema.strict,true);
    return providerResponse(plan);
  }});
  assert.deepEqual(emitted,plan.sections);assert.deepEqual(result.plan,plan);assert.equal(result.model,'test-cerebras');
});
test('truncated or invalid provider output fails instead of committing a workspace',async()=>{
  const config={key:'test',model:'test',login:'alice',labels:[],signal:new AbortController().signal,onSection:()=>{},onProgress:()=>{}};
  const input={prompt:'Show PRs',repository:'owner/repo',preferences:emptyPreferences,previous:null,history:[]};
  await assert.rejects(generatePlan(input,{...config,fetcher:async()=>providerResponse(plan,'length')}),/did not finish/);
  await assert.rejects(generatePlan(input,{...config,fetcher:async()=>providerResponse({...plan,sections:[{...section,layout:'html'}]})}));
  await assert.rejects(generatePlan(input,{...config,fetcher:async()=>new Response('',{status:401})}),/rejected this key/);
});
test('a temporary refinement cannot silently save model-proposed preferences',async()=>{
  const result=await generatePlan({prompt:'Make this a table',repository:'owner/repo',preferences:emptyPreferences,previous:null,history:[]},{key:'test',model:'test',login:'alice',labels:[],signal:new AbortController().signal,onSection:()=>{},onProgress:()=>{},fetcher:async()=>providerResponse({...plan,preferences:{...emptyPreferences,layout:'table'}})});
  assert.deepEqual(result.plan.preferences,emptyPreferences);
});
