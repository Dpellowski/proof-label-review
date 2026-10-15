// Rebuild the bundled, original SVG artwork. These are demonstration labels.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../public/samples/", import.meta.url));
await mkdir(output, { recursive: true });
const esc = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const type = (value, y, size = 24, fill = "currentColor", extra = "") =>
  `<text x="400" y="${y}" fill="${fill}" text-anchor="middle" font-size="${size}" ${extra}>${esc(value)}</text>`;
const warning = (
  color,
  y = 900,
) => `<g fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="18">
  <text x="86" y="${y}" font-weight="700">GOVERNMENT WARNING:</text>
  <text x="86" y="${y + 28}">(1) According to the Surgeon General, women should not drink</text>
  <text x="86" y="${y + 53}">alcoholic beverages during pregnancy because of the risk of</text>
  <text x="86" y="${y + 78}">birth defects. (2) Consumption of alcoholic beverages impairs</text>
  <text x="86" y="${y + 103}">your ability to drive a car or operate machinery, and may</text>
  <text x="86" y="${y + 128}">cause health problems.</text>
</g>`;
const footer = (producer, color, y = 792) =>
  type(
    "DISTILLED AND BOTTLED BY",
    y,
    17,
    color,
    'font-family="Arial, sans-serif" letter-spacing="2"',
  ) + type(producer, y + 30, 21, color, 'font-family="Arial, sans-serif"');
const frame = (
  name,
  background,
  foreground,
  body,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120" role="img" aria-labelledby="title">
<title id="title">${esc(name)} — fictional sample label</title>
<rect width="800" height="1120" fill="${background}"/>
<g font-family="Georgia, 'Times New Roman', serif" color="${foreground}">${body}</g>
</svg>\n`;

const oldTom = frame(
  "Old Tom Distillery bourbon",
  "#f4efdf",
  "#293e34",
  `
  <rect x="30" y="30" width="740" height="1060" rx="2" fill="none" stroke="#9e7c45" stroke-width="2"/>
  <rect x="42" y="42" width="716" height="1036" rx="2" fill="none" stroke="#9e7c45"/>
  ${type("EST. 1891", 106, 23, "#84683e", 'letter-spacing="5"')}
  <g transform="translate(400 238)" fill="none" stroke="#a18450" stroke-width="2.4">
    <circle r="84"/><circle r="72" stroke-width="1"/>
    <path d="M-40 54C-66 12-54-26-24-52M40 54C66 12 54-26 24-52"/>
    <path d="M-43 34l-27-11m20-12-24-16m23-8-16-21m22 2-8-24M43 34l27-11M50 11l24-16M51-13l16-21M45-32l8-24"/>
    <path d="M-26-31H26M0-31V45M-15 45H15" stroke-width="6"/>
    <path d="M-104 0h-62m270 0h62" stroke-width="1"/>
    <path d="M-180 0l8-5 8 5-8 5zm344 0 8-5 8 5-8 5z" fill="#a18450"/>
  </g>
  ${type("OLD TOM", 419, 86, "#293e34", 'letter-spacing="3"')}
  ${type("DISTILLERY", 468, 31, "#293e34", 'letter-spacing="12"')}
  <path d="M150 510H650" stroke="#9e7c45"/>
  ${type("KENTUCKY STRAIGHT", 565, 25, "#293e34", 'letter-spacing="4"')}
  ${type("BOURBON WHISKEY", 612, 36, "#293e34", 'letter-spacing="1.5"')}
  ${type("SMALL BATCH · SLOW AGED", 659, 16, "#84683e", 'font-family="Arial, sans-serif" letter-spacing="3"')}
  ${type("45% Alc./Vol. (90 Proof)", 720, 25, "#293e34", 'font-family="Arial, Helvetica, sans-serif"')}
  ${type("750 mL", 757, 24, "#293e34")}
  ${footer("Old Tom Distillery, Bardstown, KY", "#293e34", 804)}
  <path d="M86 865H714" stroke="#b7a784"/>
  ${warning("#283b32")}
`,
);

const gin = frame(
  "Stone’s Throw gin",
  "#e4eddf",
  "#234c3c",
  `
  <rect x="32" y="32" width="736" height="1056" fill="none" stroke="#234c3c" stroke-width="2"/>
  <path d="M55 240V55h185M560 55h185v185M55 880v185h185M560 1065h185V880" fill="none" stroke="#729278"/>
  <g transform="translate(400 245)" fill="none" stroke="#4f7655" stroke-width="2">
    <circle r="131"/><circle r="122" stroke-dasharray="1 9"/>
    <path d="M-15 95Q-42 5 9-92M-22 36Q33 3 59-38M-28 5Q-78-5-82-45M-3-38q37 3 57-20"/>
    <path d="M9-92Q-20-63-3-38Q22-56 9-92M59-38q-33-2-37 27 30 0 37-27M-82-45q-8 31 24 39 9-28-24-39M54-58q-9 27-33 23-1-23 33-23" fill="#b3c7a9"/>
    <g fill="#234c3c"><circle cx="-30" cy="52" r="8"/><circle cx="-15" cy="42" r="8"/><circle cx="-13" cy="59" r="8"/><circle cx="-39" cy="-25" r="7"/><circle cx="-26" cy="-20" r="7"/></g>
  </g>
  ${type("STONE'S THROW", 455, 64, "#234c3c", 'letter-spacing="1"')}
  ${type("LONDON DRY GIN", 517, 31, "#234c3c", 'letter-spacing="5"')}
  <path d="M245 553h310" stroke="#729278"/>
  ${type("BOTANICAL SERIES", 603, 18, "#4c6d53", 'font-family="Arial, sans-serif" letter-spacing="4"')}
  ${type("JUNIPER · CORIANDER · CITRUS", 642, 16, "#4c6d53", 'font-family="Arial, sans-serif" letter-spacing="2"')}
  ${type("42% Alc./Vol.", 716, 28, "#234c3c")}
  ${type("750 mL", 758, 24, "#234c3c")}
  ${footer("Stone's Throw Distilling, Portland, OR", "#234c3c", 804)}
  <path d="M86 865H714" stroke="#9bb29b"/>
  ${warning("#234c3c")}
`,
);

const wine = frame(
  "Maison Lucette wine",
  "#f4e9e5",
  "#673344",
  `
  <rect x="38" y="38" width="724" height="1044" fill="none" stroke="#9b6870"/>
  <path d="M70 70h660v290H70z" fill="#e8d5d0"/>
  <circle cx="400" cy="181" r="64" fill="#c8886f"/>
  <g fill="none" stroke="#90686b" stroke-width="2">
    <path d="M70 303Q230 196 400 284T730 285M70 335Q246 237 429 311T730 323"/>
    <path d="M70 355Q230 287 400 335T730 347M210 248L295 360M265 244l76 116M322 257l66 103M485 311l-18 49M550 312l-13 48M616 303l-8 57"/>
  </g>
  ${type("MAISON", 450, 53, "#673344", 'letter-spacing="9"')}
  ${type("LUCETTE", 523, 74, "#673344", 'letter-spacing="7"')}
  ${type("SAUVIGNON BLANC", 589, 28, "#673344", 'letter-spacing="4"')}
  ${type("BORDEAUX · 2024", 632, 21, "#996b70", 'letter-spacing="3"')}
  <path d="M270 667H530" stroke="#bd999b"/>
  ${type("12.5% Alc./Vol.", 718, 27, "#673344")}
  ${type("750 mL", 755, 24, "#673344")}
  ${type("PRODUCED AND BOTTLED BY", 797, 17, "#673344", 'font-family="Arial, sans-serif" letter-spacing="2"')}
  ${type("Maison Lucette, Bordeaux, France", 825, 21, "#673344", 'font-family="Arial, sans-serif"')}
  ${type("PRODUCT OF FRANCE", 859, 17, "#673344", 'font-family="Arial, sans-serif" letter-spacing="3"')}
  ${warning("#502b37", 907)}
`,
);

const beer = frame(
  "Pacific Standard pale ale",
  "#f0e8d4",
  "#214e54",
  `
  <rect x="28" y="28" width="744" height="1064" rx="4" fill="none" stroke="#214e54" stroke-width="3"/>
  <circle cx="400" cy="254" r="125" fill="#df8b4e"/>
  <path d="M70 280Q180 225 290 280T510 280T730 280V355H70Z" fill="#89ada3"/>
  <path d="M70 316Q180 261 290 316T510 316T730 316V390H70Z" fill="#447b7d"/>
  <path d="M70 351Q180 296 290 351T510 351T730 351V426H70Z" fill="#214e54"/>
  <path d="M111 174h80m-45-32v65M640 202h42m-21-21v42" stroke="#214e54" stroke-width="2"/>
  ${type("PACIFIC", 544, 92, "#214e54", 'font-family="Arial, sans-serif" font-weight="900" letter-spacing="-3"')}
  ${type("STANDARD", 633, 87, "#214e54", 'font-family="Arial, sans-serif" font-weight="900" letter-spacing="-3"')}
  ${type("WEST COAST PALE ALE", 698, 27, "#214e54", 'font-family="Arial, sans-serif" letter-spacing="3"')}
  ${type("BRIGHT HOPS. OPEN WATER.", 743, 17, "#447b7d", 'font-family="Arial, sans-serif" letter-spacing="3"')}
  <path d="M160 788H640" stroke="#8eaaa1"/>
  ${type("5.2% Alc./Vol.", 847, 29, "#214e54")}
  ${type("355 mL", 890, 24, "#214e54")}
  ${type("BREWED AND CANNED BY", 967, 17, "#214e54", 'font-family="Arial, sans-serif" letter-spacing="2"')}
  ${type("Pacific Standard Brewing, San Diego, CA", 1001, 21, "#214e54", 'font-family="Arial, sans-serif"')}
`,
);

const amber = frame(
  "Amber Field Chardonnay",
  "#f6efd9",
  "#715324",
  `
  <rect x="34" y="34" width="732" height="1052" fill="none" stroke="#b89b58"/>
  <path d="M400 101a152 152 0 0 1 152 152v117H248V253a152 152 0 0 1 152-152Z" fill="#eadcaa"/>
  <circle cx="400" cy="224" r="77" fill="#c39b47"/>
  <g stroke="#8b793c" fill="none" stroke-width="2.5">
    <path d="M332 372q-20-137-60-180M394 372q14-126 62-196M453 372q42-77 78-108"/>
    <path d="M281 209l-24-6m31 21-23 0m31 21-24 2m29 19-22 5m28 17-22 8M448 192l20-4m-30 23 22-2m-33 23 23-1m-35 23 22 0m-32 24 24 0m-36 24 22 0M519 274l20 3m-34 14 20 5m-35 13 20 6m-33 12 20 7"/>
  </g>
  ${type("AMBER FIELD", 481, 64, "#715324", 'letter-spacing="2"')}
  ${type("CHARDONNAY", 546, 29, "#715324", 'letter-spacing="6"')}
  ${type("SONOMA COUNTY · 2024", 593, 21, "#9f7b32", 'letter-spacing="2"')}
  ${type("SUN GROWN. SLOW MADE.", 644, 17, "#9f7b32", 'font-family="Arial, sans-serif" letter-spacing="3"')}
  <path d="M270 674h260" stroke="#c9b477"/>
  ${type("12% Alc./Vol.", 722, 27, "#715324")}
  ${type("750 mL", 760, 24, "#715324")}
  ${type("PRODUCED AND BOTTLED BY", 804, 17, "#715324", 'font-family="Arial, sans-serif" letter-spacing="2"')}
  ${type("Amber Field Cellars, Sonoma, CA", 834, 21, "#715324", 'font-family="Arial, sans-serif"')}
  <path d="M86 865H714" stroke="#c9b477"/>
  ${warning("#5f481e")}
`,
);

const tequila = frame(
  "Costa Azul tequila",
  "#eceee5",
  "#244e77",
  `
  <rect x="30" y="30" width="740" height="1060" fill="none" stroke="#244e77" stroke-width="2"/>
  <path d="M50 50h700v320H50z" fill="#244e77"/>
  <circle cx="400" cy="206" r="110" fill="none" stroke="#b6c3bd" stroke-width="1.5"/>
  <g fill="none" stroke="#e3e7d4" stroke-width="2.3">
    <path d="M400 330Q320 265 285 174Q369 222 400 330Q418 205 400 100Q371 207 400 330Q449 212 518 166Q482 261 400 330Q475 284 544 277Q468 335 400 330Q318 335 255 280Q334 287 400 330Z"/>
    <path d="M400 330Q361 210 335 135M400 330q40-112 69-200"/>
  </g>
  ${type("COSTA", 479, 88, "#244e77", 'letter-spacing="7"')}
  ${type("AZUL", 574, 101, "#244e77", 'letter-spacing="12"')}
  ${type("TEQUILA BLANCO", 635, 30, "#244e77", 'letter-spacing="4"')}
  ${type("100% BLUE AGAVE", 675, 18, "#658080", 'font-family="Arial, sans-serif" letter-spacing="3"')}
  ${type("40% Alc./Vol. (80 Proof)", 731, 26, "#244e77")}
  ${type("750 mL", 767, 24, "#244e77")}
  ${footer("Destilería Costa Azul, Jalisco", "#244e77", 808)}
  <path d="M86 868H714" stroke="#abbab6"/>
  ${warning("#244767", 903)}
`,
);

for (const [filename, svg] of [
  ["old-tom-bourbon.svg", oldTom],
  ["stones-throw-gin.svg", gin],
  ["maison-lucette-wine.svg", wine],
  ["pacific-standard-beer.svg", beer],
  ["amber-field-wine.svg", amber],
  ["costa-azul-tequila.svg", tequila],
]) {
  await writeFile(`${output}/${filename}`, svg, "utf8");
}

const csv = `filename,brand,beverage,classType,abv,netContents,producer,country,imported
old-tom-bourbon.png,Old Tom Distillery,spirits,Kentucky Straight Bourbon Whiskey,45%,750 mL,"Old Tom Distillery, Bardstown, KY",United States,false
stones-throw-gin.png,Stone’s Throw,spirits,London Dry Gin,42%,750 mL,"Stone’s Throw Distilling, Portland, OR",United States,false
maison-lucette-wine.png,Maison Lucette,wine,Sauvignon Blanc,13%,750 mL,"Maison Lucette, Bordeaux, France",France,true
pacific-standard-beer.png,Pacific Standard,beer,West Coast Pale Ale,5.2%,355 mL,"Pacific Standard Brewing, San Diego, CA",United States,false
amber-field-wine.png,Amber Field,wine,Chardonnay,12%,750 mL,"Amber Field Cellars, Sonoma, CA",United States,false
costa-azul-tequila.png,Costa Azul,spirits,Tequila Blanco,40%,750 mL,"Destilería Costa Azul, Jalisco",Mexico,true
`;
await writeFile(`${output}/batch-template.csv`, csv, "utf8");
console.log("Generated six original sample labels and batch-template.csv.");
