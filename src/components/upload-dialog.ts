import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  signal,
} from "@angular/core";
import type { AfterViewInit, OnDestroy } from "@angular/core";
import { IconComponent } from "./icon";
import { ApplicationFormComponent } from "./application-form";
import { EMPTY_APPLICATION } from "../lib/review-store";
import { parseBatchCsv } from "../lib/csv";
import type { ApplicationFields } from "../lib/verification";

@Component({
  selector: "p-upload-dialog",
  standalone: true,
  imports: [IconComponent, ApplicationFormComponent],
  template: `
    <dialog
      #dialog
      class="modal upload-modal"
      aria-label="Upload labels and application details"
      (cancel)="dismiss($event)"
    >
      <div class="modal-heading">
        <span class="eyebrow">A CLEARER PATH TO REVIEW</span
        ><button
          class="icon-button"
          aria-label="Close upload"
          (click)="closed.emit()"
        >
          <p-icon name="close" />
        </button>
      </div>
      <h2>
        {{
          mode === "batch"
            ? "One batch. Every detail."
            : "Let’s take a closer look."
        }}
      </h2>
      <p class="modal-description">
        {{
          mode === "batch"
            ? "Add up to 300 label images and a CSV of their application details."
            : "Add the label artwork and the details from its application."
        }}
      </p>
      <div class="upload-steps">
        <span class="step-number">1</span>
        <h3>Label artwork</h3>
        <span class="step-hint">JPG, PNG or WebP · up to 10 MB each</span>
      </div>
      <input
        #imageInput
        type="file"
        [multiple]="mode === 'batch'"
        accept="image/png,image/jpeg,image/webp"
        hidden
        (change)="selectFiles($event)"
      />
      <button
        type="button"
        class="dropzone"
        [class.dragging]="dragging()"
        (click)="imageInput.click()"
        (dragover)="dragOver($event)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
      >
        <span class="upload-glyph"><p-icon name="upload" [size]="25" /></span>
        <strong>{{
          files().length
            ? files().length +
              (files().length === 1 ? " image selected" : " images selected")
            : "Choose " + (mode === "batch" ? "label images" : "a label image")
        }}</strong>
        <span>{{
          files().length
            ? "Click to choose again"
            : "or drag and drop " +
              (mode === "batch" ? "your files" : "it") +
              " here"
        }}</span>
      </button>
      @if (files().length) {
        <div class="selected-files">
          @for (f of files().slice(0, 3); track f.name) {
            <span><p-icon name="file" [size]="14" />{{ f.name }}</span>
          }
          @if (files().length > 3) {
            <span>+{{ files().length - 3 }} more</span>
          }
        </div>
      }
      <div class="upload-steps">
        <span class="step-number">2</span>
        <h3>Application details</h3>
        @if (mode === "batch") {
          <a href="samples/batch-template.csv" download class="text-link"
            ><p-icon name="download" [size]="14" /> CSV template</a
          >
        }
      </div>
      @if (mode === "single") {
        <p-application-form
          [value]="application"
          (valueChange)="application = $event"
          prefix="upload"
        />
      } @else {
        <p class="small-copy">
          Match each image to a CSV row using the <code>filename</code> column.
          Every image needs its own application details.
        </p>
        <input
          #csvInput
          type="file"
          accept=".csv,text/csv"
          hidden
          (change)="selectCsv($event)"
        />
        <button class="csv-picker" (click)="csvInput.click()">
          <p-icon name="file" /><span
            ><strong>{{ csvName() || "Choose application CSV" }}</strong
            ><small>{{
              csvRows().length
                ? csvRows().length + " application rows ready"
                : "Use the template to get the columns right"
            }}</small></span
          ><p-icon name="plus" [size]="18" />
        </button>
      }
      @if (error()) {
        <div class="form-error" role="alert">
          <p-icon name="alert" [size]="18" /><span>{{ error() }}</span>
        </div>
      }
      <div class="privacy-line">
        <p-icon name="lock" [size]="14" />Images are processed on this device
        and never uploaded.
      </div>
      <div class="modal-footer">
        <button class="button secondary" (click)="closed.emit()">Cancel</button
        ><button
          class="button primary"
          [disabled]="!files().length"
          (click)="submit()"
        >
          {{
            mode === "batch"
              ? "Verify " + files().length + " labels"
              : "Verify label"
          }}<p-icon name="arrow" [size]="17" />
        </button>
      </div>
    </dialog>
  `,
})
export class UploadDialogComponent implements AfterViewInit, OnDestroy {
  @Input() mode: "single" | "batch" = "single";
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<{
    files: File[];
    applications: ApplicationFields[];
  }>();
  @ViewChild("dialog") dialog!: ElementRef<HTMLDialogElement>;
  files = signal<File[]>([]);
  error = signal("");
  dragging = signal(false);
  csvName = signal("");
  csvRows = signal<Array<Record<string, string>>>([]);
  application = { ...EMPTY_APPLICATION };
  ngAfterViewInit() {
    this.dialog.nativeElement.showModal();
  }
  ngOnDestroy() {
    this.dialog.nativeElement.close();
  }
  dismiss(event: Event) {
    event.preventDefault();
    this.closed.emit();
  }
  dragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }
  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    this.setFiles(Array.from(event.dataTransfer?.files || []));
  }
  selectFiles(event: Event) {
    this.setFiles(Array.from((event.target as HTMLInputElement).files || []));
  }
  setFiles(files: File[]) {
    this.error.set("");
    if (files.length > (this.mode === "single" ? 1 : 300)) {
      this.error.set(
        this.mode === "single"
          ? "Choose one image. Use Batch upload for multiple labels."
          : "Please keep each batch to 300 images.",
      );
      return;
    }
    if (
      files.some(
        (f) => !["image/png", "image/jpeg", "image/webp"].includes(f.type),
      )
    ) {
      this.error.set(
        "Choose JPG, PNG or WebP images. Convert PDF or SVG labels to PNG first.",
      );
      return;
    }
    if (files.some((f) => f.size > 10 * 1024 * 1024 || f.size === 0)) {
      this.error.set("Every image must be between 1 byte and 10 MB.");
      return;
    }
    if (files.reduce((size, f) => size + f.size, 0) > 250 * 1024 * 1024) {
      this.error.set(
        "Keep each batch under 250 MB so this device stays responsive.",
      );
      return;
    }
    if (new Set(files.map((f) => f.name.toLowerCase())).size !== files.length) {
      this.error.set("Image filenames must be unique within a batch.");
      return;
    }
    this.files.set(files);
  }
  async selectCsv(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set("");
    this.csvRows.set([]);
    this.csvName.set("");
    if (file.size > 2 * 1024 * 1024) {
      this.error.set("Keep the CSV under 2 MB.");
      return;
    }
    const parsed = parseBatchCsv(await file.text());
    if (parsed.errors.length) {
      this.error.set(parsed.errors[0]);
      return;
    }
    if (parsed.rows.length > 300) {
      this.error.set("The CSV can contain at most 300 application rows.");
      return;
    }
    const rows = parsed.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k.toLowerCase().replace(/[\s_-]/g, ""),
          v,
        ]),
      ),
    );
    const required = [
      "filename",
      "brand",
      "beverage",
      "classtype",
      "abv",
      "netcontents",
      "producer",
      "country",
      "imported",
    ];
    if (!required.every((k) => Object.hasOwn(rows[0] || {}, k))) {
      this.error.set(
        "CSV columns must match the template: filename, brand, beverage, classType, abv, netContents, producer, country, imported.",
      );
      return;
    }
    if (
      new Set(rows.map((r) => r["filename"].toLowerCase())).size !== rows.length
    ) {
      this.error.set("CSV filenames must be unique.");
      return;
    }
    this.csvRows.set(rows);
    this.csvName.set(file.name);
  }
  private valid(app: ApplicationFields) {
    return (
      ["spirits", "wine", "beer"].includes(app.beverage) &&
      !!app.brand.trim() &&
      !!app.classType.trim() &&
      !!app.abv.trim() &&
      !!app.netContents.trim() &&
      !!app.producer.trim() &&
      (!app.imported || !!app.country.trim())
    );
  }
  submit() {
    this.error.set("");
    if (!this.files().length) return;
    let applications: ApplicationFields[];
    if (this.mode === "single") {
      if (!this.valid(this.application)) {
        this.error.set(
          "Complete all application fields, including country of origin for imports.",
        );
        return;
      }
      applications = [{ ...this.application }];
    } else {
      applications = [];
      for (const file of this.files()) {
        const r = this.csvRows().find(
          (r) => r["filename"].toLowerCase() === file.name.toLowerCase(),
        );
        if (!r) {
          this.error.set(
            "No application CSV row found for " +
              file.name +
              ". Choose a CSV with one row per image.",
          );
          return;
        }
        if (!["true", "false"].includes(r["imported"].toLowerCase())) {
          this.error.set(
            "The imported column must be true or false for " + file.name + ".",
          );
          return;
        }
        const app: ApplicationFields = {
          brand: r["brand"],
          beverage: r[
            "beverage"
          ].toLowerCase() as ApplicationFields["beverage"],
          classType: r["classtype"],
          abv: r["abv"],
          netContents: r["netcontents"],
          producer: r["producer"],
          country: r["country"],
          imported: r["imported"].toLowerCase() === "true",
        };
        if (!this.valid(app)) {
          this.error.set(
            "Complete the application values for " +
              file.name +
              ". Beverage must be spirits, wine or beer.",
          );
          return;
        }
        applications.push(app);
      }
      if (this.csvRows().length !== this.files().length) {
        this.error.set(
          "Upload exactly one image for each CSV row. Remove unused rows or add the missing images.",
        );
        return;
      }
    }
    this.submitted.emit({ files: this.files(), applications });
  }
}
