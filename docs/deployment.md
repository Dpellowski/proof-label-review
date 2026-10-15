# Deployment and submission

Proof is an Angular 21 static application. It has no backend deployment, API keys, database migrations, or paid OCR service. Build once and serve `dist/` over HTTPS, including the `ocr/` and `samples/` directories.

## Published submission

- **Public application:** https://dpellowski.github.io/proof-label-review/
- **Public source repository:** https://github.com/Dpellowski/proof-label-review
- **Build and deployment workflow:** https://github.com/Dpellowski/proof-label-review/actions/workflows/pages.yml

The GitHub Pages deployment was verified on October 15, 2026. It returned HTTP 200 without authentication and passed all 27 browser workflow checks, including real single/batch OCR, review decisions, image recovery, and mobile navigation. The original workflow run also observed zero failed HTTP responses or external-origin requests; OCR assets came from `/proof-label-review/ocr/`.

## GitHub Pages: free public submission

GitHub Pages supports public repositories on GitHub Free. A public repository can provide both assignment deliverables: source reviewers can inspect and a public working application. See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The ready-to-use workflow is [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). It runs on pushes to `main`, pull requests, and manual workflow dispatch. Pull requests run tests and the Pages build; only `main` can deploy. Deployment uses the standard Pages environment and limited Pages/OIDC permissions, with no personal token stored in this repository.

1. Sign in to GitHub and create a public repository containing the contents of this project at its root. Keep the default branch named `main`, or update the workflow's branch filters.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. Pages must be enabled before the workflow's configuration step can read the site's metadata.
3. Push the source to `main`, or run **Actions → Test and deploy GitHub Pages → Run workflow** after enabling Pages.
4. Wait for the build and deploy jobs to succeed. The deployment's environment URL is the actual published URL, normally `https://OWNER.github.io/REPOSITORY/` for a project site. Use the returned URL rather than assuming publication succeeded.
5. Verify the application, real OCR upload, artwork download, and batch CSV workflow at that public URL before submitting it.

`npm run build:pages` uses `scripts/build-github-pages.mjs` to package OCR assets and build Angular into `dist-pages/`. The workflow reads Pages' `base_path` so project paths, user sites, and configured custom domains work correctly. A local build defaults to `/proof-label-review/`; set `PAGES_BASE_PATH` to test a different prefix. `node scripts/smoke-pages.mjs` starts a temporary server and exercises the actual built app plus real OCR under the configured subpath, including missing-asset checks. The normal `npm run build` still emits `dist/` with a root base path for other hosts.

Publishing updates requires a connected GitHub account or an authenticated GitHub CLI with repository and Pages access. This project's public repository and Pages site are already configured and linked above. The earlier Sites preview is separate and remains private.

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
