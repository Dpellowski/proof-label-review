// Start a production preview first: npm run build && npm run preview
// Then run: node scripts/benchmark-batch.mjs
// Uses real image uploads, real OCR workers, and the public application UI.
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
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
const baseUrl = (process.env.PROOF_QA_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const browserChannel =
  process.env.PROOF_QA_BROWSER ||
  (process.platform === "win32" ? "msedge" : undefined);
const origin = new URL(baseUrl).origin;
await mkdir(artifacts, { recursive: true });
// Keep the 300 generated PNGs and their application manifest outside the repo.
const inputDirectory = await mkdtemp(path.join(os.tmpdir(), "proof-batch-"));
let browser;
let context;
let page;
const errors = [];
const externalRequests = [];
const workers = [];
const report = {
  baseUrl,
  browser: browserChannel || "playwright chromium",
  count: 300,
  sixArtworkClones: true,
  observations: [],
  errors,
  externalRequests,
  workers,
};
try {
  const source = Papa.parse(
    await readFile(
      path.join(project, "public/samples/batch-template.csv"),
      "utf8",
    ),
    { header: true, skipEmptyLines: true },
  ).data;
  const rows = [];
  const paths = [];
  for (let index = 0; index < 300; index++) {
    const row = source[index % source.length];
    const filename = `${String(index + 1).padStart(3, "0")}-${row.filename}`;
    const destination = path.join(inputDirectory, filename);
    await copyFile(
      path.join(project, "public/samples", row.filename),
      destination,
    );
    rows.push({ ...row, filename });
    paths.push(destination);
  }
  const csvPath = path.join(inputDirectory, "batch-300.csv");
  await writeFile(csvPath, Papa.unparse(rows));

  browser = await chromium.launch({
    headless: true,
    ...(browserChannel ? { channel: browserChannel } : {}),
  });
  context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin)
      externalRequests.push(url);
  });
  await page.addInitScript(() => {
    window.__batchEvidence = {
      intervalMaxMs: 0,
      longTasks: [],
      progress: [],
      maxReading: 0,
    };
    let previous = performance.now();
    setInterval(() => {
      const now = performance.now();
      window.__batchEvidence.intervalMaxMs = Math.max(
        window.__batchEvidence.intervalMaxMs,
        now - previous,
      );
      previous = now;
      const items = Array.from(
        document.querySelectorAll(".review-item-status"),
      ).map((el) => el.textContent || "");
      window.__batchEvidence.maxReading = Math.max(
        window.__batchEvidence.maxReading,
        items.filter((text) => text.includes("Reading label")).length,
      );
      const progress = document.querySelector("progress");
      if (progress)
        window.__batchEvidence.progress.push({
          at: now,
          value: progress.value,
        });
    }, 100);
    try {
      new PerformanceObserver((list) => {
        window.__batchEvidence.longTasks.push(
          ...list
            .getEntries()
            .map((entry) => ({
              at: entry.startTime,
              duration: entry.duration,
            })),
        );
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  await page.goto(baseUrl);
  await page
    .getByRole("heading", { name: "Label review, made clear.", exact: true })
    .waitFor();
  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    logicalProcessors: navigator.hardwareConcurrency,
    deviceMemoryGiB: navigator.deviceMemory,
  }));
  await page.getByRole("button", { name: "Batch upload", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[type=file]").nth(0).setInputFiles(paths);
  await dialog.locator("input[type=file]").nth(1).setInputFiles(csvPath);
  await dialog
    .getByText("300 application rows ready", { exact: true })
    .waitFor();
  assert.equal(
    await dialog.getByText("300 images selected", { exact: true }).count(),
    1,
  );
  const started = performance.now();
  await dialog
    .getByRole("button", { name: "Verify 300 labels", exact: true })
    .click();
  report.submitUiMs = Math.round(performance.now() - started);
  let complete = false;
  let loops = 0;
  while (performance.now() - started < 15 * 60_000) {
    const observation = await page.evaluate(() => {
      const records = JSON.parse(
        localStorage.getItem("proof-review-v1") || "[]",
      ).filter((record) => !record.sample);
      const ready = records.filter((record) => record.state === "ready").length;
      const failed = records.filter(
        (record) => record.state === "error",
      ).length;
      const reading = Array.from(
        document.querySelectorAll(".review-item-status"),
      ).filter((el) => (el.textContent || "").includes("Reading label")).length;
      const queued = Array.from(
        document.querySelectorAll(".review-item-status"),
      ).filter((el) => (el.textContent || "").includes("Queued")).length;
      return {
        ready,
        failed,
        reading,
        queued,
        bytes: (localStorage.getItem("proof-review-v1") || "").length,
        rows: document.querySelectorAll(".review-item").length,
      };
    });
    observation.elapsedMs = Math.round(performance.now() - started);
    report.observations.push(observation);
    if (observation.ready > 0 && report.firstReadyMs === undefined)
      report.firstReadyMs = observation.elapsedMs;
    if (observation.ready >= 200 && report.twoHundredReadyMs === undefined)
      report.twoHundredReadyMs = observation.elapsedMs;
    if (loops % 5 === 0) {
      console.log(JSON.stringify({ progress: observation }));
      const before = performance.now();
      await page
        .getByLabel("Search labels", { exact: true })
        .fill("batch-no-match-probe");
      await page
        .getByRole("heading", { name: "No labels found.", exact: true })
        .waitFor();
      await page.getByLabel("Search labels", { exact: true }).fill("");
      await page.locator(".review-item").first().waitFor();
      (report.uiSearchRoundTripMs ||= []).push(
        Math.round(performance.now() - before),
      );
    }
    if (observation.ready + observation.failed === 300) {
      complete = true;
      break;
    }
    loops++;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  report.complete = complete;
  report.totalMs = Math.round(performance.now() - started);
  report.records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("proof-review-v1") || "[]").filter(
      (record) => !record.sample,
    ),
  );
  report.browserEvidence = await page.evaluate(() => window.__batchEvidence);
  const durations = report.records
    .map((record) => record.durationMs)
    .filter((value) => typeof value === "number")
    .sort((a, b) => a - b);
  report.perRecordMs = {
    min: durations[0],
    median: durations[Math.ceil(durations.length * 0.5) - 1],
    p95: durations[Math.ceil(durations.length * 0.95) - 1],
    max: durations.at(-1),
  };
  report.progressNonzero = report.browserEvidence.progress.some(
    (observation) => observation.value > 0.15 && observation.value < 1,
  );
  report.allRowsParsed = report.records.every((record, index) => {
    const expected = rows[index];
    return (
      record.filename === expected.filename &&
      record.text.length > 30 &&
      [
        "brand",
        "beverage",
        "classType",
        "abv",
        "netContents",
        "producer",
        "country",
      ].every((field) => record.application[field] === expected[field]) &&
      record.application.imported === (expected.imported === "true")
    );
  });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  const download = await downloadPromise;
  const exportPath = path.join(artifacts, download.suggestedFilename());
  await download.saveAs(exportPath);
  const exported = Papa.parse(await readFile(exportPath, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  report.export = {
    filename: download.suggestedFilename(),
    rows: exported.data.length,
    errors: exported.errors,
    uploadedRecords: new Set(
      exported.data
        .filter((row) =>
          paths.some((file) => path.basename(file) === row.filename),
        )
        .map((row) => row.filename),
    ).size,
    columns: exported.meta.fields,
  };
  await page.screenshot({
    path: path.join(artifacts, "batch-complete.png"),
    fullPage: true,
  });
  report.errors = errors;
  report.externalRequests = externalRequests;
  report.workers = workers;
  await writeFile(
    path.join(artifacts, "batch-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      complete: report.complete,
      totalMs: report.totalMs,
      firstReadyMs: report.firstReadyMs,
      twoHundredReadyMs: report.twoHundredReadyMs,
      perRecordMs: report.perRecordMs,
      maxReading: report.browserEvidence.maxReading,
      mainThreadMaxIntervalMs: report.browserEvidence.intervalMaxMs,
      allRowsParsed: report.allRowsParsed,
      export: report.export,
      errors,
      externalRequests,
      workers,
    }),
  );
  assert(complete, "300-image queue must complete");
  assert.equal(
    report.records.filter((record) => record.state === "ready").length,
    300,
  );
  assert(
    report.allRowsParsed,
    "All 300 actual image records must retain matching CSV metadata and OCR text",
  );
  assert.equal(
    report.browserEvidence.maxReading,
    2,
    "Two labels should process concurrently",
  );
  assert(report.progressNonzero, "Progress must advance before completion");
  assert(report.export.rows >= 306);
  assert.equal(report.export.uploadedRecords, 300);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
} catch (error) {
  report.fatal = error.stack;
  await writeFile(
    path.join(artifacts, "batch-report.json"),
    JSON.stringify(report, null, 2),
  );
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  // Only remove the exact directory created by mkdtemp under the OS temp root.
  const resolvedInput = path.resolve(inputDirectory);
  if (
    path.dirname(resolvedInput) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolvedInput).startsWith("proof-batch-")
  ) {
    throw new Error(
      "Refusing to remove a benchmark input directory outside the OS temp directory.",
    );
  }
  await rm(resolvedInput, { recursive: true, force: true });
}
