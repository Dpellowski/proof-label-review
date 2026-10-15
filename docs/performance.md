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
