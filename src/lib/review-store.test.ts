import "@angular/compiler";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewStore, EMPTY_APPLICATION } from "./review-store";
import { recognizeLabel, shutdownOcr } from "./ocr";
import { SAMPLE_LABELS } from "./samples";

vi.mock("./ocr", () => ({
  recognizeLabel: vi.fn(),
  warmOcr: vi.fn(),
  shutdownOcr: vi.fn(async () => undefined),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function memoryStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}

const image = (name: string) => new File([name], name, { type: "image/png" });
const clearResult = {
  text: SAMPLE_LABELS[0].text,
  confidence: 96,
  durationMs: 350,
};

function pendingRecognition() {
  const pending: Array<{
    file: File;
    progress?: (value: number) => void;
    resolve: (value: typeof clearResult) => void;
    reject: (error: Error) => void;
  }> = [];
  vi.mocked(recognizeLabel).mockImplementation(
    (file, progress) =>
      new Promise((resolve, reject) =>
        pending.push({ file, progress, resolve, reject }),
      ),
  );
  return pending;
}

describe("review queue lifecycle", () => {
  it("clears active work without letting its late completion overwrite a new batch", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    const pending: Array<{
      resolve: (value: {
        text: string;
        confidence: number;
        durationMs: number;
      }) => void;
      reject: (error: Error) => void;
    }> = [];
    vi.mocked(recognizeLabel).mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    );
    const store = new ReviewStore();
    const application = { ...EMPTY_APPLICATION, brand: "Still River" };
    const original = [
      new File(["one"], "old-one.png"),
      new File(["two"], "old-two.png"),
    ];
    store.add(original, [application, application]);
    const originalIds = store
      .records()
      .filter((record) => !record.sample)
      .map((record) => record.id);
    expect(pending).toHaveLength(2);
    expect(store.running()).toBe(true);

    store.clearHistory();
    expect(shutdownOcr).toHaveBeenCalledOnce();
    expect(store.running()).toBe(false);
    store.add([new File(["new"], "new.png")], [application]);
    expect(pending).toHaveLength(3);
    pending[0].resolve({
      text: "OBSOLETE RESULT",
      confidence: 90,
      durationMs: 20,
    });
    pending[1].reject(new Error("OCR was cancelled."));
    // Flush the old queue's completion while the new queue still has an active job.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.running()).toBe(true);
    expect(
      store.records().some((record) => originalIds.includes(record.id)),
    ).toBe(false);

    pending[2].resolve({
      text: "STILL RIVER",
      confidence: 95,
      durationMs: 500,
    });
    await vi.waitFor(() => expect(store.running()).toBe(false));
    const current = store
      .records()
      .find((record) => record.filename === "new.png");
    expect(current?.state).toBe("ready");
    expect(current?.text).toBe("STILL RIVER");
    expect(current?.error).toBeUndefined();
    store.clearHistory();
  });

  it("reattaches artwork after reload without duplicating the application and resets review decisions", async () => {
    memoryStorage();
    vi.mocked(recognizeLabel).mockResolvedValue(clearResult);
    const original = new ReviewStore();
    const application = { ...SAMPLE_LABELS[0].application };
    original.add([image("original.png")], [application]);
    await vi.waitFor(() => expect(original.running()).toBe(false));
    const uploaded = original.active()!;
    original.setTypography(uploaded.id, true);
    original.decide(uploaded.id, "approved", "Original review");

    const restored = new ReviewStore();
    expect(restored.active()?.imageUrl).toBe("");
    expect(restored.records()).toHaveLength(7);
    const pending = pendingRecognition();
    expect(restored.replaceArtwork(uploaded.id, image("replacement.png"))).toBe(true);
    expect(restored.active()).toMatchObject({
      id: uploaded.id,
      application,
      createdAt: uploaded.createdAt,
      filename: "replacement.png",
      state: "processing",
      text: "",
      confidence: 0,
      boldConfirmed: false,
      decision: null,
      notes: "",
    });
    expect(restored.active()?.imageUrl).toMatch(/^blob:/);
    expect(restored.active()?.result).toBeUndefined();
    expect(restored.active()?.reviewedAt).toBeUndefined();
    expect(restored.records()).toHaveLength(7);
    pending[0].resolve(clearResult);
    await vi.waitFor(() => expect(restored.running()).toBe(false));
    expect(restored.active()?.result?.status).toBe("review");
    expect(restored.active()?.boldConfirmed).toBe(false);
    original.clearHistory();
    restored.clearHistory();
  });

  it("ignores completion and progress from replaced artwork and releases its old object URL", async () => {
    memoryStorage();
    const pending = pendingRecognition();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const store = new ReviewStore();
    store.add([image("old.png")], [{ ...SAMPLE_LABELS[0].application }]);
    const original = store.active()!;
    store.replaceArtwork(original.id, image("new.png"));
    expect(revoke).toHaveBeenCalledWith(original.imageUrl);
    pending[0].progress?.(0.99);
    expect(store.active()?.progress).toBe(0);
    pending[0].resolve({ text: "STALE OCR", confidence: 99, durationMs: 10 });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].file.name).toBe("new.png");
    expect(store.active()?.text).toBe("");
    expect(store.active()?.state).toBe("processing");
    pending[1].resolve(clearResult);
    await vi.waitFor(() => expect(store.running()).toBe(false));
    expect(store.active()?.text).toBe(clearResult.text);
    expect(store.active()?.filename).toBe("new.png");
    expect(store.records()).toHaveLength(7);
    store.clearHistory();
  });

  it("ignores failure from replaced artwork instead of marking its replacement as failed", async () => {
    memoryStorage();
    const pending = pendingRecognition();
    const store = new ReviewStore();
    store.add([image("old.png")], [{ ...SAMPLE_LABELS[0].application }]);
    store.replaceArtwork(store.activeId(), image("new.png"));
    pending[0].reject(new Error("Obsolete image failed"));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(store.active()?.state).toBe("processing");
    expect(store.active()?.error).toBeUndefined();
    pending[1].resolve(clearResult);
    await vi.waitFor(() => expect(store.running()).toBe(false));
    expect(store.active()?.state).toBe("ready");
    expect(store.active()?.error).toBeUndefined();
    store.clearHistory();
  });

  it("reports no readable OCR text as an actionable failure without fabricated comparisons", async () => {
    memoryStorage();
    vi.mocked(recognizeLabel).mockResolvedValue({
      text: " \n \t ",
      confidence: 0,
      durationMs: 300,
    });
    const store = new ReviewStore();
    store.add([image("blank.png")], [{ ...SAMPLE_LABELS[0].application }]);
    await vi.waitFor(() => expect(store.running()).toBe(false));
    expect(store.active()).toMatchObject({ state: "error", text: "", durationMs: 300 });
    expect(store.active()?.result).toBeUndefined();
    expect(store.active()?.error).toContain("No readable text was found");
    expect(store.active()?.error).toContain("Replace the artwork");
    expect(store.approveManually(store.activeId(), "I reviewed it")).toBe(false);
    store.clearHistory();
  });
});

describe("explicit manual review", () => {
  it("requires completed OCR, visible artwork, typography confirmation, a reason, and an undecided review", () => {
    memoryStorage();
    const store = new ReviewStore();
    const id = store.activeId();
    expect(store.approveManually("missing", "Reviewed")).toBe(false);
    expect(store.approveManually(id, "Reviewed")).toBe(false);
    store.setTypography(id, true);
    expect(store.approveManually(id, "  ")).toBe(false);
    store.update(id, { state: "processing" });
    expect(store.approveManually(id, "Reviewed")).toBe(false);
    store.update(id, { state: "ready", imageUrl: "" });
    expect(store.approveManually(id, "Reviewed")).toBe(false);
    store.update(id, { imageUrl: "samples/old-tom-bourbon.svg", result: undefined });
    expect(store.approveManually(id, "Reviewed")).toBe(false);
    store.editApplication(id, { ...SAMPLE_LABELS[0].application });
    store.decide(id, "returned", "Needs changes");
    expect(store.approveManually(id, "Reviewed")).toBe(false);
  });

  it("preserves automated flags and records the review basis through persistence and reopening", () => {
    const values = memoryStorage();
    const store = new ReviewStore();
    const id = "maison-lucette";
    store.setTypography(id, true);
    const automated = store.records().find((r) => r.id === id)!.result;
    expect(automated?.status).toBe("flagged");
    expect(store.approveManually(id, "  Compared every field with the artwork; ABV was misread.  ")).toBe(true);
    const approved = store.records().find((r) => r.id === id)!;
    expect(approved.result).toBe(automated);
    expect(approved.result?.checks.find((check) => check.key === "abv")?.status).toBe("mismatch");
    expect(approved.manualReview).toEqual({
      reason: "Compared every field with the artwork; ABV was misread.",
      confirmedAllFields: true,
      automatedStatus: "flagged",
    });
    expect(approved.notes).toBe(approved.manualReview?.reason);
    expect(approved.reviewedAt).toBeTruthy();
    expect(JSON.parse(values.get("proof-review-v1")!).find((r: { id: string }) => r.id === id).manualReview).toEqual(approved.manualReview);
    const restored = new ReviewStore();
    const persisted = restored.records().find((r) => r.id === id)!;
    expect(persisted.decision).toBe("approved");
    expect(persisted.manualReview).toEqual(approved.manualReview);
    expect(persisted.result?.status).toBe("flagged");
    restored.decide(id, null, persisted.notes);
    expect(restored.records().find((r) => r.id === id)?.manualReview).toBeUndefined();
    expect(restored.records().find((r) => r.id === id)?.notes).toBe(approved.notes);
  });

  it("removes an outdated manual decision when the application or typography changes", () => {
    memoryStorage();
    const store = new ReviewStore();
    const id = "old-tom";
    store.setTypography(id, true);
    expect(store.approveManually(id, "Checked all fields")).toBe(true);
    store.editApplication(id, { ...SAMPLE_LABELS[0].application, abv: "44%" });
    expect(store.active()?.decision).toBeNull();
    expect(store.active()?.manualReview).toBeUndefined();
    expect(store.approveManually(id, "Checked the changed application")).toBe(true);
    store.setTypography(id, false);
    expect(store.active()?.decision).toBeNull();
    expect(store.active()?.manualReview).toBeUndefined();
  });
});
