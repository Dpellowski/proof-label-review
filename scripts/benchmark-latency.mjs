// Start a production preview first: npm run build && npm run preview
// Then run: node scripts/benchmark-latency.mjs
// Ten fresh browser contexts, then twenty real UI uploads with a warm worker.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { chromium } from "@playwright/test";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifacts = path.join(project, ".openai", "benchmarks");
await mkdir(artifacts, { recursive: true });
const samples = Papa.parse(
  await readFile(
    path.join(project, "public/samples/batch-template.csv"),
    "utf8",
  ),
  { header: true, skipEmptyLines: true },
).data;
const baseUrl = (process.env.PROOF_QA_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const origin = new URL(baseUrl).origin;
const browserChannel =
  process.env.PROOF_QA_BROWSER ||
  (process.platform === "win32" ? "msedge" : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(browserChannel ? { channel: browserChannel } : {}),
});
const report = {
  baseUrl,
  browser: browserChannel || "playwright chromium",
  fixture: "old-tom-bourbon.png",
  note: "Actual sample PNG uploaded through application UI. Synthetic flat artwork, not photographed bottle. Cold contexts have empty browser storage and no existing OCR worker; warm trials reuse one page and worker. Loopback networking and warm OS filesystem cache.",
  cold: [],
  warm: [],
  errors: [],
  externalRequests: [],
};
async function upload(page, row, name) {
  const started = performance.now();
  const countBefore = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("proof-review-v1") || "[]").filter(
        (row) => !row.sample,
      ).length,
  );
  await page
    .getByRole("button", { name: "New verification", exact: true })
    .click();
  const dialog = page.locator("dialog[open]");
  await dialog
    .locator("input[type=file]")
    .setInputFiles({
      name,
      mimeType: "image/png",
      buffer: await readFile(
        path.join(project, "public/samples", row.filename),
      ),
    });
  await dialog.getByLabel("Brand name").fill(row.brand);
  await dialog.getByLabel("Beverage category").selectOption(row.beverage);
  await dialog.getByLabel("Class / type").fill(row.classType);
  await dialog.getByLabel("Alcohol content (ABV)").fill(row.abv);
  await dialog.getByLabel("Net contents").fill(row.netContents);
  await dialog.getByLabel("Producer / bottler and address").fill(row.producer);
  if (row.imported === "true") {
    await dialog.getByLabel("Imported product").check();
    await dialog.getByLabel("Country of origin").fill(row.country);
  }
  const submitted = performance.now();
  await dialog
    .getByRole("button", { name: "Verify label", exact: true })
    .click();
  await page.waitForFunction(
    ({ name, countBefore }) => {
      const rows = JSON.parse(
        localStorage.getItem("proof-review-v1") || "[]",
      ).filter((row) => !row.sample);
      return (
        rows.length === countBefore + 1 &&
        rows.some(
          (row) =>
            row.filename === name &&
            (row.state === "ready" || row.state === "error"),
        )
      );
    },
    { name, countBefore },
    { timeout: 70000, polling: 50 },
  );
  const result = await page.evaluate(
    (name) =>
      JSON.parse(localStorage.getItem("proof-review-v1") || "[]").find(
        (row) => row.filename === name,
      ),
    name,
  );
  assert.equal(result.state, "ready", result.error);
  assert(result.text.length > 30, "Real OCR must return text");
  return {
    name,
    submissionToReadyMs: Math.round(performance.now() - submitted),
    dialogOpenToReadyMs: Math.round(performance.now() - started),
    durationMs: result.durationMs,
    confidence: result.confidence,
    textCharacters: result.text.length,
    fieldResults: result.result.checks.map((check) => ({
      key: check.key,
      status: check.status,
    })),
  };
}
async function makeContext() {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin)
      report.externalRequests.push(url);
  });
  await page.goto(baseUrl);
  await page
    .getByRole("heading", { name: "Label review, made clear.", exact: true })
    .waitFor();
  return { context, page };
}
function percentiles(rows, field) {
  const values = rows.map((row) => row[field]).sort((a, b) => a - b);
  return {
    count: values.length,
    min: values[0],
    p50: values[Math.ceil(values.length * 0.5) - 1],
    p95: values[Math.ceil(values.length * 0.95) - 1],
    max: values.at(-1),
  };
}
try {
  for (let index = 0; index < 10; index++) {
    const { context, page } = await makeContext();
    report.environment ||= await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      logicalProcessors: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory,
    }));
    const result = await upload(
      page,
      samples[0],
      `cold-${index + 1}-old-tom.png`,
    );
    report.cold.push(result);
    console.log(
      JSON.stringify({
        trial: "cold",
        index: index + 1,
        durationMs: result.durationMs,
        submissionToReadyMs: result.submissionToReadyMs,
      }),
    );
    await context.close();
  }
  const { context, page } = await makeContext();
  report.warmup = await upload(page, samples[0], "warmup-old-tom.png");
  for (let index = 0; index < 20; index++) {
    const result = await upload(
      page,
      samples[0],
      `warm-${index + 1}-old-tom.png`,
    );
    report.warm.push(result);
    console.log(
      JSON.stringify({
        trial: "warm",
        index: index + 1,
        durationMs: result.durationMs,
        submissionToReadyMs: result.submissionToReadyMs,
      }),
    );
  }
  report.summary = Object.fromEntries(
    ["cold", "warm"].map((key) => [
      key,
      {
        ocrMs: percentiles(report[key], "durationMs"),
        submissionToReadyMs: percentiles(report[key], "submissionToReadyMs"),
        dialogOpenToReadyMs: percentiles(report[key], "dialogOpenToReadyMs"),
      },
    ]),
  );
  await context.close();
  console.log(
    JSON.stringify({
      summary: report.summary,
      errors: report.errors,
      externalRequests: report.externalRequests,
    }),
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
} catch (error) {
  report.fatal = error.stack;
  throw error;
} finally {
  await writeFile(
    path.join(artifacts, "latency-report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
