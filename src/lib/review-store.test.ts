import "@angular/compiler";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewStore, EMPTY_APPLICATION } from "./review-store";
import { recognizeLabel, shutdownOcr } from "./ocr";

vi.mock("./ocr", () => ({
  recognizeLabel: vi.fn(),
  warmOcr: vi.fn(),
  shutdownOcr: vi.fn(async () => undefined),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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
});
