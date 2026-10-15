// Exercises the built Angular application at a GitHub Pages project subpath.
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifact = path.join(root, "dist-pages");
const html = await readFile(path.join(artifact, "index.html"), "utf8");
const prefix = /<base href="([^"]+)"/.exec(html)?.[1];
assert(
  prefix?.startsWith("/") && prefix.endsWith("/"),
  "Build the Pages artifact first.",
);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".json": "application/json",
};
const missing = [];
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith(prefix)) throw Error("Outside project base path");
    let target = path.resolve(
      artifact,
      pathname.slice(prefix.length) || "index.html",
    );
    if (target !== artifact && !target.startsWith(artifact + path.sep))
      throw Error("Invalid path");
    if ((await stat(target)).isDirectory())
      target = path.join(target, "index.html");
    response.setHeader(
      "Content-Type",
      mime[path.extname(target)] || "application/octet-stream",
    );
    response.end(await readFile(target));
  } catch {
    missing.push(request.url);
    response.writeHead(404).end("Asset not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const channel = process.env.PROOF_QA_BROWSER || "msedge";
  browser = await chromium.launch({
    headless: true,
    ...(channel === "chromium" ? {} : { channel }),
  });
  const context = await browser.newContext();
  const external = [];
  const errors = [];
  const requests = [];
  context.on("request", (request) => {
    const url = request.url();
    requests.push(url);
    if (/^https?:/.test(url) && !url.startsWith(origin + "/"))
      external.push(url);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + prefix);
  await expect(
    page.getByRole("heading", {
      name: "Label review, made clear.",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".label-stage img").evaluate((img) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "New verification", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Upload labels and application details",
  });
  await dialog
    .locator("input[type=file]")
    .setInputFiles(path.join(root, "public/samples/old-tom-bourbon.png"));
  await dialog.getByLabel("Brand name").fill("Old Tom Distillery");
  await dialog
    .getByLabel("Class / type")
    .fill("Kentucky Straight Bourbon Whiskey");
  await dialog.getByLabel("Alcohol content (ABV)").fill("45%");
  await dialog.getByLabel("Net contents").fill("750 mL");
  await dialog
    .getByLabel("Producer / bottler and address")
    .fill("Old Tom Distillery, Bardstown, KY");
  await dialog
    .getByRole("button", { name: "Verify label", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("proof-review-v1") || "[]").find(
              (record) => !record.sample,
            )?.state,
        ),
      { timeout: 85000 },
    )
    .toBe("ready");
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("proof-review-v1")).find(
      (record) => !record.sample,
    ),
  );
  assert(
    record.text.length > 200,
    "The real OCR path should produce label text.",
  );
  assert.equal(
    record.result.checks.filter((check) => check.status === "mismatch").length,
    0,
  );
  await page.locator(".review-confirm input").check();
  await expect(
    page.getByRole("button", { name: "Approve label", exact: true }),
  ).toBeEnabled();
  assert(requests.some((url) => url.includes(prefix + "ocr/worker.min.js")));
  assert(
    requests.some((url) => url.includes(prefix + "ocr/eng.traineddata.gz")),
  );
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  console.log(
    JSON.stringify(
      {
        result: "pass",
        basePath: prefix,
        confidence: record.confidence,
        durationMs: record.durationMs,
        externalRequests: external,
        pageErrors: errors,
        missingAssets: missing,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: actual Angular Pages artifact, sample artwork, and real self-hosted OCR under a project subpath.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
