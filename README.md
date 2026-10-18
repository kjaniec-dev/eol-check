# eol-check

Paste a `package.json`, `pom.xml`, `go.mod` or `Dockerfile` and see which runtimes, frameworks and base images
are past end of support (or will be within 6 months). Data comes from [endoflife.date](https://endoflife.date).

Parsing and matching run in the browser; nothing is uploaded.

## How it works

- `scripts/fetch-eol.ts` snapshots the products listed in `src/lib/mapping.ts` into `src/data/eol.json` at build time
  (no runtime API calls, so no CORS dependency). It fails the build if a mapped slug does not exist upstream.
- `src/lib/parsers/*` turn each file type into components (`product` slug + `version`).
- `src/lib/match.ts` finds the release cycle and classifies `eol` / `soon` / `ok` / `unknown`.
- `src/pages/index.astro` is the UI. A scheduled workflow rebuilds it daily to refresh the snapshot.

## Develop

```sh
npm install
npm run fetch-data   # needs network access to endoflife.date
npm run dev
npm test
```

To support more software, add entries to `src/lib/mapping.ts` (and a parser if it needs a new file type).
