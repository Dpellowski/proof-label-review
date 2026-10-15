import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { ApplicationFields } from "../lib/verification";

@Component({
  selector: "p-application-form",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="application-fields">
      <div class="field full">
        <label [for]="prefix + '-brand'"
          >Brand name <span aria-hidden="true">*</span></label
        >
        <input
          [id]="prefix + '-brand'"
          [name]="prefix + '-brand'"
          type="text"
          required
          autocomplete="off"
          placeholder="e.g. Old Tom Distillery"
          [ngModel]="value.brand"
          (ngModelChange)="update('brand', $event)"
        />
      </div>
      <div class="field">
        <label [for]="prefix + '-beverage'"
          >Beverage category <span aria-hidden="true">*</span></label
        >
        <select
          [id]="prefix + '-beverage'"
          [name]="prefix + '-beverage'"
          required
          [ngModel]="value.beverage"
          (ngModelChange)="update('beverage', $event)"
        >
          <option value="spirits">Distilled spirits</option>
          <option value="wine">Wine</option>
          <option value="beer">Beer / malt beverage</option>
        </select>
      </div>
      <div class="field">
        <label [for]="prefix + '-class'"
          >Class / type <span aria-hidden="true">*</span></label
        >
        <input
          [id]="prefix + '-class'"
          [name]="prefix + '-class'"
          type="text"
          required
          autocomplete="off"
          placeholder="e.g. Straight Bourbon Whiskey"
          [ngModel]="value.classType"
          (ngModelChange)="update('classType', $event)"
        />
      </div>
      <div class="field">
        <label [for]="prefix + '-abv'"
          >Alcohol content (ABV) <span aria-hidden="true">*</span></label
        >
        <input
          [id]="prefix + '-abv'"
          [name]="prefix + '-abv'"
          type="text"
          required
          autocomplete="off"
          placeholder="e.g. 45%"
          [ngModel]="value.abv"
          (ngModelChange)="update('abv', $event)"
        />
      </div>
      <div class="field">
        <label [for]="prefix + '-volume'"
          >Net contents <span aria-hidden="true">*</span></label
        >
        <input
          [id]="prefix + '-volume'"
          [name]="prefix + '-volume'"
          type="text"
          required
          autocomplete="off"
          placeholder="e.g. 750 mL"
          [ngModel]="value.netContents"
          (ngModelChange)="update('netContents', $event)"
        />
      </div>
      <div class="field full">
        <label [for]="prefix + '-producer'"
          >Producer / bottler and address
          <span aria-hidden="true">*</span></label
        >
        <input
          [id]="prefix + '-producer'"
          [name]="prefix + '-producer'"
          type="text"
          required
          autocomplete="off"
          placeholder="Name, city, state / country"
          [ngModel]="value.producer"
          (ngModelChange)="update('producer', $event)"
        />
      </div>
      <div class="import-field full">
        <input
          [id]="prefix + '-imported'"
          [name]="prefix + '-imported'"
          type="checkbox"
          [ngModel]="value.imported"
          (ngModelChange)="update('imported', $event)"
        />
        <label [for]="prefix + '-imported'">Imported product</label>
      </div>
      @if (value.imported) {
        <div class="field full">
          <label [for]="prefix + '-country'"
            >Country of origin <span aria-hidden="true">*</span></label
          >
          <input
            [id]="prefix + '-country'"
            [name]="prefix + '-country'"
            type="text"
            required
            autocomplete="off"
            placeholder="e.g. France"
            [ngModel]="value.country"
            (ngModelChange)="update('country', $event)"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .application-fields {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 17px 16px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        min-width: 0;
      }
      .full {
        grid-column: 1 / -1;
      }
      label {
        color: #49554d;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
      }
      label span {
        color: #8d998f;
        margin-left: 2px;
      }
      input:not([type="checkbox"]),
      select {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 43px;
        padding: 10px 12px;
        border: 1px solid #dcded8;
        border-radius: 8px;
        color: #273e34;
        background: #fff;
        font: inherit;
        font-size: 13px;
        transition:
          border-color 120ms,
          box-shadow 120ms;
      }
      input::placeholder {
        color: #92998e;
        opacity: 1;
      }
      input:not([type="checkbox"]):focus,
      select:focus {
        outline: 0;
        border-color: #43836b;
        box-shadow: 0 0 0 3px #43836b18;
      }
      select {
        padding-right: 24px;
        cursor: pointer;
      }
      .import-field {
        display: flex;
        align-items: center;
        gap: 9px;
        padding-top: 1px;
      }
      .import-field input {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: #23614a;
        cursor: pointer;
      }
      .import-field label {
        color: #455a4c;
        cursor: pointer;
        font-weight: 500;
      }
      .import-field input:focus-visible {
        outline: 2px solid #43836b;
        outline-offset: 3px;
      }
      @media (max-width: 480px) {
        .application-fields {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class ApplicationFormComponent {
  @Input({ required: true }) value!: ApplicationFields;
  @Input() prefix = "application";
  @Output() valueChange = new EventEmitter<ApplicationFields>();

  update<Key extends keyof ApplicationFields>(
    key: Key,
    value: ApplicationFields[Key],
  ): void {
    this.valueChange.emit({ ...this.value, [key]: value });
  }
}
