# Parsers: one CLI per language, two native toolchains, shared contract by conformance tests

**Status:** accepted (resolves "Parser architecture and CLI contract", #11). Amended by "C Parser and redis, git" (#46): C search paths come from literal `-I` flags in Makefiles plus `include/` directories; the Kbuild provider waits until Linux is an Example Repo.

## Decision

**Two toolchains, one per ecosystem directory.** Each toolchain is self-contained, with its own pinned runtime and lockfile:

| Directory | Runtime | CLIs | How it resolves imports |
|---|---|---|---|
| `parsers/python/` | Python (pinned minor in `.python-version`, uv + `uv.lock`) | `structra-parse-python`, `structra-parse-rust`, `structra-parse-c` | Python: stdlib `ast`. Rust: tree-sitter-rust plus our resolver, with crate roots from `cargo metadata --no-deps --offline` or `Cargo.toml`. C: tree-sitter-c `#include` scan plus search paths from Makefile `-I` flags and `include/` directories (see `docs/research/import-resolution.md`). Kbuild-aware search paths are deferred until Linux is an Example Repo, since no v1 repo would exercise them. |
| `parsers/typescript/` | Node (pinned in `.nvmrc`, `package-lock.json`) | `structra-parse-typescript` (TS and JS) | dependency-cruiser pinned with `typescript@5.9.x`, plus the workspace-symlink pre-step. |

All three Python-hosted CLIs share one uv project: one Graph File writer, one file-scoping module, one CLI layer. The existing top-level `python/` directory moves into `parsers/python/`. pydeps is dropped. grimp is a test-only oracle.

**Graph Files of Example Repos live at the top level** in `examples/<name>.graph.json`, next to their dendrogram artifacts (ADR 0002). The web app serves them and the Parser e2e tests byte-compare against them. Small conformance fixtures (tiny repos plus expected Graph Files) stay with their toolchain in `parsers/<toolchain>/fixtures/`.

**CLI contract** (same for every Parser, following ordinary CLI conventions):

```
structra-parse-<language> [PATH] [-o FILE] [--exclude GLOB]...
```

- `PATH` is the repository checkout to parse. It defaults to the current directory and must be the root of a git work tree.
- **`meta.commit` and `meta.repo` are always inferred from git.** No flag sets or overrides them:
  - `commit` is the full SHA of `HEAD`.
  - The Parser refuses a dirty tree, where tracked files differ from `HEAD`, because then the output wouldn't match the commit it names.
  - `repo` is `remote.origin.url` normalized to `https://<host>/<owner>/<name>`. The scp-style and `ssh://` forms are rewritten, and a trailing `.git` and any credentials are stripped. The result is byte-identical whichever way the repo was cloned.
  - A checkout without an `origin` remote is a fatal error, because a Graph File must name its repository.
- The Graph File goes to stdout, or to `FILE` with `-o`. Diagnostics go to stderr only: warnings, per-file parse failures, and unresolved internal-looking imports with their counts.
- **Exit codes:**
  - `0`: Graph File written. Files that failed to parse still count: each stays a node without outgoing edges, and the failure is reported on stderr.
  - `1`: fatal. Not a git work tree, dirty tree, no `origin` remote, or a tool or runtime failure.
  - `2`: usage error.
- `--help` and `--version` work as usual. The version never appears in the Graph File.

**Which files are nodes (the in-scope files):**

1. Start from `git ls-files` at `HEAD`, so untracked, ignored and build-output files never appear.
2. Keep files with the language's extensions. Python: `.py`, `.pyi`. TS/JS: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`. Rust: `.rs`. C: `.c`, `.h`.
3. **Tests are included.** Test structure is part of the codebase's structure.
4. Vendored code is excluded by default. A path component is one of `vendor`, `third_party`, `third-party` or `node_modules`, or the path is listed as a git submodule.
5. `--exclude GLOB` (repeatable, git pathspec-style globs) removes more files. Example Repos record their globs in the Example Repo list, so a Graph File can be regenerated from it.

**Polyglot repos:** a Graph File has one language. Each Parser keeps only its own language's files and ignores imports that cross languages. Covering another language of the same repo needs another Graph File.

**How the formats stay identical without a shared writer:**

- The JSON Schema from "Graph file format" validates every Parser output.
- Each toolchain has a conformance suite of fixture repos with committed expected Graph Files, byte-compared in CI.
- The Example Repo Graph Files are byte-compared end to end.

The serialization rules (key order, sorting, LF, trailing newline, one entry per line) are written once in the schema's README and implemented twice: once in Python, once in TypeScript.

**CI:** every toolchain pins itself in-tree: `.python-version` and `uv.lock`, `.nvmrc` and `package-lock.json`, plus tree-sitter grammar versions in the lockfile. CI installs them with the standard setup actions (setup-uv, setup-node), with caching. It only sets up a toolchain when that toolchain's files, its fixtures, or its Example Repos changed.

## Why

- **Native ecosystems over one tool.** The best resolver for each language lives in its own ecosystem: dependency-cruiser and the TS resolver in Node, and stdlib `ast` in Python. Rust and C have no resolver we can reuse without a build. tree-sitter wheels plus a small resolver are enough, so they join the Python toolchain instead of adding Rust and C toolchains to CI.
- **Infer repo and commit rather than pass them.** Passing them invites a mismatch between the stated commit and the parsed files. Refusing dirty trees and normalizing the remote URL keep the inferred values honest and byte-stable.
- **`git ls-files` as the base set.** It is deterministic, needs no per-language ignore logic, and excludes generated files that aren't committed. Generated files that are committed stay in, because they are part of what the repo shows.
- **Partial results exit 0.** One unparseable file, such as a Python 2 script or a macro-heavy Rust file, shouldn't block a whole Example Repo. The stderr counts keep the loss visible, and the e2e byte comparison catches regressions.

## Consequences

- Two writers can drift apart. The conformance fixtures are the guard, so each toolchain needs a fixture that covers the writer's edge cases: an empty graph, a file without edges, non-ASCII paths, and paths that differ only in case.
- The workspace-symlink pre-step of the TS Parser must not modify the checkout so that the next run sees a dirty tree. It writes only to ignored paths (`node_modules/`), or works in a temporary copy.
- `data/*.dot` and `python/scripts/generate_dot.py` were superseded and have been removed.
