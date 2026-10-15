import type { ApplicationFields } from "./verification";

/** Curated demonstration observations, not OCR output. Real uploads use Tesseract. */
export interface SampleLabel {
  id: string;
  name: string;
  filename: string;
  application: ApplicationFields;
  text: string;
  confidence: number;
  imageUrl: string;
  tag: "matched" | "flagged" | "review";
  createdAt: string;
}

const WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const SAMPLE_LABELS: SampleLabel[] = [
  {
    id: "old-tom",
    name: "Old Tom Distillery",
    filename: "old-tom-bourbon.png",
    application: {
      brand: "Old Tom Distillery",
      beverage: "spirits",
      classType: "Kentucky Straight Bourbon Whiskey",
      abv: "45%",
      netContents: "750 mL",
      producer: "Old Tom Distillery, Bardstown, KY",
      country: "United States",
      imported: false,
    },
    text: `EST. 1891\nOLD TOM DISTILLERY\nKENTUCKY STRAIGHT\nBOURBON WHISKEY\nSMALL BATCH · SLOW AGED\n45% Alc./Vol. (90 Proof)\n750 mL\nDISTILLED AND BOTTLED BY\nOld Tom Distillery, Bardstown, KY\n${WARNING}`,
    confidence: 98,
    imageUrl: "samples/old-tom-bourbon.svg",
    tag: "review",
    createdAt: "2026-10-15T13:42:00.000Z",
  },
  {
    id: "stones-throw",
    name: "Stone’s Throw",
    filename: "stones-throw-gin.png",
    application: {
      brand: "Stone’s Throw",
      beverage: "spirits",
      classType: "London Dry Gin",
      abv: "42%",
      netContents: "750 mL",
      producer: "Stone’s Throw Distilling, Portland, OR",
      country: "United States",
      imported: false,
    },
    text: `STONE'S THROW\nLONDON DRY GIN\nBOTANICAL SERIES\nJUNIPER · CORIANDER · CITRUS\n42% Alc./Vol.\n750 mL\nDISTILLED AND BOTTLED BY\nStone's Throw Distilling, Portland, OR\n${WARNING}`,
    confidence: 97,
    imageUrl: "samples/stones-throw-gin.svg",
    tag: "matched",
    createdAt: "2026-10-15T13:38:00.000Z",
  },
  {
    id: "maison-lucette",
    name: "Maison Lucette",
    filename: "maison-lucette-wine.png",
    application: {
      brand: "Maison Lucette",
      beverage: "wine",
      classType: "Sauvignon Blanc",
      abv: "13%",
      netContents: "750 mL",
      producer: "Maison Lucette, Bordeaux, France",
      country: "France",
      imported: true,
    },
    text: `MAISON\nLUCETTE\nSAUVIGNON BLANC\nBORDEAUX · 2024\n12.5% Alc./Vol.\n750 mL\nPRODUCED AND BOTTLED BY\nMaison Lucette, Bordeaux, France\nPRODUCT OF FRANCE\n${WARNING}`,
    confidence: 96,
    imageUrl: "samples/maison-lucette-wine.svg",
    tag: "flagged",
    createdAt: "2026-10-15T13:31:00.000Z",
  },
  {
    id: "pacific-standard",
    name: "Pacific Standard",
    filename: "pacific-standard-beer.png",
    application: {
      brand: "Pacific Standard",
      beverage: "beer",
      classType: "West Coast Pale Ale",
      abv: "5.2%",
      netContents: "355 mL",
      producer: "Pacific Standard Brewing, San Diego, CA",
      country: "United States",
      imported: false,
    },
    text: "PACIFIC\nSTANDARD\nWEST COAST PALE ALE\nBRIGHT HOPS. OPEN WATER.\n5.2% Alc./Vol.\n355 mL\nBREWED AND CANNED BY\nPacific Standard Brewing, San Diego, CA",
    confidence: 97,
    imageUrl: "samples/pacific-standard-beer.svg",
    tag: "flagged",
    createdAt: "2026-10-15T13:26:00.000Z",
  },
  {
    id: "amber-field",
    name: "Amber Field",
    filename: "amber-field-wine.png",
    application: {
      brand: "Amber Field",
      beverage: "wine",
      classType: "Chardonnay",
      abv: "12%",
      netContents: "750 mL",
      producer: "Amber Field Cellars, Sonoma, CA",
      country: "United States",
      imported: false,
    },
    text: `AMBER FIELD\nCHARDONNAY\nSONOMA COUNTY · 2024\nSUN GROWN. SLOW MADE.\n12% Alc./Vol.\n750 mL\nPRODUCED AND BOTTLED BY\nAmber Field Cellars, Sonoma, CA\n${WARNING}`,
    confidence: 98,
    imageUrl: "samples/amber-field-wine.svg",
    tag: "matched",
    createdAt: "2026-10-15T13:19:00.000Z",
  },
  {
    id: "costa-azul",
    name: "Costa Azul",
    filename: "costa-azul-tequila.png",
    application: {
      brand: "Costa Azul",
      beverage: "spirits",
      classType: "Tequila Blanco",
      abv: "40%",
      netContents: "750 mL",
      producer: "Destilería Costa Azul, Jalisco",
      country: "Mexico",
      imported: true,
    },
    text: `COSTA\nAZUL\nTEQUILA BLANCO\n100% BLUE AGAVE\n40% Alc./Vol. (80 Proof)\n750 mL\nDISTILLED AND BOTTLED BY\nDestilería Costa Azul, Jalisco\n${WARNING}`,
    confidence: 96,
    imageUrl: "samples/costa-azul-tequila.svg",
    tag: "flagged",
    createdAt: "2026-10-15T13:11:00.000Z",
  },
];
