# OCR performance evidence

The browser smoke check exercises real Tesseract.js OCR against synthetic, clean artwork. These observations establish that the OCR pipeline works and can finish within the assignment's five-second target on this machine. They are not a general accuracy or latency benchmark for photographed bottles, real label artwork, slow connections, or mobile hardware.

## Reproduce

After installing dependencies:

```sh
node scripts/copy-ocr-assets.mjs
node scripts/smoke-ocr.mjs
```

The script uses the installed Google Chrome by default. Set `OCR_BROWSER_CHANNEL` to a Playwright browser channel available on your machine if necessary. It bundles the OCR module, starts a temporary local HTTP server on a free port, generates its test images in a browser canvas, and shuts down the browser and server when finished. The test serves everything beneath `/review/` to exercise deployment with a base path. It asserts that the OCR engine requests no external service or CDN.

## Environment and observed results

Recorded October 15, 2026:

| Item          | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| OS            | Windows, 64 bit                                                    |
| CPU           | Intel Core i9-13900K, 24 physical cores / 32 logical processors    |
| Browser       | Headless Google Chrome 155.0.0.0, installed Chrome channel         |
| Node          | 22.14.0                                                            |
| OCR           | Tesseract.js 6.0.1, English quantized LSTM data (`4.0.0_best_int`) |
| Core selected | `tesseract-core-simd-lstm.wasm.js`                                 |
| Network       | Local loopback HTTP; no simulated latency or bandwidth restriction |

| Operation                                                    | Observed duration | OCR confidence |
| ------------------------------------------------------------ | ----------------- | -------------- |
| Load first worker before recognizing an image                | 316 ms            | —              |
| Three concurrently submitted clean labels, first result      | 490 ms            | 95 / 100       |
| Three concurrently submitted clean labels, second result     | 575 ms            | 95 / 100       |
| Three concurrently submitted clean labels, third result      | 910 ms            | 95 / 100       |
| Clean label after shutting down and recreating the engine    | 599 ms            | 95 / 100       |
| Dense synthetic page after cancellation and an invalid image | 2,581 ms          | 94 / 100       |

These are individual observations from one run, without repeated sampling, percentiles, or a representative dataset. OCR confidence is the engine's own score, not a measured field-accuracy percentage.

`warmMs` starts immediately before `warmOcr()` and ends when one worker is initialized. In this fresh browser context it includes fetching the worker, selected core, and English data over loopback, plus WASM and language initialization. It excludes page load and image recognition. This is not a cold network or cold operating-system-cache measurement.

Each returned `durationMs` starts at the `recognizeLabel()` call. It includes waiting for a free worker, initializing a worker if necessary, image preparation, and OCR. The first worker is warm before the concurrent calls; the second is created lazily. The third label waits for an available worker, so its time includes queue delay. After shutdown, the restart measurement includes a new worker and can benefit from the browser's trained-data cache.

## Synthetic artifacts

The clean PNG is generated at 1,200 × 800 pixels, with a white background and dark Arial text. It has a 60 px bold brand, 34 px bold class/ABV lines, and 24 px remaining lines. Text starts at x = 45, y = 90, with a 62 px line spacing:

```text
STILL RIVER
KENTUCKY STRAIGHT BOURBON WHISKEY
45% ALC/VOL  750 mL
DISTILLED AND BOTTLED BY STILL RIVER DISTILLING CO.
FRANKFORT, KENTUCKY
GOVERNMENT WARNING:
(1) According to the Surgeon General, women should not drink
alcoholic beverages during pregnancy because of the risk of birth defects.
(2) Consumption of alcoholic beverages impairs your ability to drive
a car or operate machinery, and may cause health problems.
```

The denser PNG is 1,800 × 2,400 pixels, white with black 40 px Arial. It repeats `LABEL VERIFICATION GOVERNMENT WARNING 45% ALC/VOL` 35 times, starting at x = 30, y = 60, with 60 px line spacing. Both artifacts are generated inside the reusable script; no text is substituted for OCR output.

The smoke check also cancels two active jobs plus one queued job, checks that all three promises reject, feeds a corrupt PNG, and verifies that the next valid image succeeds. The recorded run had zero unhandled browser errors. Timeout handling is implemented but this script does not deliberately wait for the 20-second recognition deadline.

## Runtime bounds and remaining evaluation

The pool permits two reusable OCR workers. Recognition and image preparation have a 20-second timeout after initialization; cold initialization has a separate 45-second timeout. Queue wait is included in the displayed elapsed duration but does not consume the recognition deadline. Oversized images are resized to a maximum side of 2,400 pixels; small images may be enlarged at most 2×, and Tesseract's automatic deskew is enabled. Blurry, curved, glared, very small, decorative, and unsupported-language text can still fail and require human review.

The build copies 10 self-hosted OCR assets totaling 31.6 MiB. The largest single file is 4,751,193 bytes (4.53 MiB). This Chrome run fetched only the worker, selected SIMD/LSTM loader, and English data: approximately 6.7 MiB before host-level HTTP compression. Other core variants are packaged so the library can select a compatible browser implementation.

A production evaluation should use a representative, permission-cleared collection of actual label photos, measure cold and warm behavior on target devices and network speeds, and record per-field accuracy and latency percentiles. No such dataset or production benchmark is claimed by this submission.

## Real application batch and repeated latency audit

On October 15, 2026, a separate audit exercised the built Angular application through its actual upload dialogs, file inputs, application forms, local OCR workers, local review persistence, and CSV download. It did not replace OCR with fixture text, mock a worker, or call the verifier directly. The sample artwork itself is fictional, clean, flat artwork, not a photographed bottle.

The audit used the same Windows desktop, Intel Core i9-13900K (24 cores / 32 logical processors), and Node 22.14.0 described above, with installed headless Microsoft Edge 155.0.0.0. The browser reported 32 GiB of device memory. The preview ran at `http://127.0.0.1:4173`; no network throttling or CPU throttling was applied. These measurements preceded the final verifier and review-control correctness edits, which retain the same OCR pipeline and two-worker queue. The numbers below are observations from that audited build, not a claimed rerun of the final revision.

### 300 real image uploads

The input was 300 distinct filenames and a matching 300-row CSV: 50 copies each of the six PNG files in `public/samples/`. Total image bytes were 55,803,300 (about 53.2 MiB). Every image went through real OCR. Repeating six designs tests queue capacity, metadata mapping, export completeness, and throughput; it does not establish accuracy over 300 different products.

| Measurement                                             | Observed result                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Uploaded images completed                               | 300 / 300; zero errors                                                       |
| First completed result observed                         | 1.709 s after clicking `Verify 300 labels`                                   |
| 200 completed results observed within the 300-image run | 56.065 s                                                                     |
| Full 300-image queue completed                          | **85.293 s**                                                                 |
| Per-record OCR call duration, p50 / p95 / max           | 596 / 626 / 961 ms                                                           |
| Real OCR workers / maximum active reading records       | 2 / 2                                                                        |
| Application metadata                                    | All fields in all 300 records matched their CSV rows                         |
| Downloaded report                                       | 2,550 field rows; all 300 uploads plus six demo records; no CSV parse errors |
| Search-and-clear interactions while OCR was active      | 23; p50 69 ms, p95 79 ms, max 119 ms                                         |
| Longest observed main-thread task                       | 67 ms                                                                        |
| Largest interval from a nominal 100 ms heartbeat        | 138.4 ms                                                                     |
| Unhandled browser errors / external HTTP requests       | 0 / 0                                                                        |

The first-result and 200-result times are observational upper bounds from approximately 750 ms polling, with brief UI probes during the run. The displayed per-record `durationMs` starts when that record enters its OCR call, not when all 300 files were submitted, so it excludes the record's wait in the application queue. Queue completion and per-record latency measure different things. The five-second target applies to a label result, not the entire 300-image queue; this run took about 85 seconds to finish the batch.

### Ten fresh-context and twenty warm-worker trials

Each trial uploaded the actual `old-tom-bourbon.png` fixture through `New verification`, filled the application form, clicked `Verify label`, and waited for a saved completed record containing real OCR text. Ten trials used separate fresh browser contexts with no local storage, IndexedDB language cache, or preexisting OCR worker. Twenty trials reused one page and worker after an additional warm-up upload. The warm-up is excluded from the reported twenty trials.

| Measurement                                             | Trials | p50     | p95     | Max     |
| ------------------------------------------------------- | ------ | ------- | ------- | ------- |
| Fresh context: first upload button through ready result | 10     | 1.181 s | 1.299 s | 1.299 s |
| Fresh context: `Verify label` through ready result      | 10     | 1.070 s | 1.169 s | 1.169 s |
| Fresh context: recorded OCR-call duration               | 10     | 1.015 s | 1.108 s | 1.108 s |
| Warm worker: first upload button through ready result   | 20     | 0.779 s | 0.787 s | 0.804 s |
| Warm worker: `Verify label` through ready result        | 20     | 0.693 s | 0.698 s | 0.708 s |
| Warm worker: recorded OCR-call duration                 | 20     | 0.628 s | 0.653 s | 0.654 s |

Percentiles use the nearest-rank method. The first-button measurement starts immediately before opening the upload dialog and includes automated file selection and form filling. The page has already loaded. Opening the upload dialog begins worker preparation, so some initialization overlaps form entry; the submit-only measurement does not include that earlier work. The saved-record observation uses 50 ms polling and includes browser/protocol overhead. Fresh contexts reset browser storage and workers, but do not reset the operating system's filesystem cache or simulate a cold remote network.

All 30 measured trials, plus the warm-up upload, completed without unhandled browser errors or external HTTP requests. This is evidence that the app reaches the roughly five-second goal for this clear fixture on this desktop over loopback. It is not a guarantee for real photographs, perspective, glare, mobile hardware, or slow first-load network conditions. OCR confidence remains an engine score, not a measured accuracy percentage.

### Reproduce the application benchmarks

After dependency installation, build the application and keep the preview running in one terminal:

```sh
npm run build
npm run preview
```

Run the benchmarks sequentially in another terminal, so they do not contend for CPU:

```sh
node scripts/benchmark-batch.mjs
node scripts/benchmark-latency.mjs
```

Windows defaults to installed Microsoft Edge. Other platforms default to Playwright Chromium, which must be installed for Playwright. Set `PROOF_QA_BROWSER` to an available channel such as `chrome`, and `PROOF_QA_URL` to change the preview URL. Both scripts locate project files relative to their own script location. Generated batch PNGs/CSV use a temporary directory under the operating system's temp root and are removed afterward; reports and download/screenshot evidence are written to `.openai/benchmarks/`. These generated artifacts are not application source.
