import { z } from "zod";
import { requestSchema, type Section } from "./schema.js";
import { generatePlan } from "./generate.js";
import {
  githubJson,
  searchGithub,
  searchQuery,
  type GithubResult,
} from "./github.js";
import html from "./index.html";
import css from "./styles.css";
import client from "./dist/client.js";
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = any>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface Database {
  prepare(sql: string): Statement;
}
export interface Env {
  DB: Database;
  CEREBRAS_API_KEY?: string;
  CEREBRAS_MODEL?: string;
  SESSION_SECRET: string;
  DAILY_GENERATION_LIMIT?: string;
  VISITOR_GENERATION_LIMIT?: string;
}
interface Context {
  waitUntil(promise: Promise<unknown>): void;
}
const repository = "f1shyfang/ephemeral-software-demo";
const hostedInput = requestSchema.extend({
  githubLogin: z
    .string()
    .regex(/^[a-zA-Z0-9-]{0,39}$/)
    .default(""),
});
const encoder = new TextEncoder();
const security = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "microphone=(self)",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const json = (value: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...security,
      "content-type": "application/json; charset=utf-8",
      ...(cookie ? { "set-cookie": cookie } : {}),
    },
  });
const bytesToHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}
export async function visitorSession(
  request: Request,
  secret: string,
  now = Date.now(),
) {
  const cookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("ephemeral_visitor="))
      ?.slice("ephemeral_visitor=".length) ?? "";
  const match = /^([a-f0-9-]{36})\.(\d{13})\.([a-f0-9]{64})$/.exec(cookie);
  if (match) {
    const [, id, time, sig] = match;
    const age = now - Number(time);
    if (age >= 0 && age < 30 * 86400000) {
      const expected = await signature(`${id}.${time}`, secret);
      let diff = 0;
      for (let i = 0; i < expected.length; i++)
        diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
      if (diff === 0) return { id, cookie: null };
    }
  }
  const id = crypto.randomUUID(),
    value = `${id}.${now}`;
  const token = `${value}.${await signature(value, secret)}`;
  return {
    id,
    cookie: `ephemeral_visitor=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
  };
}
const limit = (value: string | undefined, fallback: number) => {
  const n = Number(value ?? fallback);
  return Number.isSafeInteger(n) && n > 0 && n <= 10000 ? n : fallback;
};
export async function reserveGeneration(
  db: Database,
  visitor: string,
  daily: number,
  personal: number,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  const result = await db
    .prepare(
      `INSERT INTO demo_generations (id, visitor, day)
 SELECT ?, ?, ? WHERE
 (SELECT COUNT(*) FROM demo_generations WHERE day = ?) < ? AND
 (SELECT COUNT(*) FROM demo_generations WHERE day = ? AND visitor = ?) < ?`,
    )
    .bind(crypto.randomUUID(), visitor, day, day, daily, day, visitor, personal)
    .run();
  return result.meta.changes === 1;
}
async function remaining(env: Env, visitor: string) {
  const day = new Date().toISOString().slice(0, 10);
  const counts = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN visitor = ? THEN 1 ELSE 0 END), 0) AS personal FROM demo_generations WHERE day = ?",
  )
    .bind(visitor, day)
    .first<{ total: number; personal: number }>();
  return Math.max(
    0,
    Math.min(
      limit(env.DAILY_GENERATION_LIMIT, 100) - (counts?.total ?? 0),
      limit(env.VISITOR_GENERATION_LIMIT, 10) - (counts?.personal ?? 0),
    ),
  );
}
async function cached<T>(
  env: Env,
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hash = bytesToHex(
    await crypto.subtle.digest("SHA-256", encoder.encode(key)),
  );
  const found = await env.DB.prepare(
    "SELECT value FROM github_cache WHERE id = ? AND expires_at > ?",
  )
    .bind(hash, Date.now())
    .first<{ value: string }>();
  if (found) {
    try {
      return JSON.parse(found.value);
    } catch {
      /* Fetch a fresh public record. */
    }
  }
  const value = await load();
  await env.DB.prepare(
    "INSERT INTO github_cache (id, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at",
  )
    .bind(hash, JSON.stringify(value), Date.now() + ttl)
    .run();
  return value;
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 50000)
    throw Error("Request too large.");
  if (!request.body) throw Error("Missing request.");
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let raw = "",
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 50000) throw Error("Request too large.");
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function handleRequest(
  request: Request,
  env: Env,
  ctx: Context,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    request.method === "GET" &&
    ["/", "/client.js", "/styles.css"].includes(url.pathname)
  ) {
    const asset =
      url.pathname === "/"
        ? html
        : url.pathname === "/client.js"
          ? client
          : css;
    return new Response(asset, {
      headers: {
        ...security,
        "content-type":
          url.pathname === "/"
            ? "text/html; charset=utf-8"
            : url.pathname === "/client.js"
              ? "text/javascript; charset=utf-8"
              : "text/css; charset=utf-8",
      },
    });
  }
  if (!env.SESSION_SECRET || !env.DB)
    return json(
      { error: "The demo is being configured. Please try again shortly." },
      503,
    );
  const visitor = await visitorSession(request, env.SESSION_SECRET);
  if (request.method === "GET" && url.pathname === "/api/status")
    return json(
      {
        hosted: true,
        cerebras: !!env.CEREBRAS_API_KEY,
        model: env.CEREBRAS_MODEL || "qwen-3.8-27b",
        github: false,
        login: "",
        repository,
        remaining: await remaining(env, visitor.id),
      },
      200,
      visitor.cookie ?? undefined,
    );
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  if (request.headers.get("origin") !== url.origin)
    return json(
      { error: "Open the demo directly to generate a workspace." },
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Send JSON." }, 415);
  if (url.pathname === "/api/connection")
    return json(
      {
        error:
          "This shared demo is already connected. Visitors do not need an API key.",
      },
      405,
    );
  if (url.pathname !== "/api/generate")
    return json({ error: "Not found" }, 404);
  let input: z.infer<typeof hostedInput>;
  try {
    input = hostedInput.parse(await body(request));
  } catch {
    return json(
      {
        error:
          "Invalid request. Check the repository, GitHub username, and prompt.",
      },
      400,
    );
  }
  if (input.repository.toLowerCase() !== repository)
    return json(
      {
        error:
          "This shared demo uses the ephemeral-software-demo repository. Ask for a different view of its issues or pull requests.",
      },
      400,
    );
  if (!env.CEREBRAS_API_KEY)
    return json(
      { error: "The host is connecting Cerebras. Please try again shortly." },
      503,
    );
  if (
    !(await reserveGeneration(
      env.DB,
      visitor.id,
      limit(env.DAILY_GENERATION_LIMIT, 100),
      limit(env.VISITOR_GENERATION_LIMIT, 10),
    ))
  )
    return json(
      {
        error:
          "The daily demo allowance has been used. Please try again tomorrow (UTC).",
      },
      429,
      visitor.cookie ?? undefined,
    );
  const stream = new TransformStream<Uint8Array, Uint8Array>(),
    writer = stream.writable.getWriter();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 60000);
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  let writes: Promise<void> = Promise.resolve();
  const send = (type: string, values: Record<string, unknown>) => {
    writes = writes.then(() =>
      writer.write(encoder.encode(JSON.stringify({ type, ...values }) + "\n")),
    );
    writes.catch(() => abort.abort());
  };
  const run = async () => {
    const started = Date.now();
    try {
      send("status", { message: "Reading GitHub context…" });
      const labels = await cached<any[]>(
        env,
        `labels:${repository}`,
        600000,
        () =>
          githubJson(
            `/repos/${repository}/labels?per_page=100`,
            "",
            AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
          ),
      );
      send("status", { message: "Cerebras is composing your workspace…" });
      const jobs: Promise<void>[] = [];
      const sections: {
        section: Section;
        result?: GithubResult;
        error?: string;
      }[] = [];
      let progress = 0;
      const generated = await generatePlan(input, {
        key: env.CEREBRAS_API_KEY!,
        model: env.CEREBRAS_MODEL || "qwen-3.8-27b",
        login: input.githubLogin,
        labels: labels.map((l) => String(l.name)).slice(0, 100),
        signal: abort.signal,
        onProgress: (characters) => {
          if (characters - progress >= 200) {
            progress = characters;
            send("progress", { characters });
          }
        },
        onSection: (section, index) => {
          sections[index] = { section };
          send("section", { index, section });
          if (
            !input.githubLogin &&
            (section.query.assignee === "@me" || section.query.reviewRequested)
          ) {
            sections[index].error =
              "Add your GitHub username in Connections to use personal filters.";
            send("sectionError", { index, error: sections[index].error });
            return;
          }
          const query = searchQuery(repository, section, input.githubLogin);
          jobs.push(
            cached(env, `search:${query}:${section.query.sort}`, 90000, () =>
              searchGithub(
                repository,
                section,
                "",
                input.githubLogin,
                AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
              ),
            )
              .then((result) => {
                sections[index].result = result;
                send("data", { index, result });
              })
              .catch((error) => {
                sections[index].error = error.message;
                send("sectionError", { index, error: error.message });
              }),
          );
        },
      });
      await Promise.all(jobs);
      send("complete", {
        plan: generated.plan,
        sections,
        model: generated.model,
        usage: generated.usage,
        durationMs: Date.now() - started,
        remaining: await remaining(env, visitor.id),
      });
    } catch (error) {
      abort.abort();
      send("error", {
        error:
          error instanceof z.ZodError
            ? "The generated layout was invalid. Your previous workspace is preserved; please retry."
            : Date.now() - started >= 59000
              ? "Generation timed out. Please retry a smaller request."
              : error instanceof Error
                ? error.message
                : "Generation failed. Please retry.",
      });
    } finally {
      clearTimeout(timeout);
      await writes.catch(() => {});
      await writer.close().catch(() => {});
    }
  };
  ctx.waitUntil(run());
  return new Response(stream.readable, {
    headers: {
      ...security,
      "content-type": "application/x-ndjson; charset=utf-8",
      ...(visitor.cookie ? { "set-cookie": visitor.cookie } : {}),
    },
  });
}
export default {
  async fetch(request: Request, env: Env, ctx: Context) {
    try {
      return await handleRequest(request, env, ctx);
    } catch {
      return json(
        {
          error:
            "The demo is temporarily unavailable. Please try again shortly.",
        },
        503,
      );
    }
  },
};
