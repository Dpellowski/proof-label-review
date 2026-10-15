import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(projectRoot, "public", "ocr");
const packageRoot = (name) => dirname(require.resolve(`${name}/package.json`));
const tesseractRoot = packageRoot("tesseract.js");
const coreRoot = packageRoot("tesseract.js-core");
const englishRoot = packageRoot("@tesseract.js-data/eng");

await mkdir(destination, { recursive: true });

// Include all four loader variants plus their WASM payloads. The library chooses
// the appropriate SIMD/LSTM implementation for each browser at runtime.
const coreFiles = (await readdir(coreRoot)).filter((file) =>
  /^tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(file),
);
if (coreFiles.length < 8)
  throw new Error(
    "The installed Tesseract core package is missing a required runtime variant.",
  );
const languageCandidates = [
  join(englishRoot, "4.0.0_best_int", "eng.traineddata.gz"),
  join(englishRoot, "4.0.0", "eng.traineddata.gz"),
  join(englishRoot, "eng.traineddata.gz"),
];
let languageFile;
for (const candidate of languageCandidates) {
  try {
    if ((await stat(candidate)).isFile()) {
      languageFile = candidate;
      break;
    }
  } catch {
    /* try next packaged data location */
  }
}
if (!languageFile)
  throw new Error(
    "The installed English OCR data package has no eng.traineddata.gz file.",
  );

const files = [
  [join(tesseractRoot, "dist", "worker.min.js"), "worker.min.js"],
  ...coreFiles.map((file) => [join(coreRoot, file), file]),
  [languageFile, "eng.traineddata.gz"],
];
await Promise.all(
  files.map(([source, name]) => copyFile(source, join(destination, name))),
);
const sizes = await Promise.all(
  files.map(([, name]) => stat(join(destination, name))),
);
const totalBytes = sizes.reduce((sum, file) => sum + file.size, 0);
console.log(
  `Copied ${files.length} local OCR assets (${(totalBytes / 1024 / 1024).toFixed(1)} MiB) to public/ocr.`,
);
