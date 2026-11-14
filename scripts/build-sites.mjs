import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (!manifest.project_id) throw Error("Sites project_id is required.");
await build({
  entryPoints: ["apps/ephemeral/client.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  outfile: "apps/ephemeral/dist/client.js",
});
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await build({
  entryPoints: ["apps/ephemeral/hosted-worker.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outfile: "dist/server/index.js",
  loader: { ".html": "text", ".css": "text" },
  plugins: [
    {
      name: "client-text",
      setup(build) {
        build.onLoad(
          { filter: /apps\/ephemeral\/dist\/client\.js$/ },
          async (args) => ({
            contents: await readFile(args.path, "utf8"),
            loader: "text",
          }),
        );
      },
    },
  ],
});
await mkdir("dist/.openai", { recursive: true });
await writeFile(
  "dist/.openai/hosting.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
console.log("Built standalone Sites Worker and database migrations.");
