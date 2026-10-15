// Requirement-focused browser regressions. Run against a built, running preview.
// Each case has an isolated browser context; uploaded images use the real OCR engine.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

const baseUrl = process.env.PROOF_QA_URL || "http://127.0.0.1:4173";
const channel = process.env.PROOF_QA_BROWSER || "msedge";
const artifacts = path.resolve(".openai");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel });
const findings = [];
const samplePath = "public/samples/old-tom-bourbon.png";
const uploadedRows = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("proof-review-v1") || "[]").filter(
      (record) => !record.sample,
    ),
  );
const storedRows = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("proof-review-v1") || "[]"),
  );
const inspector = (page) => page.locator(".inspector");
const typography = (page) =>
  inspector(page).locator('.review-confirm input[type="checkbox"]');
const uploadDialog = (page) =>
  page.getByRole("dialog", {
    name: "Upload labels and application details",
    exact: true,
  });
const application = {
  brand: "Old Tom Distillery",
  beverage: "spirits",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: "45%",
  netContents: "750 mL",
  producer: "Old Tom Distillery, Bardstown, KY",
  country: "United States",
  imported: "false",
};

async function fillApplication(dialog) {
  await dialog.getByLabel("Brand name").fill(application.brand);
  await dialog.getByLabel("Class / type").fill(application.classType);
  await dialog.getByLabel("Alcohol content (ABV)").fill(application.abv);
  await dialog.getByLabel("Net contents").fill(application.netContents);
  await dialog
    .getByLabel("Producer / bottler and address")
    .fill(application.producer);
}

async function uploadOne(page, file) {
  await page
    .getByRole("button", { name: "New verification", exact: true })
    .click();
  const dialog = uploadDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await fillApplication(dialog);
  await dialog
    .getByRole("button", { name: "Verify label", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await uploadedRows(page))[0]?.state, {
      timeout: 85_000,
      intervals: [100, 250, 500],
    })
    .toMatch(/^(ready|error)$/);
  return (await uploadedRows(page))[0];
}

async function startBatch(page, files = [samplePath]) {
  await page.getByRole("button", { name: "Batch upload", exact: true }).click();
  const dialog = uploadDialog(page);
  await dialog.locator('input[type="file"]').nth(0).setInputFiles(files);
  return dialog;
}

async function replaceArtwork(page, name = "Replace artwork") {
  const pickerEvent = page.waitForEvent("filechooser");
  await inspector(page)
    .getByRole("button", { name, exact: true })
    .last()
    .click();
  await (await pickerEvent).setFiles(samplePath);
}

async function artworkVariant(page, mimeType, transformed = false) {
  const data = await page.evaluate(
    async ({ mimeType, transformed }) => {
      const source = new Image();
      source.src = new URL(
        "samples/old-tom-bourbon.png",
        document.baseURI,
      ).href;
      await source.decode();
      const radians = transformed ? (8 * Math.PI) / 180 : 0;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(
        source.naturalWidth * Math.cos(radians) +
          source.naturalHeight * Math.sin(radians),
      );
      canvas.height = Math.ceil(
        source.naturalHeight * Math.cos(radians) +
          source.naturalWidth * Math.sin(radians),
      );
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(radians);
      context.drawImage(
        source,
        -source.naturalWidth / 2,
        -source.naturalHeight / 2,
      );
      context.restore();
      if (transformed) {
        context.fillStyle = "rgba(0, 0, 0, 0.18)";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      return {
        url: canvas.toDataURL(mimeType, 0.96),
        width: canvas.width,
        height: canvas.height,
      };
    },
    { mimeType, transformed },
  );
  assert(
    data.url.startsWith(`data:${mimeType};base64,`),
    `Browser must encode real ${mimeType} pixels`,
  );
  return {
    buffer: Buffer.from(data.url.split(",")[1], "base64"),
    width: data.width,
    height: data.height,
  };
}

async function chooseCsv(dialog, rows, headers) {
  const csv = headers
    ? Papa.unparse({
        fields: headers,
        data: rows.map((row) => headers.map((key) => row[key])),
      })
    : Papa.unparse(rows);
  await dialog
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({
      name: "applications.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
}

async function check(name, operation) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(baseUrl);
    await expect(
      page.getByRole("heading", {
        name: "Label review, made clear.",
        exact: true,
      }),
    ).toBeVisible();
    const detail = await operation(page);
    assert.deepEqual(errors, [], "No uncaught browser application errors");
    findings.push({ name, result: "pass", ...(detail ? { detail } : {}) });
    console.log(`PASS ${name}${detail ? ": " + JSON.stringify(detail) : ""}`);
  } catch (error) {
    findings.push({
      name,
      result: "fail",
      error: error.message,
      browserErrors: errors,
    });
    console.error(`FAIL ${name}: ${error.message}`);
    await page
      .screenshot({
        path: path.join(artifacts, `use-case-failed-${findings.length}.png`),
        fullPage: true,
      })
      .catch(() => undefined);
  } finally {
    await context.close();
  }
}

try {
  await check(
    "Case and apostrophe differences match without a manual override",
    async (page) => {
      await page.locator(".review-item").filter({ hasText: "Stone" }).click();
      const brand = inspector(page)
        .locator(".field-check")
        .filter({ hasText: "Brand name" });
      await expect(brand).not.toHaveClass(/field-flagged/);
      await expect(brand).toContainText("STONE'S THROW");
      await expect(
        inspector(page).getByRole("button", {
          name: "Approve label",
          exact: true,
        }),
      ).toBeDisabled();
      await typography(page).check();
      await expect(
        inspector(page).getByRole("button", {
          name: "Approve label",
          exact: true,
        }),
      ).toBeEnabled();
    },
  );

  for (const format of [
    { extension: "jpg", mimeType: "image/jpeg", name: "JPEG" },
    { extension: "webp", mimeType: "image/webp", name: "WebP" },
  ]) {
    await check(
      `${format.name} artwork is accepted and recognized through the real upload workflow`,
      async (page) => {
        const fixture = await artworkVariant(page, format.mimeType);
        if (format.extension === "jpg") {
          assert.equal(
            fixture.buffer.readUInt16BE(0),
            0xffd8,
            "Fixture must have a JPEG signature",
          );
        } else {
          assert.equal(fixture.buffer.subarray(0, 4).toString(), "RIFF");
          assert.equal(fixture.buffer.subarray(8, 12).toString(), "WEBP");
        }
        const row = await uploadOne(page, {
          name: `old-tom-bourbon.${format.extension}`,
          mimeType: format.mimeType,
          buffer: fixture.buffer,
        });
        assert.equal(row.state, "ready");
        assert(
          row.text.length > 200,
          "A real transcription should include multiple label fields and the warning",
        );
        assert.match(
          row.text,
          /old\s+tom/i,
          "OCR must recognize the brand from this encoded format",
        );
        assert(
          row.confidence > 0 && row.confidence <= 100,
          "Confidence must be measured by OCR",
        );
        assert(row.durationMs > 0, "Duration must be measured by OCR");
        assert.equal(row.boldConfirmed, false);
        assert.equal(row.decision, null);
        await expect(
          inspector(page).getByRole("button", {
            name: "Approve label",
            exact: true,
          }),
        ).toBeDisabled();
        return {
          format: format.name,
          width: fixture.width,
          height: fixture.height,
          bytes: fixture.buffer.length,
          confidence: row.confidence,
          durationMs: row.durationMs,
          automatedStatus: row.result.status,
        };
      },
    );
  }

  await check(
    "Rotated and dim artwork finishes with reviewable results or a recoverable image error",
    async (page) => {
      const fixture = await artworkVariant(page, "image/png", true);
      const row = await uploadOne(page, {
        name: "old-tom-rotated-dim.png",
        mimeType: "image/png",
        buffer: fixture.buffer,
      });
      assert.equal(row.decision, null);
      assert.equal(row.boldConfirmed, false);
      assert(row.durationMs > 0 || row.state === "error");
      await expect(
        inspector(page).getByRole("button", {
          name: "Approve label",
          exact: true,
        }),
      ).toBeDisabled();
      if (row.state === "ready") {
        assert(row.text.length > 0);
        assert(row.result?.checks.length > 0);
        assert.notEqual(
          row.result.status,
          "matched",
          "The visual warning check must remain open",
        );
      } else {
        assert.equal(row.state, "error");
        assert(row.error);
        await expect(inspector(page).locator(".error-state")).toBeVisible();
        await expect(
          inspector(page)
            .locator(".error-state")
            .getByRole("button", { name: "Replace artwork", exact: true }),
        ).toBeEnabled();
        await expect(
          inspector(page).getByRole("button", {
            name: "Request changes",
            exact: true,
          }),
        ).toBeEnabled();
      }
      return {
        transformation: "8-degree rotation and 18% black overlay",
        state: row.state,
        confidence: row.confidence,
        durationMs: row.durationMs,
        automatedStatus: row.result?.status || "unreadable",
        decision: row.decision,
      };
    },
  );

  await check(
    "Corrupt artwork can be returned with a required reason and replaced on the same review",
    async (page) => {
      const row = await uploadOne(page, {
        name: "corrupt.png",
        mimeType: "image/png",
        buffer: Buffer.from("This is deliberately not an image."),
      });
      assert.equal(row.state, "error");
      await expect(inspector(page).locator(".error-state")).toBeVisible();
      const request = inspector(page).getByRole("button", {
        name: "Request changes",
        exact: true,
      });
      await expect(request).toBeEnabled();
      await request.click();
      const dialog = page.getByRole("dialog", {
        name: "Request label changes",
        exact: true,
      });
      await dialog
        .getByRole("button", { name: "Save change request", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Add a short reason",
      );
      const reason =
        "The artwork cannot be read. Please provide a sharp image of every label panel.";
      await dialog.getByLabel("Reviewer notes").fill(reason);
      await dialog
        .getByRole("button", { name: "Save change request", exact: true })
        .click();
      await expect(inspector(page).locator(".decision-saved")).toContainText(
        reason,
      );
      await inspector(page)
        .getByRole("button", { name: "Reopen review", exact: true })
        .click();
      await replaceArtwork(page);
      await expect
        .poll(async () => (await uploadedRows(page))[0]?.state, {
          timeout: 85_000,
        })
        .toBe("ready");
      const replaced = (await uploadedRows(page))[0];
      assert.equal(replaced.id, row.id);
      assert.deepEqual(replaced.application, row.application);
      assert.equal(replaced.createdAt, row.createdAt);
      assert.equal(replaced.filename, "old-tom-bourbon.png");
      assert.equal(replaced.decision, null);
      assert.equal(replaced.boldConfirmed, false);
      assert.equal((await uploadedRows(page)).length, 1);
      assert.match(replaced.text, /old\s+tom/i);
      return {
        originalState: row.state,
        replacementState: replaced.state,
        recordPreserved: true,
      };
    },
  );

  await check(
    "A valid blank PNG is reported as unreadable and can request a clearer image",
    async (page) => {
      const blank = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 800;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      const row = await uploadOne(page, {
        name: "blank.png",
        mimeType: "image/png",
        buffer: Buffer.from(blank, "base64"),
      });
      assert.equal(row.state, "error");
      assert.equal(row.text, "");
      assert.equal(row.result, undefined);
      await expect(inspector(page).locator(".error-state")).toContainText(
        "No readable text was found",
      );
      await expect(
        inspector(page).getByRole("button", {
          name: "Request changes",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(
        inspector(page).getByRole("button", {
          name: "Approve label",
          exact: true,
        }),
      ).toBeDisabled();
      return {
        state: row.state,
        confidence: row.confidence,
        comparisonsCreated: false,
      };
    },
  );

  await check(
    "Reloaded artwork can be restored without repeating application entry or retaining its old approval",
    async (page) => {
      const row = await uploadOne(page, samplePath);
      assert.equal(row.state, "ready");
      await typography(page).check();
      await inspector(page)
        .getByRole("button", { name: "Approve label", exact: true })
        .click();
      await expect(inspector(page).locator(".decision-saved")).toContainText(
        "Review approved",
      );
      await page.reload();
      await expect(inspector(page).locator(".missing-artwork")).toBeVisible();
      await expect(
        inspector(page).getByRole("button", {
          name: "Restore artwork",
          exact: true,
        }),
      ).toBeVisible();
      await replaceArtwork(page, "Restore artwork");
      await expect
        .poll(async () => (await uploadedRows(page))[0]?.state, {
          timeout: 85_000,
        })
        .toBe("ready");
      const restored = (await uploadedRows(page))[0];
      assert.equal(restored.id, row.id);
      assert.deepEqual(restored.application, row.application);
      assert.equal(restored.createdAt, row.createdAt);
      assert.equal(restored.decision, null);
      assert.equal(restored.boldConfirmed, false);
      assert.equal((await uploadedRows(page)).length, 1);
      await expect(typography(page)).not.toBeChecked();
      await expect(
        inspector(page).getByRole("button", {
          name: "Approve label",
          exact: true,
        }),
      ).toBeDisabled();
    },
  );

  await check(
    "Explicit manual review records a reason and confirmation while preserving OCR flags in history and CSV",
    async (page) => {
      // This is an explicit UI-state fixture: the real sample artwork says 45%.
      // Seeding a 40% OCR transcription tests human correction of false OCR flags,
      // rather than claiming that a recognizer produced this particular error.
      await typography(page).check();
      await page.evaluate(() => {
        const rows = JSON.parse(localStorage.getItem("proof-review-v1"));
        const row = rows.find((record) => record.id === "old-tom");
        row.text = row.text.replace(
          "45% Alc./Vol. (90 Proof)",
          "40% Alc./Vol. (80 Proof)",
        );
        row.confidence = 65;
        row.boldConfirmed = false;
        row.decision = null;
        row.notes = "";
        delete row.manualReview;
        localStorage.setItem("proof-review-v1", JSON.stringify(rows));
      });
      await page.reload();
      const manual = inspector(page).getByRole("button", {
        name: "Record manual approval",
        exact: true,
      });
      await expect(manual).toBeDisabled();
      await typography(page).check();
      await expect(manual).toBeEnabled();
      await manual.click();
      const dialog = page.getByRole("dialog", {
        name: "Record manual approval",
        exact: true,
      });
      const save = dialog.getByRole("button", {
        name: "Save manual approval",
        exact: true,
      });
      await expect(save).toBeDisabled();
      await dialog.getByLabel(/^I verified every application field/).check();
      await save.click();
      await expect(dialog.getByRole("alert")).toContainText(
        /Explain how|reason/i,
      );
      const reason =
        "The image shows 45% ABV and 90 proof. I verified every application field and the complete warning against the artwork; OCR misread the alcohol declaration.";
      await dialog.getByLabel("Reason for manual approval").fill(reason);
      await save.click();
      await expect(inspector(page).locator(".decision-saved")).toContainText(
        "Manually approved",
      );
      await expect(inspector(page).locator(".decision-saved")).toContainText(
        reason,
      );
      const row = (await storedRows(page)).find(
        (record) => record.id === "old-tom",
      );
      assert.equal(row.decision, "approved");
      assert.equal(row.result.status, "flagged");
      assert.equal(
        row.result.checks.find((field) => field.key === "abv").status,
        "mismatch",
      );
      assert.equal(row.manualReview.reason, reason);
      assert.equal(row.manualReview.confirmedAllFields, true);
      assert.equal(row.manualReview.automatedStatus, "flagged");
      await page.reload();
      await expect(inspector(page).locator(".decision-saved")).toContainText(
        "Manually approved",
      );
      await expect(inspector(page).locator(".decision-saved")).toContainText(
        reason,
      );
      const downloadEvent = page.waitForEvent("download");
      await inspector(page)
        .getByRole("button", {
          name: "Export selected label review",
          exact: true,
        })
        .click();
      const download = await downloadEvent;
      const exported = Papa.parse(
        await readFile(await download.path(), "utf8"),
        { header: true, skipEmptyLines: true },
      );
      assert.equal(exported.errors.length, 0);
      assert(exported.data.length > 0);
      for (const field of exported.data) {
        assert.equal(field.manualReviewReason, reason);
        assert.equal(field.manualReviewConfirmed, "true");
        assert.equal(field.automatedStatus, "flagged");
      }
      assert(exported.data.some((field) => field.fieldResult === "mismatch"));
      await inspector(page)
        .getByRole("button", { name: "Reopen review", exact: true })
        .click();
      const reopened = (await storedRows(page)).find(
        (record) => record.id === "old-tom",
      );
      assert.equal(reopened.decision, null);
      assert.equal(reopened.manualReview, undefined);
      assert.equal(reopened.result.status, "flagged");
      return {
        fixture: "seeded OCR error; actual artwork unchanged",
        automatedStatus: row.result.status,
        manualApprovalPersisted: true,
      };
    },
  );

  await check(
    "Unsupported image formats give a recoverable upload error",
    async (page) => {
      await page
        .getByRole("button", { name: "New verification", exact: true })
        .click();
      const dialog = uploadDialog(page);
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "label.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7"),
      });
      await expect(dialog.getByRole("alert")).toContainText(
        "Choose JPG, PNG or WebP",
      );
      await expect(
        dialog.getByRole("button", { name: "Verify label", exact: true }),
      ).toBeDisabled();
      await dialog.locator('input[type="file"]').setInputFiles(samplePath);
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Verify label", exact: true }),
      ).toBeEnabled();
    },
  );

  await check(
    "Duplicate image filenames are rejected before batch processing",
    async (page) => {
      const dialog = await startBatch(page, [
        { name: "same.png", mimeType: "image/png", buffer: Buffer.from("one") },
        { name: "same.png", mimeType: "image/png", buffer: Buffer.from("two") },
      ]);
      await expect(dialog.getByRole("alert")).toContainText(
        "filenames must be unique",
      );
      await expect(
        dialog.getByRole("button", { name: /Verify .* labels/ }),
      ).toBeDisabled();
      assert.equal((await uploadedRows(page)).length, 0);
    },
  );

  await check(
    "A 301-image batch is rejected with the documented 300-image limit",
    async (page) => {
      const files = Array.from({ length: 301 }, (_, index) => ({
        name: `label-${index}.png`,
        mimeType: "image/png",
        buffer: Buffer.from("placeholder; never submitted to OCR"),
      }));
      const dialog = await startBatch(page, files);
      await expect(dialog.getByRole("alert")).toContainText("300 images");
      await expect(
        dialog.getByRole("button", { name: /Verify .* labels/ }),
      ).toBeDisabled();
      assert.equal((await uploadedRows(page)).length, 0);
    },
  );

  const invalidCsvCases = [
    {
      name: "Batch CSV without a filename column is rejected",
      rows: [{ ...application, filename: "old-tom-bourbon.png" }],
      headers: Object.keys(application),
      immediate: true,
      expected: /CSV columns must match the template/,
    },
    {
      name: "Every uploaded image requires a matching CSV filename",
      rows: [{ filename: "another-label.png", ...application }],
      expected: /No application CSV row found for old-tom-bourbon.png/,
    },
    {
      name: "Imported batches require a nonempty country of origin",
      rows: [
        {
          filename: "old-tom-bourbon.png",
          ...application,
          imported: "true",
          country: "",
        },
      ],
      expected: /old-tom-bourbon.png.*country of origin/,
    },
    {
      name: "Batch imported flags must explicitly be true or false",
      rows: [
        {
          filename: "old-tom-bourbon.png",
          ...application,
          imported: "sometimes",
        },
      ],
      expected: /imported column must be true or false/,
    },
    {
      name: "Duplicate application filenames are rejected in the CSV",
      rows: [
        { filename: "old-tom-bourbon.png", ...application },
        { filename: "OLD-TOM-BOURBON.PNG", ...application },
      ],
      immediate: true,
      expected: /CSV filenames must be unique/,
    },
    {
      name: "Extra CSV application rows cannot silently lose their labels",
      rows: [
        { filename: "old-tom-bourbon.png", ...application },
        { filename: "not-uploaded.png", ...application },
      ],
      expected: /exactly one image for each CSV row/,
    },
  ];
  for (const fixture of invalidCsvCases) {
    await check(fixture.name, async (page) => {
      const dialog = await startBatch(page);
      await chooseCsv(dialog, fixture.rows, fixture.headers);
      if (!fixture.immediate) {
        await expect(dialog.locator(".csv-picker")).toContainText(
          "application rows ready",
        );
        await dialog
          .getByRole("button", { name: "Verify 1 labels", exact: true })
          .click();
      }
      await expect(dialog.getByRole("alert")).toContainText(fixture.expected);
      await expect(dialog).toBeVisible();
      assert.equal((await uploadedRows(page)).length, 0);
    });
  }
} finally {
  await writeFile(
    path.join(artifacts, "use-cases-browser.json"),
    JSON.stringify(
      {
        baseUrl,
        browser: channel,
        fixtureDisclosure:
          "The manual-review scenario seeds an OCR error explicitly; other uploaded-image cases use the real OCR engine.",
        findings,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (findings.some((finding) => finding.result === "fail")) process.exitCode = 1;
