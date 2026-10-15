import { Injectable, computed, signal } from "@angular/core";
import { SAMPLE_LABELS } from "./samples";
import { verifyLabel } from "./verification";
import type { ApplicationFields, VerificationResult } from "./verification";
import { recognizeLabel, shutdownOcr, warmOcr } from "./ocr";

export type Decision = "approved" | "returned" | null;
export interface ReviewRecord {
  id: string;
  filename: string;
  application: ApplicationFields;
  imageUrl: string;
  sample: boolean;
  text: string;
  confidence: number;
  durationMs?: number;
  result?: VerificationResult;
  state: "queued" | "processing" | "ready" | "error";
  progress: number;
  error?: string;
  boldConfirmed: boolean;
  decision: Decision;
  notes: string;
  createdAt: string;
  reviewedAt?: string;
}
export const EMPTY_APPLICATION: ApplicationFields = {
  brand: "",
  beverage: "spirits",
  classType: "",
  abv: "",
  netContents: "",
  producer: "",
  country: "",
  imported: false,
};
const STORAGE_KEY = "proof-review-v1";
const initialSamples = (): ReviewRecord[] =>
  SAMPLE_LABELS.map((s) => ({
    id: s.id,
    filename: s.filename,
    application: { ...s.application },
    imageUrl: s.imageUrl,
    sample: true,
    text: s.text,
    confidence: s.confidence,
    result: verifyLabel(s.text, s.application, s.confidence),
    state: "ready",
    progress: 1,
    boldConfirmed: false,
    decision: null,
    notes: "",
    createdAt: s.createdAt,
  }));

@Injectable({ providedIn: "root" })
export class ReviewStore {
  readonly records = signal<ReviewRecord[]>(this.load());
  readonly activeId = signal(this.records()[0]?.id || "");
  readonly active = computed(() =>
    this.records().find((r) => r.id === this.activeId()),
  );
  readonly running = signal(false);
  readonly engine = signal<"idle" | "loading" | "ready" | "error">("idle");
  readonly notice = signal("");
  private files = new Map<string, File>();
  private queueGeneration = 0;

  private load(): ReviewRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialSamples();
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > 600)
        return initialSamples();
      const samples = initialSamples();
      // Only rehydrate the known record shape; persisted queue state cannot resume without files.
      return parsed
        .filter(
          (r) =>
            r &&
            typeof r.id === "string" &&
            typeof r.text === "string" &&
            r.application &&
            typeof r.application.brand === "string",
        )
        .map((r: ReviewRecord) => {
          const app = { ...EMPTY_APPLICATION, ...r.application };
          if (
            ![
              "brand",
              "classType",
              "abv",
              "netContents",
              "producer",
              "country",
            ].every(
              (k) => typeof app[k as keyof ApplicationFields] === "string",
            )
          )
            throw Error("Invalid saved record");
          const sample = samples.find((s) => s.id === r.id);
          return {
            ...r,
            application: app,
            imageUrl: sample?.imageUrl || "",
            sample: !!sample,
            state:
              r.state === "processing" || r.state === "queued"
                ? "error"
                : r.state,
            error:
              r.state === "processing" || r.state === "queued"
                ? "Upload the image again to resume verification."
                : r.error,
            result: r.text
              ? verifyLabel(r.text, app, r.confidence, r.boldConfirmed)
              : undefined,
          };
        });
    } catch {
      return initialSamples();
    }
  }
  private save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          this.records().map((r) => ({
            ...r,
            imageUrl: r.sample ? r.imageUrl : "",
          })),
        ),
      );
    } catch {
      this.notice.set(
        "This browser could not save the review history. You can still export a report.",
      );
    }
  }
  update(id: string, patch: Partial<ReviewRecord>, persist = true) {
    this.records.update((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    if (persist) this.save();
  }
  async prepareEngine() {
    if (this.engine() === "loading" || this.engine() === "ready") return;
    const generation = this.queueGeneration;
    this.engine.set("loading");
    try {
      await warmOcr();
      if (generation === this.queueGeneration) this.engine.set("ready");
    } catch {
      if (generation === this.queueGeneration) this.engine.set("error");
    }
  }
  add(files: File[], applications: ApplicationFields[]) {
    const rows = files.map((file, i): ReviewRecord => {
      const id = crypto.randomUUID();
      this.files.set(id, file);
      return {
        id,
        filename: file.name,
        application: applications[i],
        imageUrl: URL.createObjectURL(file),
        sample: false,
        text: "",
        confidence: 0,
        state: "queued",
        progress: 0,
        boldConfirmed: false,
        decision: null,
        notes: "",
        createdAt: new Date().toISOString(),
      };
    });
    this.records.update((existing) => [...rows, ...existing]);
    this.activeId.set(rows[0].id);
    this.save();
    void this.runQueue();
  }
  async runQueue() {
    if (this.running()) return;
    const generation = this.queueGeneration;
    this.running.set(true);
    const consume = async () => {
      let record: ReviewRecord | undefined;
      while (
        generation === this.queueGeneration &&
        (record = this.records().find((r) => r.state === "queued"))
      ) {
        const id = record.id;
        this.update(
          id,
          { state: "processing", progress: 0, error: undefined },
          false,
        );
        try {
          const file = this.files.get(id);
          if (!file)
            throw Error(
              "The image is no longer in memory. Upload it again to verify.",
            );
          const recognized = await recognizeLabel(file, (p) => {
            if (generation === this.queueGeneration)
              this.update(id, { progress: p }, false);
          });
          if (generation !== this.queueGeneration) return;
          const current = this.records().find((r) => r.id === id);
          if (!current) continue;
          this.update(id, {
            ...recognized,
            result: verifyLabel(
              recognized.text,
              current.application,
              recognized.confidence,
            ),
            state: "ready",
            progress: 1,
          });
          this.engine.set("ready");
        } catch (error) {
          if (generation !== this.queueGeneration) return;
          this.update(id, {
            state: "error",
            error:
              error instanceof Error
                ? error.message
                : "The label could not be read. Try a clearer image.",
          });
        }
      }
    };
    try {
      await Promise.all([consume(), consume()]);
    } finally {
      if (generation === this.queueGeneration) {
        this.running.set(false);
        this.save();
      }
    }
  }
  setTypography(id: string, confirmed: boolean) {
    const r = this.records().find((r) => r.id === id);
    if (!r) return;
    this.update(id, {
      boldConfirmed: confirmed,
      result: verifyLabel(r.text, r.application, r.confidence, confirmed),
      decision: null,
      reviewedAt: undefined,
    });
  }
  editApplication(id: string, application: ApplicationFields) {
    const r = this.records().find((r) => r.id === id);
    if (!r) return;
    this.update(id, {
      application: { ...application },
      result: r.text
        ? verifyLabel(r.text, application, r.confidence, r.boldConfirmed)
        : undefined,
      decision: null,
      reviewedAt: undefined,
    });
  }
  decide(id: string, decision: Decision, notes = "") {
    this.update(id, {
      decision,
      notes,
      reviewedAt: decision ? new Date().toISOString() : undefined,
    });
  }
  resetSamples() {
    const ids = new Set(SAMPLE_LABELS.map((s) => s.id));
    this.records.update((rows) => [
      ...initialSamples(),
      ...rows.filter((r) => !ids.has(r.id)),
    ]);
    this.activeId.set(SAMPLE_LABELS[0].id);
    this.save();
    this.notice.set("Sample workspace reset. Your uploaded reviews are kept.");
  }
  clearHistory() {
    this.queueGeneration++;
    this.running.set(false);
    this.engine.set("idle");
    void shutdownOcr();
    for (const r of this.records())
      if (!r.sample && r.imageUrl) URL.revokeObjectURL(r.imageUrl);
    this.files.clear();
    this.records.set(initialSamples());
    this.activeId.set(SAMPLE_LABELS[0].id);
    this.save();
    this.notice.set(
      "Local review history cleared. Sample labels are ready to explore.",
    );
  }
}
