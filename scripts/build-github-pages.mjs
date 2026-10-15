import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository =
  (process.env.GITHUB_REPOSITORY || "").split("/").at(-1) ||
  "proof-label-review";
// Configure Pages supplies the correct path for both project sites and custom domains.
const configured = process.env.PAGES_CONFIGURED === "true";
const requested = configured
  ? process.env.PAGES_BASE_PATH || "/"
  : process.env.PAGES_BASE_PATH ||
    (repository.toLowerCase().endsWith(".github.io") ? "/" : `/${repository}/`);
const baseHref =
  "/" +
  requested.split("/").filter(Boolean).join("/") +
  (requested.split("/").filter(Boolean).length ? "/" : "");
if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(baseHref))
  throw new Error(
    "PAGES_BASE_PATH must be a simple URL path, such as /proof-label-review/.",
  );

for (const args of [
  [path.join(root, "scripts/copy-ocr-assets.mjs")],
  [
    path.join(root, "node_modules/@angular/cli/bin/ng.js"),
    "build",
    "--configuration",
    "production,github-pages",
    "--base-href",
    baseHref,
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`GitHub Pages artifact: dist-pages/ (base href: ${baseHref})`);
