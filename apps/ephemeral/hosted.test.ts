import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
await mkdir("artifacts/ephemeral", { recursive: true });
await build({
  entryPoints: ["apps/ephemeral/hosted-worker.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  outfile: "artifacts/ephemeral/test-worker.mjs",
  loader: { ".html": "text", ".css": "text" },
  plugins: [
    {
      name: "test-client-text",
      setup(build) {
        build.onResolve({ filter: /dist\/client\.js$/ }, (args) => ({
          path: args.path,
          namespace: "test-client",
        }));
        build.onLoad({ filter: /.*/, namespace: "test-client" }, () => ({
          contents: "// Browser asset served separately in UI tests",
          loader: "text",
        }));
      },
    },
  ],
});
const { handleRequest, visitorSession, reserveGeneration } = await import(
  pathToFileURL(resolve("artifacts/ephemeral/test-worker.mjs")).href
);
function database() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    sqlite,
    db: {
      prepare(sql: string) {
        let values: any[] = [];
        return {
          bind(...args: any[]) {
            values = args;
            return this;
          },
          async first() {
            return sqlite.prepare(sql).get(...values) ?? null;
          },
          async run() {
            const result = sqlite.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
    },
  };
}
const migration = await readFile(
  "drizzle/0000_marvelous_madripoor.sql",
  "utf8",
);
const repo = "f1shyfang/ephemeral-software-demo";
const empty = {
  layout: null,
  density: null,
  descriptions: null,
  groupBy: null,
};
const input = {
  prompt: "Show open issues",
  repository: repo,
  preferences: empty,
  previous: null,
  history: [],
  githubLogin: "",
};
const section = {
  title: "Open issues",
  layout: "table",
  density: "compact",
  descriptions: false,
  groupBy: "none",
  columns: ["title", "labels"],
  query: {
    kind: "issues",
    state: "open",
    labels: [],
    assignee: "",
    reviewRequested: false,
    text: "",
    sort: "updated",
  },
};
const plan = {
  title: "Issues",
  description: "Open issues from GitHub.",
  preferences: empty,
  sections: [section],
};
function request(
  path: string,
  body?: unknown,
  cookie?: string,
  origin = "https://demo.test",
) {
  return new Request("https://demo.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "content-type": "application/json", origin }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function environment() {
  const { sqlite, db } = database();
  sqlite.exec(migration);
  return {
    sqlite,
    env: {
      DB: db,
      SESSION_SECRET: "x".repeat(64),
      CEREBRAS_API_KEY: "test-shared-key",
      DAILY_GENERATION_LIMIT: "2",
      VISITOR_GENERATION_LIMIT: "1",
    },
  };
}
const context = () => {
  const jobs: Promise<unknown>[] = [];
  return {
    jobs,
    waitUntil(p: Promise<unknown>) {
      jobs.push(p);
    },
  };
};
test("visitor cookies are signed, distinct, expiring and cannot be forged", async () => {
  const a = await visitorSession(
      request("/api/status"),
      "secret",
      1700000000000,
    ),
    b = await visitorSession(request("/api/status"), "secret", 1700000000000);
  assert.notEqual(a.id, b.id);
  assert.match(a.cookie, /HttpOnly; Secure; SameSite=Lax/);
  const cookie = a.cookie.split(";")[0];
  assert.equal(
    (
      await visitorSession(
        request("/api/status", undefined, cookie),
        "secret",
        1700000000100,
      )
    ).id,
    a.id,
  );
  assert.notEqual(
    (
      await visitorSession(
        request("/api/status", undefined, cookie),
        "other-secret",
        1700000000100,
      )
    ).id,
    a.id,
  );
  assert.notEqual(
    (
      await visitorSession(
        request("/api/status", undefined, cookie),
        "secret",
        1700000000000 + 31 * 86400000,
      )
    ).id,
    a.id,
  );
});
test("durable allowance is atomic across concurrent reservations and separate visitors", async () => {
  const { sqlite, env } = environment();
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      reserveGeneration(env.DB, "one-visitor", 10, 3),
    ),
  );
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(await reserveGeneration(env.DB, "another-visitor", 4, 3), true);
  assert.equal(await reserveGeneration(env.DB, "third-visitor", 4, 3), false);
  sqlite.close();
});
test("public status creates an isolated visitor and never reveals provider secrets", async () => {
  const { sqlite, env } = environment(),
    ctx = context();
  const response = await handleRequest(request("/api/status"), env, ctx);
  const text = await response.text();
  const status = JSON.parse(text);
  assert.equal(status.hosted, true);
  assert.equal(status.cerebras, true);
  assert.equal(status.login, "");
  assert.equal(status.remaining, 1);
  assert.ok(response.headers.get("set-cookie"));
  assert.ok(!text.includes(env.CEREBRAS_API_KEY));
  const forbidden = await handleRequest(
    request("/api/connection", { key: "replacement", model: "replacement" }),
    env,
    ctx,
  );
  assert.equal(forbidden.status, 405);
  assert.equal(env.CEREBRAS_API_KEY, "test-shared-key");
  assert.equal(
    (
      await handleRequest(
        request("/api/generate", input, undefined, "https://untrusted.test"),
        env,
        ctx,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleRequest(
        request("/api/generate", { ...input, repository: "private/secret" }),
        env,
        ctx,
      )
    ).status,
    400,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM demo_generations").get()!.n,
    0,
  );
  sqlite.close();
});
test("two visitors stream independently, cache public GitHub data, and enforce durable shared limits", async () => {
  const { sqlite, env } = environment();
  const originalFetch = globalThis.fetch;
  let modelCalls = 0,
    githubCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.github.com")) {
      githubCalls++;
      assert.equal(
        (options?.headers as Record<string, string>).authorization,
        undefined,
      );
      if (String(url).includes("/labels"))
        return Response.json([{ name: "demo-data" }]);
      return Response.json({
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 1,
            title: "A real-shaped test record",
            state: "open",
            labels: [{ name: "demo-data" }],
            assignees: [],
            updated_at: "2026-11-14T00:00:00Z",
            body: "Test data",
          },
        ],
      });
    }
    assert.equal(String(url), "https://api.cerebras.ai/v1/chat/completions");
    assert.equal(
      (options?.headers as Record<string, string>).authorization,
      "Bearer test-shared-key",
    );
    modelCalls++;
    return new Response(
      "data: " +
        JSON.stringify({
          model: "test-cerebras",
          choices: [
            { delta: { content: JSON.stringify(plan) }, finish_reason: "stop" },
          ],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  };
  try {
    const c1 = context(),
      c2 = context();
    const status1 = await handleRequest(request("/api/status"), env, c1),
      status2 = await handleRequest(request("/api/status"), env, c2);
    const cookie1 = status1.headers.get("set-cookie")!.split(";")[0],
      cookie2 = status2.headers.get("set-cookie")!.split(";")[0];
    assert.notEqual(cookie1, cookie2);
    const response1 = await handleRequest(
      request("/api/generate", input, cookie1),
      env,
      c1,
    );
    const events1 = (await response1.text()).trim().split("\n").map(JSON.parse);
    await Promise.all(c1.jobs);
    const complete1 = events1.find((e: any) => e.type === "complete");
    assert.ok(complete1);
    assert.equal(complete1.sections[0].result.total, 1);
    assert.equal(complete1.remaining, 0);
    assert.ok(
      events1.findIndex((e: any) => e.type === "section") <
        events1.findIndex((e: any) => e.type === "data"),
    );
    assert.equal(
      (
        await handleRequest(
          request("/api/generate", input, cookie1),
          env,
          context(),
        )
      ).status,
      429,
    );
    const response2 = await handleRequest(
      request("/api/generate", input, cookie2),
      env,
      c2,
    );
    const events2 = (await response2.text()).trim().split("\n").map(JSON.parse);
    await Promise.all(c2.jobs);
    assert.ok(events2.find((e: any) => e.type === "complete"));
    assert.equal(modelCalls, 2);
    assert.equal(githubCalls, 2);
    assert.equal(
      (await handleRequest(request("/api/generate", input), env, context()))
        .status,
      429,
    );
    assert.ok(!JSON.stringify(events2).includes("test-shared-key"));
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
