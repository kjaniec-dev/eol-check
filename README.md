# eol-check

Paste a `package.json`, `pom.xml`, `go.mod`, `pyproject.toml`, `.python-version` or `Dockerfile` and see which runtimes, frameworks and base images
are past end of support (or will be within 6 months). Data comes from [endoflife.date](https://endoflife.date).

Parsing and matching run in the browser; nothing is uploaded.

## How it works

- `scripts/fetch-eol.ts` snapshots the products listed in `src/lib/mapping.ts` into `src/data/eol.json` at build time
  (no runtime API calls, so no CORS dependency). It fails the build if a mapped slug does not exist upstream.
- `src/lib/parsers/*` turn each file type into components (`product` slug + `version`).
- Python: `pyproject.toml` reads `[project].requires-python` (or legacy `[tool.poetry.dependencies].python`) and checks the minimum declared version; `.python-version` reads pinned Python versions. A constraint is a compatibility declaration, not proof of the interpreter installed in a deployment. Upper bounds alone remain unknown.
- Dockerfile: global `ARG` defaults resolve `$VAR` and `${VAR}` in image references, including chained values and fallback expressions. Stage-local `ARG`/`ENV` values do not apply to `FROM`; arguments supplied only at build time remain unknown.
- `src/lib/match.ts` finds the release cycle and classifies `eol` / `soon` / `ok` / `unknown`.
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

To support more software, add entries to `src/lib/mapping.ts` (and a parser if it needs a new file type).
