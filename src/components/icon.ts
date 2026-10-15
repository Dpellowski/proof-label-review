import { Component, Input } from "@angular/core";

const paths: Record<string, string[]> = {
  check: ["M5 12l4 4L19 6"],
  plus: ["M12 5v14", "M5 12h14"],
  grid: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  layers: ["m12 3 10 5-10 5L2 8Z", "m2 12 10 5 10-5", "m2 16 10 5 10-5"],
  shield: ["M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z", "m8 12 3 3 5-5"],
  upload: ["M12 16V3", "m7 8 5-5 5 5", "M4 14v6h16v-6"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M4 16v5h16v-5"],
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  chevron: ["m9 5 7 7-7 7"],
  down: ["m6 9 6 6 6-6"],
  close: ["m6 6 12 12", "M6 18 18 6"],
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M12 7v5l3 2"],
  flag: ["M4 22V3", "M4 3c4-4 8 4 16 0v11c-8 4-12-4-16 0"],
  info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M12 11v6", "M12 7h.01"],
  alert: ["M12 3 2 21h20Z", "M12 9v5", "M12 17h.01"],
  file: ["M14 2H5v20h14V7Z", "M14 2v6h6", "M8 12h8", "M8 16h6"],
  bottle: ["M9 2h6v6l3 4v10H6V12l3-4Z", "M9 5h6", "M6 15h12"],
  wine: ["M7 2h10l1 6a6 6 0 0 1-12 0Z", "M12 14v8", "M8 22h8", "M6 7h12"],
  beer: ["M4 5h12v16H4Z", "M16 8h4v9h-4", "M8 9v8", "M12 9v8", "M4 5V3h12v2"],
  sparkles: [
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
    "M21 2v4",
    "M19 4h4",
  ],
  external: ["M14 3h7v7", "m10 14 11-11", "M10 3H3v18h18v-7"],
  zoom: [
    "M21 21l-5-5",
    "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    "M7 10h6",
    "M10 7v6",
  ],
  refresh: [
    "M20 7v5h-5",
    "M4 17v-5h5",
    "M6 7a7 7 0 0 1 12-2l2 3",
    "M18 17a7 7 0 0 1-12 2l-2-3",
  ],
  arrow: ["M4 12h16", "m14 6 6 6-6 6"],
  book: [
    "M12 5C7 1 2 3 2 3v17s5-2 10 2c5-4 10-2 10-2V3s-5-2-10 2Z",
    "M12 5v17",
  ],
  lock: ["M5 10h14v12H5Z", "M8 10V6a4 4 0 0 1 8 0v4"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
};
@Component({
  selector: "p-icon",
  standalone: true,
  template: `<svg
    [attr.width]="size"
    [attr.height]="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    @for (path of iconPaths; track $index) {
      <path [attr.d]="path" />
    }
  </svg>`,
  styles: [
    ":host{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;vertical-align:middle}",
  ],
})
export class IconComponent {
  @Input() name = "file";
  @Input() size = 20;
  get iconPaths() {
    return paths[this.name] || paths["file"];
  }
}
