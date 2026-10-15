// Optional authoring utility, not part of the website build.
// Example: node scripts/render-sample-pngs.mjs --channel msedge
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const channelIndex = process.argv.indexOf("--channel");
const channel = channelIndex >= 0 ? process.argv[channelIndex + 1] : undefined;
const directory = fileURLToPath(new URL("../public/samples/", import.meta.url));
const browser = await chromium.launch({
  headless: true,
  ...(channel ? { channel } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 800, height: 1120 },
    deviceScaleFactor: 2,
  });
  for (const name of [
    "old-tom-bourbon",
    "stones-throw-gin",
    "maison-lucette-wine",
    "pacific-standard-beer",
    "amber-field-wine",
    "costa-azul-tequila",
  ]) {
    const svg = await readFile(`${directory}/${name}.svg`, "utf8");
    await page.setContent(
      "<style>html,body{margin:0;width:800px;height:1120px;overflow:hidden}svg{display:block}</style>" +
        svg,
    );
    await page.screenshot({ path: `${directory}/${name}.png` });
  }
  console.log("Rendered six 1600 x 2240 PNG test labels.");
} finally {
  await browser.close();
}
