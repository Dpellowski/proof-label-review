# Deployment and submission

Proof is an Angular 21 static application. It has no backend deployment, API keys, database migrations, or paid OCR service. Build once and serve `dist/` over HTTPS, including the `ocr/` and `samples/` directories.

## Azure Static Web Apps

The stakeholder's existing Azure environment makes Static Web Apps a practical deployment option. Create a Static Web App linked to the submission repository, and use these project-specific build values:

| Setting                   | Value                                        |
| ------------------------- | -------------------------------------------- |
| Application location      | `/` when this project is the repository root |
| API location              | Leave empty                                  |
| Application build command | `npm run build`                              |
| Output location           | `dist`                                       |
| Node version              | 22.12 or later in the Node 22 line           |

The Angular output path is explicitly configured as `dist/`; it does **not** add a `browser/` directory. If the repository contains this project in a subfolder, set the application location to that subfolder. The included `public/staticwebapp.config.json` is copied to the build output and declares WebAssembly/gzip MIME types plus basic response headers.

Azure's generated workflow stores its deployment credential in GitHub Actions secrets. Keep that credential out of source. Use the portal's generated site URL as the public take-home submission URL. See Microsoft's [deployment guide](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-web-framework) and [build configuration reference](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration).

## Other static hosts

The same artifact works with hosts that support static JavaScript, Web Workers, and WebAssembly. Use `npm ci` as the install command, `npm run build` as the build command, and `dist` as the publish directory. No environment variables are required.

For a subpath deployment, build with `npm run build -- --base-href /your-path/`. Angular's CLI arguments passed after `--` reach `ng build`; OCR paths are resolved relative to `document.baseURI`. The application uses local view state rather than URL routes, so it needs no single-page routing rewrite.

## Check the deployed artifact

1. Open the site in a clean browser. The six clearly identified sample applications should appear immediately.
2. Download the Old Tom PNG using the artwork download button. Upload it through **New verification** with the sample application's values, then inspect the actual extracted text.
3. Confirm that all runtime OCR requests go to the site's own `ocr/` path. Never rewrite missing OCR assets to `index.html`.
4. Upload all six bundled PNGs with `public/samples/batch-template.csv` to exercise batch OCR. Clean samples should await the manual typography check; intentional mismatches should remain visible. Recognition differences such as a missed accent can also require review.
5. Test approval, requests for changes, CSV export, a page refresh, and mobile navigation.

The automatically created Sites preview is private to its owner. Public reviewer access requires deploying to a public host or explicitly changing the preview site's audience. No public audience change is implied by building the prototype.

## Source repository

The source tree includes the lockfile, original SVG artwork, test PNGs, tests, and documentation. Commit these files to the submission repository. Ignore `node_modules`, `dist`, generated `public/ocr` assets, and browser test screenshots; startup/build recreates the OCR assets from the locked npm dependencies.

See [approach and assumptions](approach.md) and [performance evidence](performance.md) for scope, known limits, and measured smoke observations.
