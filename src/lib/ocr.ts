import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

type ProgressCallback = (value: number) => void;
type Stage = "loading" | "recognizing";
type Slot = {
  worker?: Worker;
  busy: boolean;
  cancelled: boolean;
  loadingProgress: number;
  report?: (stage: Stage, progress: number) => void;
  cancel?: (error: Error) => void;
  disposal?: Promise<void>;
};
type Waiter = { resolve: (slot: Slot) => void; reject: (error: Error) => void };

const MAX_WORKERS = 2;
const INITIALIZATION_TIMEOUT_MS = 45_000;
const RECOGNITION_TIMEOUT_MS = 20_000;
const slots: Slot[] = [];
const waiters: Waiter[] = [];
let shutdown: Promise<void> | undefined;

// Every runtime asset is served by this application, including on subpath hosts.
const assetDirectory = new URL("ocr", document.baseURI).href.replace(/\/$/, "");

function notify(callback: ProgressCallback | undefined, value: number) {
  // A UI callback must never be able to interrupt an OCR worker.
  try {
    callback?.(Math.max(0, Math.min(1, value)));
  } catch {
    /* consumer owns its UI */
  }
}

function newSlot(): Slot {
  const slot: Slot = { busy: true, cancelled: false, loadingProgress: 0 };
  slots.push(slot);
  return slot;
}

function drainQueue() {
  while (waiters.length > 0) {
    let slot = slots.find((item) => !item.busy && !item.cancelled);
    if (!slot && slots.length < MAX_WORKERS) slot = newSlot();
    if (!slot) return;
    slot.busy = true;
    waiters.shift()!.resolve(slot);
  }
}

async function acquire(): Promise<Slot> {
  if (shutdown) await shutdown;
  const available = slots.find((item) => !item.busy && !item.cancelled);
  if (available) {
    available.busy = true;
    return available;
  }
  if (slots.length < MAX_WORKERS) return newSlot();
  return new Promise<Slot>((resolve, reject) =>
    waiters.push({ resolve, reject }),
  );
}

function release(slot: Slot) {
  slot.report = undefined;
  slot.cancel = undefined;
  slot.busy = false;
  drainQueue();
}

async function dispose(slot: Slot) {
  if (slot.disposal) return slot.disposal;
  slot.cancelled = true;
  const index = slots.indexOf(slot);
  if (index >= 0) slots.splice(index, 1);
  slot.disposal = slot.worker
    ? slot.worker
        .terminate()
        .then(() => undefined)
        .catch(() => undefined)
    : Promise.resolve();
  return slot.disposal;
}

function loadingProgress(status: string, progress: number): number {
  if (status === "loading tesseract core") return progress * 0.3;
  if (status === "initializing tesseract") return 0.3 + progress * 0.1;
  if (status === "loading language traineddata") return 0.4 + progress * 0.45;
  if (status === "initializing api") return 0.85 + progress * 0.15;
  return 0;
}

async function initialize(slot: Slot): Promise<Worker> {
  if (slot.cancelled) throw new Error("OCR was cancelled.");
  if (slot.worker) return slot.worker;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${assetDirectory}/worker.min.js`,
    langPath: assetDirectory,
    corePath: assetDirectory,
    gzip: true,
    // Avoid a third-party CDN and blob workers; normal same-origin CSP works.
    workerBlobURL: false,
    logger: ({ status, progress }) => {
      if (slot.cancelled) return;
      if (status === "recognizing text") {
        slot.report?.("recognizing", progress);
      } else {
        slot.loadingProgress = Math.max(
          slot.loadingProgress,
          loadingProgress(status, progress),
        );
        slot.report?.("loading", slot.loadingProgress);
      }
    },
    errorHandler: (error) =>
      slot.cancel?.(new Error(`OCR engine error: ${String(error)}`)),
  });
  // Initialization may finish after its timeout or after the user cancels.
  if (slot.cancelled) {
    await worker.terminate();
    throw new Error("OCR was cancelled.");
  }
  slot.worker = worker;
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  slot.loadingProgress = 1;
  slot.report?.("loading", 1);
  return worker;
}

async function withDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function lease<T>(
  action: (slot: Slot, cancelled: Promise<never>) => Promise<T>,
): Promise<T> {
  const slot = await acquire();
  const cancelled = new Promise<never>((_, reject) => {
    slot.cancel = reject;
  });
  try {
    return await action(slot, cancelled);
  } catch (error) {
    await dispose(slot);
    throw error;
  } finally {
    release(slot);
  }
}

/** Loads one reusable local OCR worker before the first label is uploaded. */
export async function warmOcr(onProgress?: ProgressCallback): Promise<void> {
  notify(onProgress, 0);
  await lease(async (slot, cancelled) => {
    slot.report = (stage, value) => {
      if (stage === "loading") notify(onProgress, value);
    };
    await Promise.race([
      withDeadline(
        initialize(slot),
        INITIALIZATION_TIMEOUT_MS,
        "The OCR engine could not load. Check your connection and reload the page.",
      ),
      cancelled,
    ]);
    notify(onProgress, 1);
  });
}

/** Limits oversized photos while preserving enough pixels for small label text. */
async function prepareImage(file: File): Promise<Blob | File> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This image could not be decoded. Upload a valid JPEG, PNG, or WebP image.",
    );
  }
  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale =
      longestSide > 2400
        ? 2400 / longestSide
        : longestSide < 1200
          ? Math.min(2, 1200 / longestSide)
          : 1;
    if (scale === 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    // Composite transparent PNGs onto white, as they would appear on paper.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("This image could not be prepared for OCR.")),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}

export async function recognizeLabel(
  file: File,
  onProgress?: ProgressCallback,
): Promise<{ text: string; confidence: number; durationMs: number }> {
  const started = performance.now();
  notify(onProgress, 0);
  return lease(async (slot, cancelled) => {
    slot.report = (stage, value) =>
      notify(
        onProgress,
        stage === "loading" ? value * 0.15 : 0.15 + value * 0.84,
      );
    const worker = await Promise.race([
      withDeadline(
        initialize(slot),
        INITIALIZATION_TIMEOUT_MS,
        "The OCR engine could not load. Check your connection and try again.",
      ),
      cancelled,
    ]);
    notify(onProgress, 0.15);
    const recognize = async () => {
      const image = await prepareImage(file);
      if (slot.cancelled) throw new Error("OCR was cancelled.");
      return worker.recognize(image, { rotateAuto: true }, { text: true });
    };
    const { data } = await Promise.race([
      withDeadline(
        recognize(),
        RECOGNITION_TIMEOUT_MS,
        "This label took longer than 20 seconds. Try a closer, sharper crop of the label.",
      ),
      cancelled,
    ]);
    notify(onProgress, 1);
    return {
      text: data.text.trim(),
      confidence: Math.max(0, Math.min(100, data.confidence || 0)),
      durationMs: Math.round(performance.now() - started),
    };
  });
}

/** Cancels active/queued work and permits a clean restart on the next upload. */
export async function shutdownOcr(): Promise<void> {
  if (shutdown) return shutdown;
  const error = new Error("OCR was cancelled.");
  const active = [...slots];
  slots.length = 0;
  for (const waiter of waiters.splice(0)) waiter.reject(error);
  for (const slot of active) {
    slot.cancelled = true;
    slot.cancel?.(error);
  }
  shutdown = Promise.all(active.map((slot) => dispose(slot))).then(
    () => undefined,
  );
  try {
    await shutdown;
  } finally {
    shutdown = undefined;
  }
}
