import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { z } from 'zod';
import { requestSchema, type Section } from './schema.js';
import { githubJson, searchGithub } from './github.js';
import { generatePlan } from './generate.js';
const exec = promisify(execFile);
for (const file of ['.env.local', '.env.runtime']) if (existsSync(file)) process.loadEnvFile(file);
const root = fileURLToPath(new URL('./', import.meta.url));
await build({ entryPoints: [root + 'client.ts'], bundle: true, platform:'browser', format:'esm', outfile: root + 'dist/client.js', sourcemap: true });
let key = process.env.CEREBRAS_API_KEY ?? '';
let model = process.env.CEREBRAS_MODEL || 'qwen-3.8-27b';
let githubToken = process.env.GITHUB_TOKEN ?? '';
if (!githubToken) try { githubToken = (await exec('gh', ['auth', 'token'], { timeout: 5000 })).stdout.trim(); } catch { /* Public repositories still work. */ }
let login = '';
if (githubToken) try { login = (await githubJson('/user', githubToken)).login; } catch { githubToken = ''; }
const port = Number(process.env.EPHEMERAL_PORT ?? 4321);
const host = `127.0.0.1:${port}`;
const repository = process.env.EPHEMERAL_REPOSITORY || 'f1shyfang/ephemeral-software-demo';
let busy = false;
// Durable request allowance survives restarts and reserves before every paid call.
const allowancePath = fileURLToPath(new URL('../../artifacts/ephemeral/allowance.json', import.meta.url));
const generationLimit = Number(process.env.EPHEMERAL_GENERATION_LIMIT ?? 100);
let used = 0;
try { used = JSON.parse(await readFile(allowancePath,'utf8')).used; if (!Number.isSafeInteger(used) || used < 0) throw Error(); } catch (e: any) { if (e?.code !== 'ENOENT') throw Error('Invalid generation allowance file. Restore artifacts/ephemeral/allowance.json before starting.'); }
async function body(req: IncomingMessage) {
  let value = '';
  for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > 50000) throw Error('Request too large.'); }
  return JSON.parse(value);
}
const json = (res: ServerResponse, code: number, value: unknown) => { res.writeHead(code, {'content-type':'application/json'}); res.end(JSON.stringify(value)); };
const server = createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  // Loopback-only plus Host/Origin checks prevent other websites driving local credentials.
  const allowedHost = req.headers.host === host || req.headers.host === `localhost:${port}`;
  if (!allowedHost || (req.headers.origin && ![`http://${host}`, `http://localhost:${port}`].includes(req.headers.origin))) return json(res, 403, { error:'Open the demo directly on localhost.' });
  const path = new URL(req.url ?? '/', `http://${host}`).pathname;
  try {
    if (req.method === 'GET' && path === '/api/status') return json(res, 200, { cerebras: !!key, model, github: !!githubToken, login, repository, remaining: Math.max(0, generationLimit - used) });
    if (req.method === 'GET' && ['/', '/client.js', '/styles.css'].includes(path)) {
      const file = path === '/' ? 'index.html' : path === '/client.js' ? 'dist/client.js' : 'styles.css';
      res.setHeader('content-type', path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript' : 'text/css');
      return res.end(await readFile(root + file));
    }
    if (req.method !== 'POST') return json(res, 404, {error:'Not found'});
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, {error:'Send JSON.'});
    if (path === '/api/connection') {
      if (busy) return json(res, 409, {error:'Wait for the current generation to finish.'});
      const config = z.object({ key: z.string().trim().min(10).max(500), model: z.string().regex(/^[\w.\/-]+$/).max(100) }).strict().parse(await body(req));
      key = config.key; model = config.model;
      return json(res, 200, {connected:true, model});
    }
    if (path !== '/api/generate') return json(res, 404, {error:'Not found'});
    const input = requestSchema.parse(await body(req));
    if (!key) return json(res, 412, {error:'Connect Cerebras first. Open Connections and add your API key.'});
    if (busy) return json(res, 409, {error:'A workspace is already generating. Wait a moment.'});
    if (!Number.isFinite(generationLimit) || used >= generationLimit) return json(res, 429, {error:'The demo generation allowance has been reached. Set EPHEMERAL_GENERATION_LIMIT to a higher total and restart.'});
    busy = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 60000);
    res.on('close', () => abort.abort());
    res.writeHead(200, {'content-type':'application/x-ndjson; charset=utf-8', 'x-accel-buffering':'no'});
    res.flushHeaders();
    const send = (type: string, value: Record<string, unknown>) => { if (!res.destroyed) res.write(JSON.stringify({type,...value}) + '\n'); };
    const started = Date.now();
    try {
      send('status', {message:'Reading GitHub context…'});
      const labels = await githubJson(`/repos/${input.repository}/labels?per_page=100`, githubToken, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]));
      await mkdir(new URL('../../artifacts/ephemeral/', import.meta.url), { recursive:true });
      await writeFile(allowancePath, JSON.stringify({ used: ++used }), { mode: 0o600 });
      send('status', {message:'Cerebras is composing your workspace…'});
      const jobs: Promise<void>[] = [];
      const sections: { section: Section; result?: Awaited<ReturnType<typeof searchGithub>>; error?: string }[] = [];
      let lastProgress = 0;
      const generated = await generatePlan(input, { key, model, login, labels: labels.map((l: any) => String(l.name)).slice(0,100), signal: abort.signal,
        onProgress: characters => { if (characters - lastProgress >= 200) { lastProgress = characters; send('progress', {characters}); } },
        onSection: (section, index) => {
          send('section', {index, section});
          sections[index] = {section};
          jobs.push(searchGithub(input.repository, section, githubToken, login, AbortSignal.any([abort.signal, AbortSignal.timeout(20000)])).then(result => {
            sections[index].result = result; send('data', {index, result});
          }).catch(error => { sections[index].error = error.message; send('sectionError', {index, error:error.message}); }));
        },
      });
      await Promise.all(jobs);
      send('complete', {plan:generated.plan, sections, model:generated.model, usage:generated.usage, durationMs:Date.now()-started, remaining:generationLimit-used});
    } catch (error) {
      abort.abort();
      send('error', {error: error instanceof z.ZodError ? 'The generated layout was invalid. Your previous workspace is preserved; please retry.' : abort.signal.aborted && Date.now()-started >= 59000 ? 'Generation timed out. Try a smaller request.' : error instanceof Error ? error.message : 'Generation failed. Please retry.'});
    } finally { clearTimeout(timeout); busy = false; res.end(); }
  } catch (error) { json(res, 400, {error: error instanceof z.ZodError ? 'Invalid request. Check the repository name and input.' : 'Could not read the request. Please retry.'}); }
});
server.requestTimeout = 70000;
server.listen(port, '127.0.0.1', () => console.log(`Interface: http://${host}\nGitHub: ${login || 'public access'} · Cerebras: ${key ? model : 'add a key in Connections'}`));
