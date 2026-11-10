# Contributing to Structra

This is the developer guide. For what Structra is and how to use it, see the [README](README.md). Terms such as Graph File, Parser and Example Repo are defined in [`GLOSSARY.md`](GLOSSARY.md).

## Dev setup

The app and the repo scripts need Node 22.18 or later (the scripts are TypeScript that Node runs directly).

```sh
npm ci
npm run dev          # the app at http://localhost:5173/structra/
npm test             # unit tests: tree core, app logic, scripts
npm run build        # type-check (tsc -b) and build
npm run test:e2e     # Playwright on the built app (Chromium: npx playwright install chromium)
npm run lint
```

The Parsers live in two self-contained toolchains, each with its own README:

- [`parsers/python/`](parsers/python/README.md): uv with a pinned Python. It hosts `structra-parse-python`, `structra-parse-rust` and `structra-parse-c`. `uv sync`, then `uv run pytest`.
- [`parsers/typescript/`](parsers/typescript/README.md): Node pinned in `.nvmrc`. It hosts `structra-parse-typescript`. `npm ci`, then `npm test`.

## Repo layout

- `src/`: the app (React + Vite, deployed to GitHub Pages).
  - `src/core/`: the tree core, which runs in Node and in the browser: Graph File validation, `scoreTree`, `buildDendrogram`, the sweep, `treeAt` and per-group stats.
  - `src/app/`: the view model and components: icicle layout, Folder Blocks, import lines, the details card, uploads and the URL.
- `parsers/`: the Parsers, one CLI per language ([ADR 0003](docs/adr/0003-parser-architecture.md)).
- `schema/`: the Graph File JSON Schema, and in its [README](schema/README.md) the one written-down copy of the serialization rules.
- `examples/`: the Example Repo List ([`repos.toml`](examples/repos.toml)) and, per Example Repo, its Graph File, dendrogram artifact and 101-step snapshot. `toy.graph.json` is the hand-written toy used by the README diagram and the unit tests.
- `scripts/`: the offline pipeline and CI tooling (regeneration, the clone script, the CI matrix, the README diagram).
- `e2e/`: Playwright tests on the built app, and the README stills script.
- `docs/adr/`: the decisions (cost function, optimizer, Parsers). `docs/research/`: the research behind them. `docs/images/`: the README images.

## Regenerating examples

```sh
npm run examples:regen -- flask django     # no names: every Example Repo
```

For each repo, this clones it at its pin with `scripts/clone-at-pin.sh` (the same script CI uses), runs its Parser with the excludes from `repos.toml`, and rewrites `examples/<name>.graph.json`, `.dendrogram.json` and `.snapshot.json`. It needs the Parser toolchain for each repo's language.

Run it when you change a Parser or the tree core on purpose, and commit the artifacts in the same PR, so the review shows what changed. If you only changed the tree core, you don't need to clone anything:

```sh
node scripts/structra-dendrogram.ts examples/*.graph.json
```

**The pin rule:** a repo's `commit` in `repos.toml` changes only on purpose, in a PR that also regenerates that repo's artifacts. To add an Example Repo, add its entry to `repos.toml` (with its SPDX `license`), record its license in [`examples/NOTICE.md`](examples/NOTICE.md), and regenerate it.

## e2e checks

CI ([`.github/workflows/e2e.yml`](.github/workflows/e2e.yml)) runs only the jobs a change needs; `scripts/ci-matrix.ts` decides which. A manual run (`workflow_dispatch`) runs all of them.

- **Graph Files, byte-identical.** One job per Example Repo clones it at its pin, runs its Parser and compares the output with the committed Graph File byte for byte. A mismatch uploads the actual Graph File and writes a node/edge diff to the job summary.
- **Conformance fixtures.** Each Parser toolchain's fixtures (tiny repos with expected Graph Files and the CLI contract) and, for Python, the grimp oracle.
- **Dendrograms and snapshots, byte-identical.** A clone-free Node job rebuilds every dendrogram artifact and 101-step λ snapshot (group count, Total Cost and tree hash per step) from the committed Graph Files and compares them byte for byte, then runs the unit tests. The unit tests also check that `docs/images/toy-diagram.svg` is what `npm run readme:diagram` writes.
- **Chromium vs Node.** The Playwright job checks that the trees the browser reads off flask's artifact, and the artifact it computes from flask's Graph File, both match Node's 101-step snapshot ([`e2e/cross-engine.spec.ts`](e2e/cross-engine.spec.ts)). It also runs the app's behaviour tests.
- **`e2e-ok`** always runs and fails if any selected job failed. It is the required check on `main` and gates the GitHub Pages deploy.

## Docs and planning

- [`GLOSSARY.md`](GLOSSARY.md): the domain terms. Use them in code, docs and issues.
- [`docs/adr/`](docs/adr/): the architecture decisions. A change that contradicts one amends it.
- [`docs/research/`](docs/research/): research findings that the decisions build on.
- Planning lives on GitHub Issues as a wayfinder map: the issue labelled [`wayfinder:map`](https://github.com/realJohnDoe/structra/issues?q=label%3Awayfinder%3Amap) and its sub-issues.

## Regenerating the README images

The toy diagram comes from the toy Graph File, through the real optimizer:

```sh
npm run readme:diagram        # writes docs/images/toy-diagram.svg
```

The stills are phone-width screenshots of the built app (a Pixel 7 viewport), showing flask at λ 0.20, 0.45 and 0.80:

```sh
npm run readme:stills         # builds the app, writes docs/images/flask-<λ>.png
```

They use the same Playwright harness as the e2e tests ([`e2e/readme.stills.ts`](e2e/readme.stills.ts), with `playwright.stills.config.ts`), but CI never runs them, so they don't gate `e2e-ok`. Regenerate them by hand when the app's look or flask's trees change, and check that the README captions still match.
