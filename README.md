# Proof — alcohol label review

A deployable Angular application that compares alcohol label artwork with an application's declared fields. Reviewers can open a sample, upload a label for real OCR, inspect each comparison beside the artwork, confirm warning typography, and export review results. Multiple images and a CSV manifest support batch review.

This is a standalone take-home prototype. A comparison result supports a reviewer's decision; it is not a TTB approval or a complete legal compliance assessment.

## Run locally

Use Node.js 22.12 or later in the Node 22 release line, npm, and a modern browser with WebAssembly and Web Workers.

```sh
npm install
npm run dev
```

Open the local URL printed by Angular, normally `http://127.0.0.1:4200`. `npm start` also starts the development server.

```sh
npm test       # Verification and CSV regression tests
npm run build # Production application and local OCR assets
npm run preview
```

The production preview runs at `http://127.0.0.1:4173`. The complete website is in `dist/`.

For browser workflow checks, keep `npm run preview` running in another terminal, then run `node scripts/smoke-app.mjs`. The script uses installed Microsoft Edge by default; set `PROOF_QA_BROWSER` to another Playwright browser channel when needed. `node scripts/smoke-ocr.mjs` separately tests real OCR, worker cancellation/recovery, and same-origin runtime assets using installed Chrome. The browser workflow suite covers approval, requested changes, persistence, actual single/batch OCR, local history clearing, keyboard focus, and mobile navigation.

The final local checks passed 23 unit tests, ten browser workflow checks, the production Angular build, and a full dependency audit with zero reported vulnerabilities. These are prototype checks, not a full accessibility certification or representative OCR accuracy study.

With the preview running, `node scripts/smoke-app.mjs` exercises the browser workflows, including real single/batch OCR, decision persistence, and mobile navigation. It uses installed Microsoft Edge by default and saves screenshots plus a report under `.openai/`; set `PROOF_QA_BROWSER` to another Playwright browser channel if needed. This suite changes only its isolated browser context.

## Try the review workflow

1. Open **Old Tom Distillery** to inspect a sample application and label. Its fields match, and the warning's visual styling remains a reviewer check.
2. Compare the expected application values with the extracted values. Open the OCR text when a value needs investigation.
3. Inspect the artwork and confirm the warning's typography. This human check is separate from the exact warning text comparison.
4. Try the other samples for an ABV mismatch, a missing warning, an imported label with no country of origin, and capitalization/apostrophe normalization.
5. Upload a JPEG, PNG, or WebP label to run Tesseract OCR on your own image. Enter the application values to compare against the extracted text.

Sample images and application fields are fictional. Sample observations and confidence values are curated fixtures, explicitly presented as samples. They are not live OCR output, benchmark measurements, or real applications. Uploaded images take the actual OCR path.

## Batch application data

Use the batch workflow to select multiple label images and import an application CSV. Match each row's `filename` to the corresponding image filename. Quote values containing commas, including producer addresses.

Each batch supports up to 300 images, 10 MB per image, and 250 MB total. The workspace holds up to 600 reviews; export and clear its history before starting another large batch.

```csv
filename,brand,beverage,classType,abv,netContents,producer,country,imported
bourbon.png,Old Tom Distillery,spirits,Kentucky Straight Bourbon Whiskey,45%,750 mL,"Old Tom Distillery, Bardstown, KY",United States,false
```

- `beverage`: `spirits`, `wine`, or `beer`.
- `abv`: application alcohol percentage, for example `45%`.
- `netContents`: application volume, for example `750 mL`, `0.75 L`, or `25.4 fl oz`.
- `producer`: the producer/bottler name and address as expected on the label.
- `imported`: `true` or `false`; country is compared for imported products.

The downloadable [sample manifest](public/samples/batch-template.csv) matches the six bundled PNG files in `public/samples/`. Upload these PNGs with the manifest to exercise real batch OCR, or use your own photographs and update the filenames. Original SVG artwork is included as editable source; uploaded SVG files are intentionally outside the supported image types.

## Deploy

See [the deployment guide](docs/deployment.md) for exact Azure Static Web Apps settings and submission checks.

Run `npm ci` followed by `npm run build`, then publish the **contents of `dist/`** to an HTTPS static website host. The configured build output is `dist/`, with no additional `browser/` subdirectory. The repository requires no application server, database, API key, or paid model endpoint.

The host must serve the entire build, including `ocr/` and `samples/`. Serve JavaScript as JavaScript, `.wasm` as `application/wasm`, and `eng.traineddata.gz` as a downloadable gzip file. Avoid configuring the compressed language file as an HTTP `Content-Encoding: gzip` response; the OCR worker handles that file's decompression itself. Use a normal HTTP server for local testing rather than opening `index.html` from the filesystem.

OCR worker code, WebAssembly variants, and English model data are copied from installed npm packages into `public/ocr/` during startup/build. The application serves these assets from its own origin, so it does not require an external OCR CDN or ML API. Keep the npm lockfile when deploying.

## Approach and structure

The stack is **Angular 21, TypeScript, Angular CLI, Tesseract.js, Papa Parse, and Vitest**. Angular's standalone component model keeps the prototype small while providing typed templates and forms. The UI is a static browser application; Tesseract's LSTM neural OCR engine runs in Web Workers, and deterministic comparison rules make individual findings explainable.

| Location                      | Responsibility                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `src/app.ts` / `src/app.html` | Review queue, application editing, uploads, batch flow, and reviewer actions |
| `src/styles.css`              | Responsive application styling                                               |
| `src/lib/ocr.ts`              | Local OCR worker pool, preprocessing, progress, cancellation, timeouts       |
| `src/lib/verification.ts`     | Pure field comparisons, warning checks, confidence safeguards                |
| `src/lib/csv.ts`              | Quoted CSV parsing and spreadsheet-safe exports                              |
| `src/lib/samples.ts`          | Explicitly identified demonstration observations and applications            |
| `public/samples/`             | Six original label illustrations and batch manifest                          |
| `scripts/copy-ocr-assets.mjs` | Packages the OCR runtime for same-origin hosting                             |

Regenerate the original SVG sample artwork with `node scripts/generate-sample-artwork.mjs`. The optional authoring utility `node scripts/render-sample-pngs.mjs --channel msedge` renders PNGs using an installed Edge browser; omit the channel argument to use Playwright Chromium.

## Verification behavior

- Ordinary text comparisons normalize capitalization, whitespace, and curly apostrophes. Brand and producer names still need to occur as complete text values rather than arbitrary substrings.
- ABV is compared numerically, including consistency with a US proof declaration when present. Net contents support mL, L, and US fluid-ounce conversion with a small rounding tolerance.
- The government warning is compared against its complete required statement. Only layout whitespace is ignored; capitalization, wording, punctuation, and the uppercase header are checked.
- OCR cannot reliably prove bold weight, minimum type size, contrast, or placement. Warning typography always requires visual confirmation by a reviewer.
- Low-confidence OCR cannot silently produce an automatic match. Reviewers can inspect raw extracted text, request a clearer image, and correct application values. OCR text is preserved without manual edits.
- The application checks the fields supplied for the prototype. It does not apply all beverage-specific exemptions, determine whether a product belongs to a particular legal class, or perform a complete label-layout assessment.

The warning reference used for the implementation is the [TTB health warning statement guidance](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning). This prototype deliberately avoids inferring legal compliance from OCR alone.

## Performance and trade-offs

The stakeholder's five-second target is a design goal, not a guaranteed service level. OCR workers are reused, large images are resized, English model files are hosted locally, and the pool limits concurrent work to two images. The interface reports progress and actual processing time for uploads. Sample fixtures do not report invented processing durations.

A first run must load and initialize the OCR engine, which can take longer. Image size, label typography, browser, CPU, network, and glare affect both speed and accuracy. A large batch takes proportionally longer; it does not process hundreds of labels in five seconds. Initialization and recognition have explicit timeouts with actionable error messages.

OCR supports English text and automatic rotation, with basic image resizing and orientation handling. Curved bottles, severe perspective, low resolution, glare, unusual type, and very small warning text may still require a better photo or manual correction. There is no cloud vision fallback because the assignment emphasizes a standalone prototype and restricted networks.

## Data and privacy

Uploaded label images are processed in the current browser and are not sent to an OCR service. Image files remain in session memory. Review/application metadata and results use browser local storage, so the queue can persist on that browser; this is not a shared database or a durable document archive. Clearing browser storage removes the saved state. Browser storage is not encrypted application storage and should not contain sensitive production data.

There is no authentication, server-side authorization, COLA integration, multi-user queue, or production retention system. The site host still serves the application and runtime files and may maintain normal HTTP access logs. The app does not send label content to an analytics or model provider. A production procurement would need its own identity, access, retention, security, accessibility, regulatory, and performance review.
