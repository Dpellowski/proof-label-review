# Engineering approach and requirement coverage

Proof is a standalone review prototype. An agent supplies application values, uploads label artwork, and compares the extracted text with a visible checklist. The software identifies matches, differences, and items needing visual review. A recorded reviewer decision is separate from the automated result; the prototype does not issue a TTB Certificate of Label Approval.

## Architecture

The application uses Angular 21, TypeScript, Angular signals, and a static production build. It needs no application server, database, API key, or external inference endpoint. The generated `dist` directory can be deployed to a static website host. Angular was selected to satisfy the requested framework while keeping deployment straightforward.

Tesseract.js performs pretrained LSTM OCR in browser Web Workers. `scripts/copy-ocr-assets.mjs` packages the worker, English language data, and compatible WebAssembly variants into `public/ocr`. Runtime requests use the application's origin, including on a subpath host. Network restrictions therefore do not require access to a separate ML vendor or CDN. The first visit still needs to download the site's assets.

The separation of responsibilities is deliberate:

| Layer                  | Implementation                         | Purpose                                                                            |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| Review state           | `src/lib/review-store.ts`              | Angular signals, image queue, application edits, reviewer decisions, local history |
| Text extraction        | `src/lib/ocr.ts`                       | Reusable local workers, image preparation, progress, rotation, timeouts            |
| Comparison             | `src/lib/verification.ts`              | Pure deterministic checks against the application and standard warning             |
| Batch exchange         | `src/lib/csv.ts`                       | Quoted CSV parsing, validation, and spreadsheet-safe export                        |
| Demonstration fixtures | `src/lib/samples.ts`, `public/samples` | Synthetic artwork and explicitly curated example observations                      |

The OCR model reads the artwork; deterministic code performs the comparison. This makes the warning comparison reproducible and avoids relying on a language model to decide whether altered statutory wording is acceptable. No image or label text is sent to an inference service.

## Requirement traceability

| Requirement or stakeholder need                                 | Implemented behavior                                                                                                     | Validation or limit                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand matches despite capitalization and apostrophe differences | Unicode normalization, case-insensitive matching, whitespace normalization, curly/straight apostrophe equivalence        | Tests include `STONE’S THROW` versus `Stone's Throw` and reject `STONE’S THROWBACK`                                                                                    |
| Class/type, producer name and address match                     | Supplied phrases must appear as complete tokens; absent application values require review                                | Exact supplied punctuation is retained; semantic address equivalence and beverage classifications are not inferred                                                     |
| Alcohol content matches                                         | Numeric ABV comparison, recognition of alcohol-context percentages, and US proof crosscheck                              | Conflicting ABVs and proof are flagged; `100% BLUE AGAVE` is not treated as ABV; proof alone does not establish an ABV match                                           |
| Net contents match                                              | mL, L, and US fluid-ounce conversion; contradictory declarations are flagged                                             | 0.2% rounding tolerance with a 0.5 mL minimum accommodates rounded dual-unit declarations; this is an application comparison tolerance, not a legal labeling tolerance |
| Country of origin on imports                                    | Requires the supplied country; an explicit recognized origin phrase can match                                            | A country seen only in a producer/importer address or marketing text requires review; unrecognized valid origin formats may also require review                        |
| Exact government warning                                        | Full wording, punctuation, and capitalization must match; layout whitespace can differ                                   | Missing text, changed punctuation, wrong header case, attached trailing words, and duplicate warning declarations are flagged                                          |
| Bold uppercase warning header                                   | Header case is checked from raw OCR; typography requires an explicit reviewer confirmation                               | OCR cannot establish bold weight, body weight, minimum type size, contrast, or label placement                                                                         |
| About five seconds per label                                    | Worker warmup, reuse, bounded image dimensions, and two-worker concurrency reduce repeated overhead                      | A target, not a guarantee. Cold model loading and difficult images can exceed five seconds; benchmark methodology below                                                |
| Batch submissions                                               | Multiple images enter a queue; CSV supplies corresponding application values; two consumers process records concurrently | Browser CPU and memory constrain large batches; there is no backend job continuation after closing the page                                                            |
| Broad range of computer familiarity                             | Visible image and checklist, explicit result labels, progress, actionable errors, and reviewer decisions                 | Accessibility and responsive behavior should be verified in the target browsers; production user research remains necessary                                            |
| Poor images                                                     | Browser image decoding, bounded resizing, and automatic OCR rotation                                                     | Glare, perspective distortion, curved bottle text, tiny type, and missing artwork panels can still defeat OCR                                                          |
| Deployable working website                                      | Static Angular output, with model assets served from the same site                                                       | Host must serve WebAssembly and worker files correctly; this prototype does not supply government production authorization                                             |

## Comparison and review assumptions

- Application fields are the reference values. Blank fields never silently pass. Country is checked only when the application is marked imported.
- Ordinary field checks establish text presence, not the semantic meaning or visual prominence of that text. For example, a matching class/type phrase is not proof that the product qualifies for that classification.
- Confidence is Tesseract's aggregate score on a 0–100 scale. Below 80, or an invalid score, otherwise matching text requires review. This score is not a calibrated probability that each field is correct. Clear mismatches remain flagged even when confidence is low and must be checked against the image.
- A flag may be an OCR error rather than a label defect. The agent sees the artwork and extracted text and retains the final decision.
- A country in an explicit `Product of`, `Made in`, `Produced in`, `Distilled in`, `Brewed in`, or `Country of origin` declaration can match. Other valid legal formats are routed to review rather than guessed.
- For safety, additional words attached to the final warning sentence on the same OCR line invalidate its exact-text check. Separate following label lines are allowed. OCR that merges unrelated text onto that line may produce a false flag for the reviewer to resolve.
- The rules are intentionally narrower than a full TTB compliance engine. Beverage-specific exceptions, wine/beer ABV tolerances, appellations, age statements, allergen/sulfite declarations, type size, placement, artwork layout, and other mandatory statements require further work. Missing application ABV currently requires review even when an exception might apply.
- English is the supplied OCR language. Front and back panels must be included in readable artwork; information outside the uploaded image cannot be verified.

## State, privacy, and prototype boundaries

Uploaded images are held in browser memory using object URLs. The review store saves application values, extracted text, notes, decisions, and timestamps to this browser's `localStorage`; uploaded image bytes are not saved there. After a reload, the original uploaded image needs to be selected again for visual inspection. Clearing history removes the application's local review records and releases known image object URLs.

Browser storage is not encrypted application storage or an institutional audit log. Use synthetic or non-sensitive material for this prototype. There is no authentication, shared queue, central retention policy, role-based access control, or COLA integration. These are separate production requirements, not implied by a successful static deployment.

The sample workspace uses synthetic artwork and curated extracted text to demonstrate expected outcomes immediately. Sample confidence values are fixture values. Clicking a sample does not run OCR and must not be reported as an OCR speed or accuracy measurement. Uploaded image files use the real local OCR path.

## Performance target and benchmark methodology

The stakeholder's approximately five-second target applies to the experience from submitting a label to seeing usable comparison results. A fast fixture switch or an isolated rules-engine test is not evidence that this target has been met.

`recognizeLabel` currently reports elapsed time from entering that function through worker acquisition, initialization if needed, image preparation, and recognition. This does not include time an image spends in the application queue before a consumer starts it, subsequent rules evaluation, or the final browser paint. End-to-end UI measurements should include those separately.

For a reproducible evaluation:

1. Build the production application and serve it over HTTP(S), using the intended static host. Record the commit, browser/version, operating system, CPU/RAM, network profile, and whether WebAssembly SIMD is available.
2. Prepare a versioned corpus of actual raster files. Include clear spirits, wine, beer, and import labels; varied resolutions; an angled image; small text; glare; and deliberately missing or altered required fields. Record file dimensions and bytes. Keep a manually verified transcription and expected field results for each image.
3. Measure cold startup in a fresh browser context with an empty HTTP cache. Record time to interactive, time until OCR is ready, bytes downloaded, and the first uploaded label's result latency. Report initialization separately rather than excluding it from the user experience.
4. Measure warm single-label performance after the engine reports ready. Run at least ten trials per clear label, vary the trial order, and record submit-to-results-ready time plus the OCR-reported duration. Report median, p95, maximum, timeouts, and hardware. Evaluate the five-second target against p95 on the agreed clear-label corpus, and report challenging images separately.
5. Run representative 20-, 100-, and 300-image batches on target hardware when feasible. Record first-result latency, total batch wall time, images per minute, queue-to-result p95, peak browser memory, errors, and UI responsiveness. Include queue waiting time. Two workers bound concurrency; they do not guarantee a particular throughput.
6. Score OCR and comparison correctness alongside speed: transcription errors, missed required fields, false matches, false flags, low-confidence reviews, and warning/header error detection. Review every false match; an unreadable label should not be optimized into an unjustified pass.
7. Repeat the deployed-host test with third-party network requests blocked. Confirm that worker, WASM, and trained-data requests remain on the site's origin and that an OCR failure produces an actionable error.

The implementation has a 45-second initialization deadline and a 20-second recognition deadline. These protect the interface from indefinitely waiting; they are not evidence of five-second performance. Illustrative smoke observations are recorded in [performance evidence](performance.md); representative p95 latency and 300-image throughput have not been measured.

## Validation

`npm test` runs the verification and CSV test suites. Verification regressions cover normalization and token boundaries; missing application/label fields; import origin context; numerical ABV/proof consistency; unrelated ingredient percentages; volume conversion and contradictions; exact warning text and header; attached/duplicate warning text; confidence safeguards; and manual typography confirmation. `npm run build` validates Angular compilation and emits the deployable artifact. Browser checks should exercise both curated examples and genuine raster uploads.

## Regulatory references

The warning literal and formatting checks were checked against [TTB's health warning statement guidance](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning), which cites 27 CFR part 16. The guidance requires uppercase, bold `GOVERNMENT WARNING` and regular-weight statement text. The prototype's visual confirmation does not automatically measure those properties.

Origin context and scope were informed by [TTB's imported-wine requirements](https://www.ttb.gov/regulated-commodities/beverage-alcohol/wine/labelreqimportedwine), [imported malt-beverage name/address guidance](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-name-and-address-imports), and [distilled-spirits name/address guidance](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-name-address). These references distinguish product origin from the importer/bottler's address; the prototype does not attempt to encode all regulatory variations.
