import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { IconComponent } from "./components/icon";
import { UploadDialogComponent } from "./components/upload-dialog";
import { ApplicationFormComponent } from "./components/application-form";
import { ReviewStore, EMPTY_APPLICATION } from "./lib/review-store";
import type { ReviewRecord } from "./lib/review-store";
import type { ApplicationFields } from "./lib/verification";
import { STANDARD_WARNING } from "./lib/verification";
import { downloadCsv } from "./lib/csv";
import { validateApplication, validateArtwork } from "./lib/upload-validation";

@Component({
  selector: "proof-app",
  standalone: true,
  imports: [
    IconComponent,
    UploadDialogComponent,
    ApplicationFormComponent,
    DatePipe,
    DecimalPipe,
    FormsModule,
  ],
  templateUrl: "./app.html",
})
export class AppComponent {
  readonly store = inject(ReviewStore);
  readonly today = new Date();
  readonly standardWarning = STANDARD_WARNING;
  readonly nav = signal<"queue" | "history" | "guide">("queue");
  readonly filter = signal("all");
  readonly beverage = signal("all");
  readonly search = signal("");
  readonly upload = signal<"single" | "batch" | null>(null);
  readonly tab = signal<"verification" | "application" | "text">(
    "verification",
  );
  readonly demoBanner = signal(true);
  readonly mobileNav = signal(false);
  readonly draft = signal<ApplicationFields>({
    ...(this.store.active()?.application || EMPTY_APPLICATION),
  });
  readonly notes = signal("");
  readonly returnError = signal("");
  readonly editError = signal("");
  readonly manualReason = signal("");
  readonly manualAllFields = signal(false);
  readonly manualError = signal("");
  readonly active = this.store.active;
  readonly total = computed(() => this.store.records().length);
  readonly pending = computed(
    () => this.store.records().filter((r) => !r.decision).length,
  );
  readonly flagged = computed(
    () =>
      this.store
        .records()
        .filter(
          (r) =>
            !r.decision &&
            (r.result?.status === "flagged" || r.state === "error"),
        ).length,
  );
  readonly textMatched = computed(
    () =>
      this.store
        .records()
        .filter(
          (r) =>
            r.result &&
            r.result.checks.every(
              (c) => c.key === "warningTypography" || c.status === "match",
            ) &&
            r.state === "ready",
        ).length,
  );
  readonly reviewed = computed(
    () => this.store.records().filter((r) => !!r.decision).length,
  );
  readonly visible = computed(() => {
    const term = this.search().toLowerCase().trim();
    return this.store.records().filter((r) => {
      if (this.nav() === "history" && !r.decision) return false;
      if (
        this.filter() === "attention" &&
        (r.decision || r.result?.status === "matched")
      )
        return false;
      if (this.filter() === "reviewed" && !r.decision) return false;
      if (
        this.beverage() !== "all" &&
        r.application.beverage !== this.beverage()
      )
        return false;
      return (
        !term ||
        [r.application.brand, r.application.classType, r.filename].some((v) =>
          v.toLowerCase().includes(term),
        )
      );
    });
  });
  readonly fieldChecks = computed(
    () =>
      this.active()?.result?.checks.filter(
        (c) => !c.key.startsWith("warning"),
      ) || [],
  );
  readonly matchCount = computed(
    () =>
      this.active()?.result?.checks.filter((c) => c.status === "match")
        .length || 0,
  );
  readonly warningStatus = computed(() => {
    const checks =
      this.active()?.result?.checks.filter(
        (c) => c.key === "warning" || c.key === "warningHeader",
      ) || [];
    return checks.some((c) => c.status === "mismatch")
      ? "mismatch"
      : checks.length && checks.every((c) => c.status === "match")
        ? "match"
        : "review";
  });
  readonly warningDescription = computed(() => {
    const result = this.active()?.result;
    if (!result?.warningExact)
      return "Missing or different from the required wording.";
    if (!result.warningHeaderCorrect)
      return "Warning header must use ALL CAPS.";
    return this.warningStatus() === "review"
      ? "Low OCR confidence. Check the wording on the artwork."
      : "Exact wording and uppercase header match.";
  });
  readonly canApprove = computed(
    () =>
      this.active()?.state === "ready" &&
      this.active()?.result?.status === "matched" &&
      !!this.active()?.imageUrl &&
      !this.active()?.decision,
  );
  readonly needsManualReview = computed(
    () =>
      this.active()?.result?.checks.some(
        (check) =>
          check.key !== "warningTypography" && check.status !== "match",
      ) || false,
  );
  readonly canApproveManually = computed(() => {
    const r = this.active();
    return (
      !!r &&
      r.state === "ready" &&
      !!r.result &&
      this.needsManualReview() &&
      !!r.imageUrl &&
      r.boldConfirmed &&
      !r.decision
    );
  });
  @ViewChild("imageDialog") imageDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild("returnDialog") returnDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild("clearDialog") clearDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild("manualDialog") manualDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild("artworkInput") artworkInput!: ElementRef<HTMLInputElement>;
  private uploadTrigger?: HTMLElement;
  private replacementId?: string;

  go(nav: "queue" | "history" | "guide") {
    this.nav.set(nav);
    this.filter.set("all");
    this.search.set("");
    this.mobileNav.set(false);
  }
  openRecord(r: ReviewRecord) {
    this.store.activeId.set(r.id);
    this.draft.set({ ...r.application });
    this.notes.set(r.notes);
    this.tab.set("verification");
    this.editError.set("");
  }
  status(r: ReviewRecord) {
    if (r.decision === "approved")
      return r.manualReview ? "Manually approved" : "Approved";
    if (r.decision === "returned") return "Changes requested";
    if (r.state === "queued") return "Queued";
    if (r.state === "processing") return "Reading label";
    if (r.state === "error") return "Couldn’t read";
    return r.result?.status === "flagged"
      ? "Flagged"
      : r.result?.status === "matched"
        ? "Ready to approve"
        : "Needs review";
  }
  tone(r: ReviewRecord) {
    if (
      r.decision === "approved" ||
      (!r.decision && r.result?.status === "matched")
    )
      return "green";
    if (
      r.decision === "returned" ||
      r.result?.status === "flagged" ||
      r.state === "error"
    )
      return "red";
    return "amber";
  }
  icon(r: ReviewRecord) {
    return r.application.beverage === "spirits"
      ? "bottle"
      : r.application.beverage === "wine"
        ? "wine"
        : "beer";
  }
  issueCount(r: ReviewRecord) {
    return r.result?.checks.filter((c) => c.status === "mismatch").length || 0;
  }
  startUpload(mode: "single" | "batch") {
    this.uploadTrigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    this.upload.set(mode);
    void this.store.prepareEngine();
  }
  closeUpload() {
    document
      .querySelector<HTMLDialogElement>("p-upload-dialog dialog")
      ?.close();
    this.upload.set(null);
    this.uploadTrigger?.focus();
  }
  addUpload(event: { files: File[]; applications: ApplicationFields[] }) {
    if (this.store.records().length + event.files.length > 600) {
      this.store.notice.set(
        "The workspace holds 600 reviews. Export and clear your history before adding another batch.",
      );
      return;
    }
    this.store.add(event.files, event.applications);
    this.closeUpload();
    this.nav.set("queue");
    this.filter.set("all");
    this.search.set("");
    this.draft.set({ ...event.applications[0] });
    this.tab.set("verification");
    this.notes.set("");
  }
  saveApplication() {
    const app = this.draft();
    const error = validateApplication(app);
    if (error) {
      this.editError.set(error);
      return;
    }
    const r = this.active();
    if (!r) return;
    this.store.editApplication(r.id, app);
    this.editError.set("");
    this.tab.set("verification");
    this.store.notice.set("Application updated and label checks recalculated.");
  }
  approve() {
    const r = this.active();
    if (!r || !this.canApprove()) return;
    this.store.decide(r.id, "approved", this.notes());
    this.store.notice.set(
      "Review saved. " +
        r.application.brand +
        " is approved in this prototype.",
    );
  }
  openManualReview() {
    if (!this.canApproveManually()) return;
    this.manualReason.set("");
    this.manualAllFields.set(false);
    this.manualError.set("");
    this.manualDialog.nativeElement.showModal();
  }
  approveManually() {
    if (!this.manualReason().trim()) {
      this.manualError.set(
        "Explain how you resolved the OCR flags or verified an applicable exception.",
      );
      return;
    }
    if (!this.manualAllFields() || !this.canApproveManually()) {
      this.manualError.set(
        "Inspect the artwork and confirm every required field before approving.",
      );
      return;
    }
    const r = this.active();
    if (!r || !this.store.approveManually(r.id, this.manualReason())) return;
    this.manualDialog.nativeElement.close();
    this.store.notice.set(
      "Manual approval saved with your reason. Automated findings are preserved.",
    );
  }
  chooseReplacement() {
    const r = this.active();
    if (!r || r.sample || r.state === "processing" || r.state === "queued")
      return;
    this.replacementId = r.id;
    this.artworkInput.nativeElement.click();
  }
  replaceArtwork(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length || !this.replacementId) return;
    const error = validateArtwork(files);
    if (error) {
      this.store.notice.set(error);
      return;
    }
    if (this.store.replaceArtwork(this.replacementId, files[0])) {
      this.tab.set("verification");
      this.store.notice.set(
        "Artwork replaced. OCR is running again; previous confirmations and decisions were cleared.",
      );
    }
    this.replacementId = undefined;
  }
  openReturn() {
    this.returnError.set("");
    this.notes.set(this.active()?.notes || "");
    this.returnDialog.nativeElement.showModal();
  }
  returnForChanges() {
    if (!this.notes().trim()) {
      this.returnError.set(
        "Add a short reason so the applicant knows what to change.",
      );
      return;
    }
    const r = this.active();
    if (!r) return;
    this.store.decide(r.id, "returned", this.notes().trim());
    this.returnDialog.nativeElement.close();
    this.store.notice.set("Review saved with your requested changes.");
  }
  reopen() {
    const r = this.active();
    if (r) {
      this.store.decide(r.id, null, r.notes);
      this.store.notice.set("Review reopened.");
    }
  }
  export(all = true) {
    const rows = all
      ? this.store.records()
      : this.active()
        ? [this.active()!]
        : [];
    if (!rows.length) {
      this.store.notice.set("There are no reviews to export yet.");
      return;
    }
    downloadCsv(
      "proof-" + (all ? "review-report" : "label-review") + ".csv",
      rows.flatMap((r) =>
        (r.result?.checks.length
          ? r.result.checks
          : [
              {
                label: "Processing",
                expected: "",
                observed: r.error || r.state,
                status: "review",
              },
            ]
        ).map((c) => ({
          id: r.id,
          filename: r.filename,
          brand: r.application.brand,
          beverage: r.application.beverage,
          source: r.sample ? "sample fixture" : "uploaded image",
          status: this.status(r),
          decision: r.decision || "pending",
          automatedStatus: r.result?.status || r.state,
          manualReviewReason: r.manualReview?.reason || "",
          manualReviewConfirmed: r.manualReview?.confirmedAllFields || false,
          field: c.label,
          expected: c.expected,
          observed: c.observed,
          fieldResult: c.status,
          ocrConfidence: r.sample ? "not measured" : r.confidence,
          durationMs: r.durationMs ?? "",
          notes: r.notes,
          reviewedAt: r.reviewedAt || "",
        })),
      ),
    );
    this.store.notice.set("Your review report has been downloaded.");
  }
  async downloadLabel() {
    const r = this.active();
    if (!r?.imageUrl) return;
    if (r.sample) {
      const anchor = document.createElement("a");
      anchor.href = new URL("samples/" + r.filename, document.baseURI).href;
      anchor.download = r.filename;
      anchor.click();
      return;
    }
    try {
      const img = new Image();
      img.src = r.imageUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw Error();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename.replace(/\.[^.]+$/, ".png");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.store.notice.set(
        "The label image could not be downloaded. Try opening the artwork preview.",
      );
    }
  }
}
