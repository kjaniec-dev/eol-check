# eol-check

Paste or drop a dependency manifest, lockfile, runtime version file or container configuration and see which runtimes, frameworks and base images
are past end of support (or will be within 6 months). Data comes from [endoflife.date](https://endoflife.date).

Parsing and matching run in the browser; nothing is uploaded.

Use **Try example** to load a sample manifest. Click a status counter (including **Unknown**) to filter the report; click it again or choose **All results** to reset. Uploaded files can be removed individually. Recognised inputs without checked products show a warning rather than an empty report. **Copy all results as Markdown** exports the complete report, including source filenames, regardless of the active filter.

## How it works

- `scripts/fetch-eol.ts` snapshots the products listed in `src/lib/mapping.ts` into `src/data/eol.json` at build time
  (no runtime API calls, so no CORS dependency). It fails the build if a mapped slug does not exist upstream.
- `src/lib/parsers/*` turn each file type into components (`product` slug + `version`).
- Every result labels its version basis: exact declarations, a minimum computed from a constraint, resolved lockfile entries, unresolved ranges, or an image reference. A lockfile version is not proof of what is installed in a deployment, and container tags may move; the basis and its explanation appear in the report and Markdown export.
- EOL and soon-ending releases show up to three newer supported numeric cycles, preferring LTS releases. Suggestions include the known end-of-support date and remaining days; missing dates are called out rather than estimated. They are based only on product lifecycle data and do not guarantee application compatibility.
- Cross-file comparisons group declarations by product, application and environment. The application defaults to the uploaded file's directory (or `root`), the environment defaults to `default`, and both can be edited for each input, including pasted content. npm ranges are compared using their full semver constraints; numeric versions such as `22` mean the `22.x` family. Computed minimums, Go's `go.mod` minimum and .NET target frameworks are not treated as exact pins; unsupported comparisons are marked unknown. Comparisons do not confirm runtime or deployment versions.
- Python: `pyproject.toml` reads `[project].requires-python` (or legacy `[tool.poetry.dependencies].python`) and checks the minimum declared version; `.python-version` reads pinned Python versions. A constraint is a compatibility declaration, not proof of the interpreter installed in a deployment. Upper bounds alone remain unknown.
- uv: `pyproject.toml` and `.python-version` work as above; `uv.lock` reads the root `requires-python` constraint and checks its minimum declared Python version. This does not identify the installed interpreter; locked Django versions are checked separately.
- Compose: reads `services.*.image`, including YAML aliases and merge keys. Content detection also accepts `compose.yml`, `docker-compose.yaml` and `docker-compose.yml`. Image tags, registry prefixes, digests and codenames use the same rules as Dockerfile images. Build-only services are skipped; environment interpolation (including defaults and `.env` files) is not resolved, so variable-containing tags remain unknown. Pasted results use the canonical source name `compose.yaml`; uploaded files keep their filenames.
- Dockerfile: global `ARG` defaults resolve `$VAR` and `${VAR}` in image references, including chained values and fallback expressions. Stage-local `ARG`/`ENV` values do not apply to `FROM`; arguments supplied only at build time remain unknown.
- Vendor images (Dockerfile and Compose): `gcr.io/distroless/*-debianN` reports the Debian cycle separately from Node.js or Java versions encoded in the image name. `python3` identifies Python but leaves its minor version unknown. Generic Java has no distribution-specific lifecycle data. `cgr.dev/chainguard/` images use supported product names (including `go`) and numeric tags; `latest` and digest-only references do not reveal runtime versions. These are upstream product lifecycle checks, not vendor image support guarantees.
- `src/lib/match.ts` finds the release cycle, classifies `eol` / `soon` / `ok` / `unknown`, and attaches migration suggestions for EOL or soon-ending releases.
- `src/lib/discrepancies.ts` compares declarations for the same product across files in the same application and environment. It reports non-overlapping constraints as conflicts, overlapping but different declarations as compatible, and comparisons without safe semantics as unknown.
- TypeScript and Java without a known JDK distribution are reported as `unknown`: endoflife.date has no generic lifecycle data for them. Temurin and Corretto images use their distribution-specific data.
- TypeScript is displayed by name with an explicit lifecycle-data explanation, including when its version is a range such as `^5`. Its unknown status reflects missing support dates, not a failure to parse the version.
- npm ranges use the npm semver parser (`^`, `~`, `>=`, `>`, `<=`, `<`, wildcards, hyphen ranges and `||`). The reported version is the lowest allowed version, not an installed version. Upper-only, unbounded, invalid or impossible ranges remain unknown.
- `src/components/Checker.tsx` is the UI: a React island built with [`@kjaniec-dev/ui`](https://ui.kjaniec.dev) and `@kjaniec-dev/design` (Tailwind v4 tokens, light/dark by OS setting), mounted from `src/pages/index.astro`. A scheduled workflow rebuilds the site daily to refresh the snapshot.

## Develop

```sh
npm install
npm run dev          # fetches the snapshot first; needs network access to endoflife.date
npm test
```

Run `npm run fetch-data` to refresh the snapshot manually. Both `npm run dev` and `npm run build`
generate it automatically before starting Astro.

### Quality checks

Use Node.js 24.22.1 or newer on the Node.js 24 LTS line and npm 10.9.4 or newer.

```sh
npm ci
npm run quality       # lint, formatting, tests, full build and Astro/TypeScript checks
npm run lint          # ESLint: JavaScript, TypeScript, React Hooks and Astro
npm run format:check  # check formatting without modifying files
npm run format        # apply Prettier formatting (including Astro)
```

The quality workflow runs on every pull request, pushes to `main` and manual dispatch.
It uses read-only repository permissions, no deployment secrets and no deployment steps.
The full build refreshes the EOL snapshot and requires access to endoflife.date.
Snapshot requests have a 15-second timeout, up to four attempts with exponential backoff for
transient network failures, HTTP 429 and server errors, and a concurrency limit of four; persistent
errors fail the build with the affected product and attempt details rather than writing a partial
snapshot.
Generated data, build outputs, dependencies and local tool directories are excluded from formatting.
The existing deployment workflow remains separate.

### Dependency updates

`renovate.json` configures Renovate for npm dependencies and GitHub Actions using the recommended
preset. Non-major npm updates are grouped; major updates remain separate. Automatic merging is
disabled so updates can be reviewed after the quality checks pass.

Direct npm dependencies and the `undici` override use exact versions, without `^` or `~`.
The project `.npmrc` enables `save-exact`, and Renovate preserves pinned versions. Updates target
the npm `latest` tag, except TypeScript, which stays on the latest 6.x release.
`@types/node` follows `latest` (currently 26), while the runtime remains Node.js 24; types alone
do not guarantee that newer Node.js APIs are available at runtime.

Enable the [Renovate GitHub App](https://github.com/apps/renovate) for this repository to activate
updates; committing the configuration alone does not install or authorize the app.

To support more software, add entries to `src/lib/mapping.ts` (and a parser if it needs a new file type).

## Supported inputs

| Ecosystem    | Files                                                                                                      | Checked products                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Runtime pins | `.nvmrc`, `.node-version`, `.python-version`, `.ruby-version`, `.tool-versions`, `mise.toml`, `.mise.toml` | Node.js, Python, Ruby, Go, .NET; Java remains unknown without a JDK distribution                        |
| JavaScript   | `package.json`, `package-lock.json` / `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`                 | Mapped frameworks; Node.js from `package.json` engines                                                  |
| Python       | `pyproject.toml`, `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements*.txt` / `.in`                    | Django; Python runtime from `pyproject.toml`, `uv.lock` or `.python-version`                            |
| .NET         | `global.json`, `*.csproj`, `Directory.Build.props`, `*.runtimeconfig.json`                                 | .NET SDK/runtime release families and target frameworks                                                 |
| Java         | `pom.xml`, `build.gradle`, `build.gradle.kts`                                                              | Java declarations and Spring Boot; Gradle toolchain vendors identify Temurin/Corretto                   |
| Go           | `go.mod`                                                                                                   | Go runtime                                                                                              |
| PHP          | `composer.json`, `composer.lock`                                                                           | PHP, Laravel, Symfony core components                                                                   |
| Ruby         | `Gemfile.lock`, `.ruby-version`                                                                            | Ruby and Rails                                                                                          |
| Containers   | `Dockerfile`, Compose, Kubernetes YAML/JSON                                                                | Mapped image products, including Distroless, Chainguard, Bitnami and selected AWS Public ECR namespaces |

Uploaded filenames disambiguate plain version pins. When pasting a scalar version, use the tool selector; automatic detection retains the existing numeric `.python-version` behavior. Structured manifests are detected by content. Uploaded filenames appear in the Source column.

Lockfiles check resolved versions (including multiple installed versions); manifest constraints check the minimum declared version where it can be determined. This is not a full dependency inventory: only products with lifecycle mappings are emitted. npm v1–v3, pnpm v5/v6/v9 and Yarn classic/Berry are supported. Version aliases, moving tags, local paths and unresolved expressions are not turned into installed versions.

.NET SDK `8.0.404` is checked against the .NET `8.0` lifecycle; legacy .NET Framework and .NET Standard targets remain unknown. SDK versions below 3 and prerelease SDKs stay unknown because their numbering cannot safely identify a stable runtime lifecycle. MSBuild properties, Gradle scripts, dependency markers and tool aliases are not evaluated. Gradle extraction reads literal Java and Spring Boot declarations. Python currently checks Django dependencies, including PEP 735 dependency groups and pip hash-pinned requirements; it does not follow pip include files or resolve an environment.

Kubernetes reads Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, ReplicationController, Job, CronJob and List manifests, including init and ephemeral containers. Multi-document YAML is supported; render Helm templates first. ConfigMap values are not interpreted as images. Container checks describe upstream runtime/OS lifecycle, not a vendor's maintenance contract. Bitnami names are recognised on Docker Hub and Public ECR; ECR supports Docker Official Images, Lambda runtimes and Amazon Corretto references.

Floating numeric major container tags (for example `redis:8` or `redis:8-alpine`) use an exact major lifecycle if one exists; otherwise they select the highest numeric minor cycle known in that major. `redis:8.0` stays on cycle `8.0`. Inferred cycles are identified in the UI and Markdown export; the original version remains visible. This is a snapshot-based assumption about a moving tag, not proof of the deployed image version. Digest-pinned references and non-container version declarations do not use this fallback.

## Hosting: Cloudflare and GitHub Pages

Cloudflare Workers Static Assets serves the pre-rendered `dist/` directory using `wrangler.jsonc`. No SSR adapter, Worker script or server-side parsing is needed. The Worker is named `eol-check`. Its configured custom domain is `eol-check.kjaniec.dev`; the account's `workers.dev` address also stays enabled. An authenticated deployment provisions the custom domain and its DNS record through Cloudflare, provided `kjaniec.dev` is an active zone on that account and the API token has the required zone permissions.

### Cloudflare Git integration (production)

Connect `kjaniec-dev/eol-check` to Cloudflare Workers Builds with:

- Production branch: `main`
- Root directory: the repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config wrangler.jsonc`
- Set the `NODE_VERSION` build variable to `24.22.1` in Workers Builds settings to keep the
  Cloudflare build aligned with the GitHub workflows.

Commit `wrangler.jsonc`, `package.json` and `package-lock.json` before building. With the checked-in static-assets config, Wrangler deploys `dist/` directly. It must not run framework auto-configuration or `astro add cloudflare`; an SSR adapter is unnecessary.

Cloudflare deploys pushes using its Git integration; no Cloudflare API token or account ID is needed in GitHub Actions. The GitHub workflow deploys GitHub Pages separately on pushes to `main`, manual runs and the daily schedule. Select GitHub Actions as the Pages source. Its default path is `/eol-check/`. If Pages serves a custom domain at its root, set repository variable `GITHUB_PAGES_BASE_PATH` to `/`; if the repository is renamed, use its new `/repository-name/` path.

For non-production branches, use `npx wrangler preview` as the preview deploy command. The empty `previews` block in `wrangler.jsonc` enables Worker Previews; static assets and compatibility settings stay at the top level. Keep `npx wrangler deploy --config wrangler.jsonc` as the production deploy command.

### Daily Cloudflare data refresh

Pushes rebuild Cloudflare automatically, but the EOL snapshot also needs rebuilding when code stays unchanged. In the Cloudflare Worker's Builds settings, create a Deploy Hook targeting `main`. Store its complete URL as repository Actions secret `CLOUDFLARE_BUILD_HOOK_URL`. The existing daily/manual GitHub workflow then triggers that Cloudflare build without duplicating deployments on push. Without the optional hook, only GitHub Pages gets scheduled refreshes; Cloudflare still builds on pushes.

### Deploy directly with Wrangler

```sh
npm ci
npx wrangler login                  # or supply CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID securely
npm run deploy:cloudflare          # fetch current data, build and publish
```

To verify the deployment configuration without publishing:

```sh
npm run build
npm run check:cloudflare
```

Cloudflare builds use the default root path. A standalone Pages build can be checked with `ASTRO_BASE_PATH=/eol-check/ npx astro build`. Reset to a root build before deploying to Cloudflare. The configured custom domain is applied during deployment; a dry run does not change DNS. Existing conflicting DNS records can require resolving the conflict in Cloudflare before deployment succeeds.
