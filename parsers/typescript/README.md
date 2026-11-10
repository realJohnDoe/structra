# TypeScript-hosted Parser

The Node project behind `structra-parse-typescript`, the Parser for TypeScript and JavaScript. The CLI contract, the in-scope rules and the exit codes are in `docs/adr/0003-parser-architecture.md`. The Graph File rules are in `schema/README.md`.

```sh
npm ci                                         # pinned Node (.nvmrc): dependency-cruiser and typescript 5.9
node src/cli.ts PATH -o out.graph.json [--exclude GLOB]...
npm test                                       # conformance fixtures, CLI contract, writer
npm run typecheck
```

The sources are TypeScript that Node runs directly (type stripping, Node 22.18 or later), so there is no build step.

## Layout

- `src/cli.ts`: arguments, git checks (`HEAD`, clean tree, normalized `origin`), stderr diagnostics and exit codes, as in the Python toolchain's `cli.py`.
- `src/scope.ts`: which tracked files are In-scope Files (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`).
- `src/graphFile.ts`: the TypeScript Parser's Graph File writer.
- `src/resolve.ts`: import resolution with dependency-cruiser. Its docstring states the resolution rules.
- `src/workspaces.ts`: the workspace-symlink pre-step. Workspace packages (root `package.json` `workspaces`, `pnpm-workspace.yaml`) are linked by name into a temporary `node_modules` outside the checkout, so the checkout is never written to.
- `src/buildOutput.ts`: maps workspace package entries that point at build output (`dist/…`) back to their sources.

dependency-cruiser is pinned together with `typescript@5.9.x`: with TypeScript 7 it silently skips TypeScript files (see `docs/research/import-resolution.md`).

## Conformance fixtures

Each `fixtures/<name>/fixture.toml` describes a tiny repository with its files inline, in the same format as the Python toolchain's fixtures (plus `[symlinks]` and `[untracked]`). `test/fixtures.test.ts` builds it as a git checkout, runs the Parser as a process, and checks the exit code, stderr fragments and the Graph File bytes against `expected.graph.json`. The keys are listed in that test's docstring.

Fixture commits use a fixed author and date, so `meta.commit` is stable. `STRUCTRA_UPDATE_FIXTURES=1 npm test` rewrites the expected files; review the diff before you commit it.

`test/graphFile.test.ts` feeds every Python fixture's expected Graph File, shuffled, to this writer and checks it writes the same bytes as the Python writer.

Resolution doesn't see computed specifiers (`require(name)`) or bundler-only aliases (webpack, Vite or jest config). Imports of build output that isn't committed stay unresolved and are counted on stderr.
