// Reusable browser integration check: real local WASM, synthetic clean artwork.
// Run: node scripts/copy-ocr-assets.mjs && node scripts/smoke-ocr.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "public", "ocr");
const allowedAssets = new Set(await readdir(assets));
const servedAssets = new Set();
const bundle = await build({
  entryPoints: [join(root, "src/lib/ocr.ts")],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/review/ocr-api.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(bundle.outputFiles[0].text);
    } else if (pathname.startsWith("/review/ocr/")) {
      const name = pathname.slice("/review/ocr/".length);
      if (!allowedAssets.has(name)) throw new Error("Unknown OCR asset");
      servedAssets.add(name);
      response.setHeader(
        "Content-Type",
        name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".wasm")
            ? "application/wasm"
            : "application/octet-stream",
      );
      response.end(await readFile(join(assets, name)));
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><html><head><base href="/review/"></head><body>OCR smoke test</body></html>',
      );
    }
  } catch (error) {
    response.statusCode = 404;
    response.end(String(error));
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.OCR_BROWSER_CHANNEL || "chrome",
  });
  const page = await browser.newPage();
  const pageErrors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith(`${origin}/`)
    )
      externalRequests.push(request.url());
  });
  await page.goto(`${origin}/review/`);
  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    logicalProcessors: navigator.hardwareConcurrency,
  }));
  const result = await page.evaluate(async () => {
    const api = await import("/review/ocr-api.js");
    const coldStart = performance.now();
    await api.warmOcr();
    const warmMs = Math.round(performance.now() - coldStart);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 1200, 800);
    context.fillStyle = "#111";
    const lines = [
      "STILL RIVER",
      "KENTUCKY STRAIGHT BOURBON WHISKEY",
      "45% ALC/VOL  750 mL",
      "DISTILLED AND BOTTLED BY STILL RIVER DISTILLING CO.",
      "FRANKFORT, KENTUCKY",
      "GOVERNMENT WARNING:",
      "(1) According to the Surgeon General, women should not drink",
      "alcoholic beverages during pregnancy because of the risk of birth defects.",
      "(2) Consumption of alcoholic beverages impairs your ability to drive",
      "a car or operate machinery, and may cause health problems.",
    ];
    lines.forEach((text, index) => {
      context.font =
        index === 0
          ? "bold 60px Arial"
          : index < 3
            ? "bold 34px Arial"
            : "24px Arial";
      context.fillText(text, 45, 90 + index * 62);
    });
    const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
    const file = new File([blob], "synthetic-clean-label.png", {
      type: "image/png",
    });
    const concurrent = await Promise.all(
      [1, 2, 3].map(() => api.recognizeLabel(file)),
    );
    await api.shutdownOcr();
    const restarted = await api.recognizeLabel(file);

    const large = document.createElement("canvas");
    large.width = 1800;
    large.height = 2400;
    const largeContext = large.getContext("2d");
    largeContext.fillStyle = "#fff";
    largeContext.fillRect(0, 0, 1800, 2400);
    largeContext.fillStyle = "#000";
    largeContext.font = "40px Arial";
    for (let row = 0; row < 35; row++)
      largeContext.fillText(
        "LABEL VERIFICATION GOVERNMENT WARNING 45% ALC/VOL",
        30,
        60 + row * 60,
      );
    const largeBlob = await new Promise((done) =>
      large.toBlob(done, "image/png"),
    );
    const largeFile = new File([largeBlob], "synthetic-dense-label.png", {
      type: "image/png",
    });
    const jobs = Promise.allSettled(
      [1, 2, 3].map(() => api.recognizeLabel(largeFile)),
    );
    await new Promise((done) => setTimeout(done, 10));
    await api.shutdownOcr();
    const cancelled = (await jobs).map((job) => ({
      status: job.status,
      error: job.reason?.message,
    }));
    let invalidError;
    try {
      await api.recognizeLabel(
        new File(["broken bytes"], "invalid.png", { type: "image/png" }),
      );
    } catch (error) {
      invalidError = error.message;
    }
    const recovered = await api.recognizeLabel(largeFile);
    await api.shutdownOcr();
    return {
      warmMs,
      concurrent,
      restarted,
      cancelled,
      invalidError,
      recovered: {
        confidence: recovered.confidence,
        durationMs: recovered.durationMs,
        textPrefix: recovered.text.slice(0, 70),
      },
    };
  });

  for (const label of [...result.concurrent, result.restarted]) {
    assert(
      label.confidence > 80,
      "Synthetic clean artwork should have high OCR confidence",
    );
    assert(
      label.text.includes("STILL RIVER") &&
        label.text.includes("45% ALC/VOL") &&
        label.text.includes("health problems."),
    );
  }
  assert(
    result.cancelled.every(
      (job) => job.status === "rejected" && job.error === "OCR was cancelled.",
    ),
  );
  assert(result.invalidError.includes("could not be decoded"));
  assert(result.recovered.textPrefix.includes("LABEL VERIFICATION"));
  assert.equal(pageErrors.length, 0, "No unhandled browser errors");
  assert.equal(
    externalRequests.length,
    0,
    "OCR must not request an external service or CDN",
  );
  assert(
    servedAssets.has("worker.min.js") && servedAssets.has("eng.traineddata.gz"),
  );
  assert(
    [...servedAssets].some(
      (name) => name.startsWith("tesseract-core") && name.endsWith(".wasm.js"),
    ),
  );
  console.log(
    JSON.stringify(
      {
        environment,
        servedAssets: [...servedAssets],
        result,
        pageErrors,
        externalRequests,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real OCR, two-worker queue, cancellation, corrupt-image recovery, restart, and subpath asset hosting.",
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
