// Browser workflow regression suite. Start `npm run preview` first.
// Uses the installed Microsoft Edge browser; no browser download is required.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PROOF_QA_URL || "http://127.0.0.1:4173";
const channel = process.env.PROOF_QA_BROWSER || "msedge";
const artifacts = path.resolve(".openai");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
});
const page = await context.newPage();
const errors = [];
const findings = [];
page.on("pageerror", (error) => errors.push(error.message));
const records = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("proof-review-v1") || "[]"),
  );
const inspector = () => page.locator(".inspector");
const approve = () =>
  inspector().getByRole("button", { name: "Approve label", exact: true });
const typography = () =>
  inspector().locator('.review-confirm input[type="checkbox"]');
const selectLabel = (name) =>
  page.locator(".review-item").filter({ hasText: name }).last().click();
const clear = async () => {
  await page
    .getByRole("button", { name: "Clear local history", exact: true })
    .click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(page.locator(".review-item")).toHaveCount(6);
};
async function check(name, operation) {
  try {
    const detail = await operation();
    findings.push({ name, result: "pass", ...(detail ? { detail } : {}) });
    console.log(`PASS ${name}${detail ? ": " + JSON.stringify(detail) : ""}`);
  } catch (error) {
    findings.push({ name, result: "fail", error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    await page.screenshot({
      path: path.join(artifacts, `qa-failed-${findings.length}.png`),
      fullPage: true,
    });
  }
}

try {
  await page.goto(baseUrl);
  await expect(
    page.getByRole("heading", {
      name: "Label review, made clear.",
      exact: true,
    }),
  ).toBeVisible();

  await check(
    "Approval is gated by the visual typography confirmation",
    async () => {
      await expect(approve()).toBeDisabled();
      await typography().check();
      await expect(approve()).toBeEnabled();
      await approve().click();
      await expect(inspector().locator(".decision-saved")).toContainText(
        "Review approved",
      );
      assert.equal(
        (await records()).find((r) => r.id === "old-tom").decision,
        "approved",
      );
    },
  );

  await check(
    "Approval persists across reload and can be reopened from history",
    async () => {
      await page.reload();
      await expect(inspector().locator(".decision-saved")).toContainText(
        "Review approved",
      );
      await page
        .locator("nav")
        .getByRole("button", { name: "Review history", exact: true })
        .click();
      await expect(page.locator(".review-item")).toHaveCount(1);
      await inspector()
        .getByRole("button", { name: "Reopen review", exact: true })
        .click();
      assert.equal(
        (await records()).find((r) => r.id === "old-tom").decision,
        null,
      );
      await page
        .locator("nav")
        .getByRole("button", { name: /^Review queue/ })
        .click();
    },
  );

  await check(
    "An ABV mismatch remains blocked after confirming typography",
    async () => {
      await selectLabel("Maison Lucette");
      await typography().check();
      await expect(approve()).toBeDisabled();
      await expect(inspector().locator(".field-flagged")).toContainText("13%");
      await expect(inspector().locator(".field-flagged")).toContainText(
        "12.5%",
      );
    },
  );

  await check(
    "Change requests require notes, persist, and reopen",
    async () => {
      await inspector()
        .getByRole("button", { name: "Request changes", exact: true })
        .click();
      const dialog = page.locator("dialog[open]");
      await dialog.getByRole("button", { name: "Save change request" }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Add a short reason",
      );
      const note =
        "The label shows 12.5% ABV; the application declares 13%. Please reconcile them.";
      await dialog.getByLabel("Reviewer notes").fill(note);
      await dialog.getByRole("button", { name: "Save change request" }).click();
      await expect(inspector().locator(".decision-saved")).toContainText(note);
      await page.reload();
      await selectLabel("Maison Lucette");
      await expect(inspector().locator(".decision-saved")).toContainText(note);
      await inspector()
        .getByRole("button", { name: "Reopen review", exact: true })
        .click();
      assert.equal(
        (await records()).find((r) => r.id === "maison-lucette").decision,
        null,
      );
    },
  );

  await check(
    "Single image upload performs real OCR and saves measured output",
    async () => {
      await page
        .getByRole("button", { name: "New verification", exact: true })
        .click();
      const dialog = page.locator("dialog[open]");
      await dialog
        .locator('input[type="file"]')
        .setInputFiles("public/samples/old-tom-bourbon.png");
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
          async () => {
            const uploaded = (await records()).find((r) => !r.sample);
            return uploaded?.state;
          },
          { timeout: 85_000, intervals: [250, 500, 1000] },
        )
        .toBe("ready");
      const uploaded = (await records()).find((r) => !r.sample);
      assert(
        uploaded.text.length > 200,
        "OCR should extract actual label content",
      );
      assert(
        /old\s+tom/i.test(uploaded.text),
        "OCR should recognize the brand",
      );
      assert(
        uploaded.confidence > 0,
        "OCR confidence should come from the recognizer",
      );
      assert(uploaded.durationMs > 0, "OCR duration should be measured");
      assert.deepEqual(
        uploaded.result.checks.filter((check) => check.status === "mismatch"),
        [],
        "The clear Old Tom test image should match its application",
      );
      await typography().check();
      await expect(approve()).toBeEnabled();
      await writeFile(
        path.join(artifacts, "qa-single-ocr.json"),
        JSON.stringify(uploaded, null, 2),
      );
      await page.reload();
      await expect(inspector().locator(".missing-artwork")).toContainText(
        "Original image not retained",
      );
      await expect(approve()).toBeDisabled();
      return {
        confidence: uploaded.confidence,
        durationMs: uploaded.durationMs,
        status: uploaded.result.status,
        characters: uploaded.text.length,
      };
    },
  );

  await check(
    "Batch CSV maps all six PNG filenames to their application data",
    async () => {
      await clear();
      await page
        .getByRole("button", { name: "Batch upload", exact: true })
        .click();
      const dialog = page.locator("dialog[open]");
      const names = [
        "old-tom-bourbon",
        "stones-throw-gin",
        "maison-lucette-wine",
        "pacific-standard-beer",
        "amber-field-wine",
        "costa-azul-tequila",
      ];
      await dialog
        .locator('input[type="file"]')
        .nth(0)
        .setInputFiles(names.map((name) => `public/samples/${name}.png`));
      await dialog
        .locator('input[type="file"]')
        .nth(1)
        .setInputFiles("public/samples/batch-template.csv");
      await expect(dialog.locator(".csv-picker")).toContainText(
        "6 application rows ready",
      );
      await dialog
        .getByRole("button", { name: "Verify 6 labels", exact: true })
        .click();
      await expect(page.locator(".review-item")).toHaveCount(12);
      await expect
        .poll(
          async () => {
            const rows = (await records()).filter((r) => !r.sample);
            return rows.length === 6 && rows.every((r) => r.state === "ready");
          },
          { timeout: 150_000, intervals: [500, 1000] },
        )
        .toBe(true);
      const uploaded = (await records()).filter((r) => !r.sample);
      await writeFile(
        path.join(artifacts, "qa-batch-ocr.json"),
        JSON.stringify(uploaded, null, 2),
      );
      for (const name of names)
        assert(
          uploaded.some(
            (r) =>
              r.filename === name + ".png" &&
              r.application.brand &&
              r.text.length > 30,
          ),
        );
      assert.equal(
        uploaded.find((r) => r.filename === "maison-lucette-wine.png")
          .application.abv,
        "13%",
      );
      assert.equal(
        uploaded.find((r) => r.filename === "costa-azul-tequila.png")
          .application.country,
        "Mexico",
      );
      return uploaded.map((r) => ({
        file: r.filename,
        durationMs: r.durationMs,
        confidence: r.confidence,
        status: r.result.status,
        mismatches: r.result.checks
          .filter((c) => c.status === "mismatch")
          .map((c) => c.key),
      }));
    },
  );

  await check(
    "Clearing local history removes uploads and decisions",
    async () => {
      await clear();
      assert((await records()).every((r) => r.sample && !r.decision));
      await page.reload();
      assert.equal((await records()).length, 6);
      assert((await records()).every((r) => r.sample && !r.decision));
    },
  );

  await check(
    "Desktop landmarks, form labels, and keyboard focus are accessible",
    async () => {
      assert.equal(await page.getByRole("main").count(), 1);
      assert.equal(
        await page.getByRole("navigation", { name: "Main navigation" }).count(),
        1,
      );
      await page
        .getByRole("button", { name: "New verification", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      const dialog = page.locator("dialog[open]");
      await expect(dialog).toBeVisible();
      for (const label of [
        "Brand name",
        "Beverage category",
        "Class / type",
        "Alcohol content (ABV)",
        "Net contents",
        "Producer / bottler and address",
        "Imported product",
      ]) {
        assert.equal(
          await dialog.getByLabel(label, { exact: false }).count(),
          1,
          label + " must have an accessible label",
        );
      }
      await dialog.getByLabel("Imported product").check();
      await expect(dialog.getByLabel("Country of origin")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "New verification", exact: true }),
      ).toBeFocused();
    },
  );

  await page.screenshot({
    path: path.join(artifacts, "qa-desktop.png"),
    fullPage: true,
  });
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(baseUrl);
  await mobile
    .getByRole("heading", { name: "Label review, made clear.", exact: true })
    .waitFor();
  await check(
    "Mobile page fits the viewport and navigation starts closed",
    async () => {
      await expect
        .poll(
          () =>
            mobile
              .locator(".sidebar")
              .evaluate((element) => element.getBoundingClientRect().right),
          { timeout: 3000 },
        )
        .toBeLessThanOrEqual(0.1);
      const layout = await mobile.evaluate(() => {
        const side = document.querySelector(".sidebar").getBoundingClientRect();
        return {
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          sidebarRight: side.right,
        };
      });
      assert(
        layout.scroll <= layout.width,
        "Mobile layout must not overflow horizontally",
      );
      assert(
        layout.sidebarRight <= 0,
        "Mobile sidebar must not cover page content by default",
      );
      await expect(
        mobile.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeVisible({ timeout: 3000 });
      await mobile.keyboard.press("Tab");
      await expect(
        mobile.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeFocused();
      await mobile
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await expect(
        mobile.getByRole("button", { name: "Close navigation", exact: true }),
      ).toBeVisible();
      await mobile
        .locator("nav")
        .getByRole("button", { name: "Review guide", exact: true })
        .click();
      await expect(
        mobile.getByRole("heading", {
          name: "A little guidance. A clearer review.",
          exact: true,
        }),
      ).toBeVisible();
      await mobile
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await mobile
        .locator("nav")
        .getByRole("button", { name: /^Review queue/ })
        .click();
      await expect
        .poll(
          () =>
            mobile
              .locator(".sidebar")
              .evaluate((element) => element.getBoundingClientRect().right),
          { timeout: 3000 },
        )
        .toBeLessThanOrEqual(0.1);
      return layout;
    },
  );
  await mobile.screenshot({
    path: path.join(artifacts, "qa-mobile.png"),
    fullPage: true,
  });
  await mobile.close();
  await check(
    "Browser console has no uncaught application errors",
    async () => {
      assert.deepEqual(errors, []);
    },
  );
  await writeFile(
    path.join(artifacts, "qa-report.json"),
    JSON.stringify({ baseUrl, browser: channel, findings, errors }, null, 2),
  );
} finally {
  await context.close();
  await browser.close();
}
if (findings.some((result) => result.result === "fail")) process.exitCode = 1;
