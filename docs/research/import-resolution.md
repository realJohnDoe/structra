# Per-language import resolution (Python, TS/JS, Rust, C)

Research for [realJohnDoe/structra#8](https://github.com/realJohnDoe/structra/issues/8).

**Question.** For each language, which approach or tool should a Structra **Parser** use to turn a repo checkout at a pinned commit into a file → file **Dependency Graph** (repo-internal edges only)? For each option: how it fails, whether its output is deterministic (the **Example Repos** are byte-compared in CI), and what runtime CI needs. The repo must be parsed without building it or installing its dependencies.

**Date / versions.** Researched 2026-11-07. Tool sources were read at the commits listed in [Sources](#sources). Experiments used Python 3.13.18, Node 22.23.4, cargo 1.97.0, clang 18.1.3 and gcc 13.3.0. Some documentation hosts were blocked from this session (`grimp.readthedocs.io`, `www.typescriptlang.org`, `gcc.gnu.org`). For those, the same docs were read from the projects' own GitHub repositories, or the behaviour was checked locally (noted where it applies).

---

## TL;DR: recommendation per language

| Language | Recommendation | Why | CI runtime |
|---|---|---|---|
| **Python** | Keep a **custom stdlib-`ast` scanner** (evolve `generate_dot.py`) with the five fixes below. Use **grimp** as a test oracle, not as the producer. | `ast` needs nothing installed and sees every file. grimp/pydeps skip directories without `__init__.py` (121 of 428 numpy files). grimp's resolution rule is the right one to copy. | Python (pinned minor version, e.g. 3.13 via `uv`) |
| **TS/JS** | **dependency-cruiser** (pinned) + **typescript 5.9.x** (pinned, *not* 7.x), with an explicit config, plus a pre-step that **symlinks workspace packages into `node_modules`** instead of running `npm install`. Fallback/long-term: own driver on the **TS compiler API** (`preProcessFile` + `resolveModuleName`). | It handles ESM, CJS, dynamic `import()`, tsconfig `paths`, index files and `exports`. Its JSON output was byte-identical across runs. Without the symlink pre-step, cross-package imports in a monorepo do not resolve. | Node 22/24, `npm ci` of the tool only |
| **Rust** | **Custom resolver on tree-sitter-rust**: crate roots from `cargo metadata --no-deps --offline`, module tree from `mod` items (+ `#[path]`), edges from `use`/qualified paths (`crate::`, `self::`, `super::`, workspace crate names). Use cargo-modules / rust-analyzer only as an offline accuracy check. | cargo-modules and rust-analyzer need *full* `cargo metadata` (network/dep download), run build scripts and proc-macro servers, and output module/item graphs rather than file graphs. | Python + tree-sitter wheels; `cargo` binary only for `metadata --no-deps` (or parse `Cargo.toml` directly) |
| **C** | **Pure `#include` scan with per-project search-path heuristics** (Kbuild-aware for Linux). Don't use `clang -MM` or `compile_commands.json` as the primary path. | A ~70-line Kbuild-aware heuristic resolved **98.7 %** of 27,030 includes in a 10.5k-file kernel subset, and the remainder is mostly legitimately external/generated. `clang -MM` fails on an unconfigured tree and collapses `#ifdef`s to one config. `compile_commands.json` needs a build. | Python (+ tree-sitter-c optional) |
| **Cross-language** | **Hybrid.** Use tree-sitter as the *parse layer* for Rust and C (optionally Python). Keep the *resolver* per language, and reuse native resolvers where resolution is configuration-heavy (TS). Do not build on stack-graphs (archived). | Parsing is the easy, uniform part. Resolution is per-language whatever the base, and TS resolution is too config-driven to reimplement. | — |

**Cross-cutting rule for byte-identical output (all languages).** Normalize every path to repo-relative POSIX. Drop self-edges and duplicates. **Sort nodes and edges** before writing. Emit LF, no timestamps, no absolute paths, no tool versions in the **Graph File**. Pin every tool version (lockfile). The current `generate_dot.py` breaks this rule: see below.

---

## 1. Python

### 1.1 The existing `python/scripts/generate_dot.py`

What it does: `ROOT.rglob("*.py")` → `ast.walk` over every `Import`/`ImportFrom` → resolve against `ROOT` (absolute) or the file's directory (relative), trying `x.py` then `x/__init__.py`. Because `ast.walk` visits all nodes, it already catches **conditional imports** (`try/except ImportError`, `if TYPE_CHECKING:`, function-local imports). That is the right default for a structural graph.

It was run against numpy (`80049a0ec1`, 496 `.py` files) in a scratch copy with `ROOT`/`OUTPUT` made into CLI args. Defects found:

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | **Not deterministic.** `edges` is a `dict[str, set[str]]`. Set iteration order depends on `PYTHONHASHSEED`, and the dict order depends on `rglob` (filesystem) order. | `PYTHONHASHSEED=1` vs `=2`: outputs differ at byte 68; `sort`ed they are identical. | Sort sources and targets on write. |
| 2 | **Absolute imports resolved against a single `ROOT`.** With `ROOT = …/numpy/numpy` (as committed), every `import numpy.x` / `from numpy.x import` is looked up as `ROOT/numpy/x` and dropped. Only relative imports survive. | 1,052 absolute `numpy` import lines in the package. 317 edges with `ROOT=numpy/numpy` vs 1,223 with `ROOT=<repo root>`. `data/numpy2.dot` (307 edges) is consistent with the broken mode. | Detect **source roots** (repo root, `src/`, `[tool.setuptools.packages.find].where` / `[tool.hatch…]` etc. in `pyproject.toml`). Try each root in a fixed order. |
| 3 | **`from pkg import sub` only links to `pkg/__init__.py`**, never to `pkg/sub.py` when `sub` is a submodule. | Adding "try `module.name` first" raised edges 1,223 → 1,295. Against grimp on the shared module set, edges only in grimp dropped from 69 to 10. | Copy grimp's rule: if `a.b.c` is a module, link to it, else link to its parent `a.b` (`_get_internal_module` in grimp's `rust/src/import_scanning.rs`). Decide on purpose whether `from pkg import sub` *also* links `pkg/__init__.py`. At runtime it executes `__init__`. grimp does not add that edge. The script currently does. |
| 4 | **Silent drops.** `except Exception: return []` hides `SyntaxError` (code newer than the host Python's grammar, Python 2 files) and decoding errors (hard-coded UTF-8, ignores PEP 263 coding cookies). | — | Parse bytes (`ast.parse(file.read_bytes())` honours coding cookies). Log and count failures. Pin the Python minor version in CI so the grammar is fixed. |
| 5 | Hard-coded Windows path, `.py` only (no `.pyi`, Cython `.pyx`/`.pxd`; numpy has 291 `.pyi`/`.pyx`). | — | Make root a CLI arg. Decide policy for stubs/Cython (probably: include `.pyi` as nodes and resolve `.py` before `.pyi`; leave Cython for later). |

Not a defect but a design choice: it walks *every* `.py` file, including test dirs **without** `__init__.py` (PEP 420 namespace portions such as `numpy/_core/tests`). That is desirable for Structra, whose Leaves are *all* files. Both library tools below lose these files.

Dynamic imports (`importlib.import_module("x." + name)`, `__import__`) are invisible to every static tool listed here. Accept that limitation and document it.

### 1.2 pydeps (3.0.9)

- **How it works:** "finds imports by looking for import-opcodes in python bytecodes" ([README][pydeps-readme]). It subclasses stdlib `modulefinder.ModuleFinder` (`pydeps/mf27.py`), which compiles the files but does not execute them.
- **Fit:** module-level graph keyed by dotted names, with absolute `path`s (they need relativizing). `--max-bacon` **defaults to 2** (`0` = unlimited) ([README][pydeps-readme]), so the default graph is truncated by distance. Builtin and C-extension modules can't be analysed. Needs graphviz for rendering, but not for `--show-deps --nodot --no-output` JSON.
- **Experiment (numpy):** 319 modules / 1,242 internal edges with `--max-bacon 0`. Two runs were **byte-identical**. Same `__init__`-less-directory blind spot as grimp (7 path-less entries such as `numpy._core.tests`).
- **Failure modes:** bytecode compilation uses the *host* interpreter's grammar. Truncation by bacon. Resolution follows `sys.path`, so a module name must be importable (a directory path also works).
- **Verdict:** no advantage over `ast` for Structra. It is coarser (modules not files) and has more knobs to get wrong. The existing `data/numpy.dot` is pydeps output: UTF-16, module-named nodes, 787 edges.

### 1.3 grimp (3.19) / import-linter

- **How it works:** `build_graph(package, …, include_external_packages=False, exclude_type_checking_imports=False, cache_dir=…)` (`grimp/application/usecases.py`). Packages are located with `importlib.util.find_spec` (`adaptors/packagefinder.py`). Parsing is done in Rust with **ruff's parser** (`ruff_python_parser` 0.15.20 in `rust/Cargo.toml`), so it does not depend on the host Python's grammar. The visitor walks all statements and tracks `TYPE_CHECKING` guards (`rust/src/import_parsing.rs`). import-linter is a contract checker built on grimp, and adds nothing for graph extraction.
- **Experiment (numpy, `PYTHONPATH=<checkout>`, `cache_dir=None`):** 307 modules, 896 edges, 0.06 s. The graph is a set API; it was deterministic once sorted.
- **Failure modes:** the module finder **stops descending into directories without `__init__.py`** once inside a regular package ("we won't include 'orphans'", `adaptors/modulefinder.py`). On numpy that drops **121 of 428** in-package files (all of `numpy/_core/tests`, `numpy/typing/tests`, …). Directories whose names aren't identifiers are skipped. The package must be findable via `find_spec` (on `sys.path`). Output is module names, so files need mapping back (`__init__.py` ↔ package).
- **Verdict:** excellent **oracle** for resolution semantics and a good regression check on the packages it covers. Not the producer, because it drops files Structra needs.

### 1.4 Python recommendation

Use a stdlib-`ast` scanner (no dependencies, sees every file) with: sorted output, source-root detection, grimp's submodule-then-parent rule, logged parse failures, and a pinned Python minor version. Add a CI test that compares its edge set with grimp's on the files grimp covers. (On numpy after fix #3, only 10 grimp-only edges and 41 script-only edges remain. The latter are almost all the deliberate `from pkg import sub → pkg/__init__.py` edges.) tree-sitter-python is a viable alternative parse layer if version independence matters more than zero dependencies.

---

## 2. TypeScript / JavaScript

### 2.1 What resolution has to model

From the TypeScript module reference ([Reference.md][ts-ref], §"The `moduleResolution` compiler option"):

- **Extension substitution:** an import of `./mod.js` is looked up as `mod.ts`, `mod.tsx`, `mod.d.ts`, `mod.js`, `mod.jsx` (and `.mjs`→`.mts`/`.d.mts`, `.cjs`→`.cts`/`.d.cts`).
- **Extensionless paths and directory `index` files:** supported in `bundler`/`node10` and in `require` under `node16/nodenext`. **Not** supported for `import` under `node16/nodenext`.
- **`paths`:** resolved relative to `baseUrl` if set, else relative to the tsconfig that defines them. They do **not** affect emit. `baseUrl` "was designed for use with AMD module loaders", and since TS 4.1 it is not needed for `paths`.
- **package.json `exports`/`imports`:** honoured under `node16`, `nodenext` and `bundler`, with conditions (`types`, `import`/`require`, `node`). They only apply on a **`node_modules` package lookup**, so in a monorepo, cross-package imports (`@scope/pkg`) resolve **only if workspaces are symlinked into `node_modules`**. The handbook explicitly recommends workspaces over `paths` for this.
- **ESM vs CJS:** the importing file's format decides whether the `import` or `require` algorithm and conditions are used. Dynamic `import()` always uses the `import` algorithm.

These rules depend on the tsconfig (`module`, `moduleResolution`, `paths`, `baseUrl`, `rootDirs`, `customConditions`) and on each package.json. A from-scratch resolver would have to replicate all of them, so reusing an existing resolver is strongly preferred.

### 2.2 dependency-cruiser (18.7.2)

- **How it works:** it parses with acorn (JS), `tsc` or swc (`parser` option; swc is deprecated). It resolves with webpack's **enhanced-resolve** plus `tsconfig-paths-webpack-plugin` (`package.json`, [options-reference][dc-opts] §`enhancedResolveOptions`). It understands `extends` in tsconfig but reads only `compilerOptions` ([dc-opts] §`tsConfig`). It extracts ES `import`, `require`, AMD, `import x = require()`, dynamic `import()` (`src/extract/swc/dependency-visitor.mjs`), and optionally JSDoc imports, ambient modules and `exoticRequireStrings`. Each edge carries `resolved`, `couldNotResolve` and `dependencyTypes` ([output-format][dc-out]).
- **Type-only imports:** dropped by default (they do not exist after compilation). **Set `tsPreCompilationDeps: true`** to keep them ([dc-opts] §`tsPreCompilationDeps`). For a structural graph they should be kept.
- **Experiment** (synthetic npm-workspace monorepo: `packages/a` with `exports`, `packages/b` with tsconfig `paths`, `bundler` resolution):
  - Relative, `.js`→`.ts`, index, `require`, dynamic `import()` and `~/*` paths-alias edges all resolved correctly.
  - **`@x/a` and `@x/a/feature` were `couldNotResolve: true`** without `node_modules`. They stayed unresolved after symlinking `node_modules/@x/a → packages/a` alone. They resolved to `packages/a/src/index.ts` / `feature.ts` only after **also** setting `enhancedResolveOptions.exportsFields: ["exports"]` and `conditionNames`.
  - Two runs gave **byte-identical JSON**. Modules are sorted (`src/main/report-wrap.mjs`). Note that `summary.optionsUsed.baseDir` contains an **absolute path**, so post-process rather than committing raw JSON.
  - **Compatibility trap:** with `npm i typescript` (which installed **7.0.2**), dependency-cruiser reported `typescript … available: false` against its supported range `>=2.0.0 <7.0.0` and **silently cruised only the `.js` file**. Pinning `typescript@5.9.3` fixed it.
- **Failure modes:** one `tsConfig` per cruise (monorepos with per-package `paths` need one run per tsconfig, then a union). `exports` that point at **build output** (`./dist/index.js`) won't exist in an unbuilt checkout, so map them back to source via a `source`/`development` condition when the repo defines one, or via an `outDir`→`rootDir` heuristic. Vue/Svelte SFCs need their compilers installed next to the tool ([faq][dc-faq]). Computed `require(variable)` is unresolvable.
- **CI runtime:** Node `^22||^24||>=26` (as reported by the tool). `npm ci` of a pinned `dependency-cruiser` + `typescript@5.9.x` in Structra's own tooling, **not** in the target repo.

### 2.3 madge (8.0.0)

A thin wrapper over `dependency-tree` → `precinct`/`filing-cabinet` ([README][madge-readme]). It needs both `tsConfig` and `webpackConfig` passed explicitly. Unresolvable or erroring files are skipped and visible only via `--warning`. There are fewer controls than in dependency-cruiser (`skipTypeImports` via `detectiveOptions`, no per-edge resolution metadata). **Not recommended** over dependency-cruiser.

### 2.4 TypeScript compiler API

`ts.preProcessFile(sourceText, readImportFiles, detectJavaScriptImports)` returns import specifiers without type-checking. `ts.resolveModuleName(name, containingFile, compilerOptions, host, …, resolutionMode)` applies *exactly* tsc's rules, including `exports`, conditions and extension substitution (both in `typescript.d.ts` 5.9.3). A ~200-line driver would have to: find the nearest tsconfig per file (`ts.findConfigFile` + `parseJsonConfigFileContent`), pass the per-file resolution mode (ESM/CJS), and supply the workspace symlinks (or a `ModuleResolutionHost` that maps package names to workspace dirs). **Pros:** exact TS semantics, per-file tsconfig. **Cons:** you own the edge cases dependency-cruiser already handles (JS-only repos without tsconfig, AMD, `exoticRequireStrings`). It is pinned to TS 5.x for the JS API. TS 7 support was not evaluated here.

### 2.5 TS/JS recommendation

Start with **dependency-cruiser**, pinned together with `typescript@5.9.x`. Use this config: `tsPreCompilationDeps: true`, `tsConfig`, `enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: [...] }`, `doNotFollow`/`exclude` for `node_modules`. Before the cruise, run a Structra pre-step that reads the root `package.json` `workspaces` (or `pnpm-workspace.yaml`) and creates `node_modules/<name> → <dir>` symlinks, which avoids a dependency install. Afterwards, keep only edges with `couldNotResolve: false` whose `resolved` lies inside the repo, relativize, and sort. Track the `couldNotResolve` count for internal-looking specifiers as a quality metric. Move to a TS-compiler-API driver if per-package tsconfigs or exact `nodenext` semantics become a problem.

---

## 3. Rust

### 3.1 What resolution has to model

From the Rust Reference ([modules.md][rust-modules]): `mod foo;` loads `foo.rs` or `foo/mod.rs` (both present is an error). Ancestor module components are directories. `#[path = "…"]` is relative to the declaring file's directory, with different rules for inline modules in "mod-rs" versus "non-mod-rs" files. File-level edges come from:

1. **`mod` declarations** (parent → child file). Policy choice: count them as dependency edges or only as Tree hints.
2. **`use` trees and qualified paths in code** (`crate::a::b::f()`, `self::`, `super::`, and 2018 "uniform paths" where a child module name is in scope). Resolve to the **longest prefix that is a module** and link to that module's file, the same rule as grimp uses for Python.
3. **Cross-crate within a workspace:** `use other_crate::…` where `other_crate` is a workspace member. Map the crate name (`-`→`_`, `[lib] name`, dependency renames `package = …`) to its root file.

Things a syntax-only approach cannot see: modules or `use` generated by **macros** (`macro_rules!` bodies are token trees), `include!(…)`, and code generated by `build.rs` into `OUT_DIR`. `#[cfg(...)]` modules are visible syntactically, so taking the union over all cfgs gives a structural graph, which is the desired behaviour.

### 3.2 cargo-modules (0.28.0)

- Built on rust-analyzer's crates (`ra_ap_* = 0.0.358`, `Cargo.toml`). `dependencies` prints a module/item graph with `owns`/`uses` edges, filterable with `--no-fns --no-types --no-traits --no-externs --no-sysroot`. It runs per package (`-p`, `--lib`/`--bin`), and has a `--cfg-test` flag ([README][cm-readme]).
- **It builds things:** `load_config()` sets `load_out_dirs_from_check = true` (runs **build scripts**) and `with_proc_macro_server = Sysroot` (`src/analyzer.rs`). It needs a full `cargo metadata`.
- **Experiment:** `cargo metadata --offline` with an empty `CARGO_HOME` **fails** (`no matching package named 'anyhow'`). `cargo metadata --no-deps --offline` **succeeds** and lists crate targets and `src_path`s.
- **Verdict:** precise (macro-expanded, real name resolution), but it violates "no build, no deps". It also needs dep download (network) and outputs modules and items rather than files (a mapping is needed, and inline modules share files). It is heavy, and rust-analyzer crates release weekly as `0.0.x`. Good as an **offline oracle**, not for CI.

### 3.3 rust-analyzer directly

The CLI has `rust-analyzer scip <path>` (`crates/rust-analyzer/src/cli/flags.rs`), which emits every symbol reference with file positions. Deriving file → file edges from it is precise. Same costs as above: `cargo.buildScripts.enable` and `procMacro.enable` default to `true` ([configuration_generated.md][ra-config]). Non-Cargo projects need `rust-project.json` ([non_cargo_based_projects.md][ra-noncargo]). Not CI material for Structra.

### 3.4 syn vs tree-sitter-rust

Both are pure parsers with no name resolution. `syn` gives a full typed AST in Rust, but fails on a file that doesn't parse, and needs a Rust binary in the toolchain. **tree-sitter-rust** (0.24.2, prebuilt Python wheel) is error-tolerant and shares tooling with the C parser. Experiment: `mod_item` nodes were found for `#[cfg(test)] mod tests;` and `#[path="x.rs"] mod y;`. A `mod hidden;` inside `macro_rules!` was (as expected) not visible.

### 3.5 Rust recommendation

A **custom resolver on tree-sitter-rust**, written in the same language as the other parsers:

1. Get crates and target roots from `cargo metadata --no-deps --offline --format-version 1` (only the `cargo` binary is needed, with no network), or by parsing `Cargo.toml` and workspace `members` globs directly to drop that dependency too.
2. Build the module tree per crate from `mod` items plus `#[path]`, taking the union over `cfg`s.
3. Resolve `use` trees and path expressions (`crate`/`self`/`super`/workspace-crate prefixes, child-module uniform paths) to the longest module prefix, then map it to a file.
4. Log unresolved `mod` declarations: these are usually macro-, `include!`- or `OUT_DIR`-generated.

Validate offline against `cargo modules dependencies --no-fns --no-types --no-traits --no-externs --no-sysroot` on the Example Repo.

---

## 4. C

### 4.1 What resolution has to model

- `#include "f"` is searched first relative to the **directory of the file containing the directive**, then the `-iquote` dirs, then the `<…>` chain. `#include <f>` uses `-I` dirs, then system dirs. (gcc.gnu.org was blocked. Verified locally: `gcc -v` lists `-iquote` dirs only under the `"..."` chain and `-I` under `<...>`. `gcc -H` showed `sub/inner/x.h`'s `#include "y.h"` resolving to `sub/inner/y.h` with no `-I`.)
- Search paths live in the **build system**, not the source: Makefile/Kbuild `ccflags`, CMake `include_directories`/`target_include_directories`, Meson, and so on.
- **Linux kernel / Kbuild specifics** (torvalds/linux `a41e364995`):
  - `LINUXINCLUDE` = `-I arch/$(SRCARCH)/include`, `arch/$(SRCARCH)/include/generated`, `include`, `$(objtree)/include`, then `USERINCLUDE` = the `uapi` dirs of arch and `include`. Two headers are force-included on every TU: `-include include/linux/compiler-version.h` and `-include include/linux/kconfig.h` (top-level `Makefile` lines 592–607).
  - Per-directory flags: `ccflags-y`, `subdir-ccflags-y` (inherited by subdirectories) and per-object `CFLAGS_foo.o` ([makefiles.rst][kbuild] lines 321–353). Out-of-tree builds also add `-I $(src) -I $(obj)` (`scripts/Makefile.lib` line 144).
  - `<asm/x.h>` may not exist in `arch/*/include/asm`. In that case it is a **generated wrapper** of `include/asm-generic/x.h`, listed as `generic-y` in `arch/$(SRCARCH)/include/asm/Kbuild` or as `mandatory-y` in `include/asm-generic/Kbuild` ([makefiles.rst][kbuild] lines 1572–1624). The same holds for the `uapi` variants.
  - Other headers exist only after `make` (`generated/autoconf.h`, `generated/asm-offsets.h`, `asm/syscalls_64.h`, …).
  - Objects in subdirectories listed in the *parent* Makefile (e.g. `kvm-y += mmu/mmu.o` in `arch/x86/kvm/Makefile`) are compiled with the **parent's** `ccflags-y` (here `-I $(srctree)/arch/x86/kvm`).
  - Architecture is a parameter. One `SRCARCH` must be chosen (x86 is the natural default), and other arches' `asm/` includes are then unresolved.

### 4.2 `clang -MM` / `-MG`

`-MM`: "Like -MMD, but also implies -E and writes to stdout by default". `-MG`: "Add missing headers to depfile" (`clang/include/clang/Options/Options.td`).

**Experiment** on `kernel/fork.c` with `LINUXINCLUDE`-equivalent flags: it fails immediately with `'generated/autoconf.h' file not found`. With `-MG` it proceeds and lists 887 headers, including missing generated ones (`asm/types.h`, `generated/bounds.h`, …).

**Problems:**
- It runs the preprocessor for **one configuration**. With no `autoconf.h`, every `CONFIG_*` is undefined, so `#ifdef CONFIG_X` includes vanish.
- It lists the **transitive** closure per translation unit, not direct edges (`-H` gives the hierarchy).
- It needs the exact per-file flags. It is cost-heavy (it preprocesses every TU) and depends on the clang version.

**Verdict:** not suitable without a configured build.

### 4.3 `compile_commands.json`

The format is `{directory, file, arguments|command, output}` per TU ([JSONCompilationDatabase.md][jcdb]). It gives exact per-file `-I` flags *when it exists*. For the kernel, `scripts/clang-tools/gen_compile_commands.py` builds it from the `.cmd` files a kernel build leaves behind (`_LINE_PATTERN = r'^(saved)?cmd_…\.o := …'`), so it **requires a build**. Generic CMake projects need a configure step (`CMAKE_EXPORT_COMPILE_COMMANDS`), which needs dependencies to be found. **Use a committed `compile_commands.json` opportunistically, as a search-path source only.**

### 4.4 Pure `#include` scan with heuristics

**Experiment.** A ~70-line Python scanner was run on a sparse kernel checkout: `include/`, `arch/x86/`, `kernel/`, `mm/`, `lib/`, `fs/ext4/`, `drivers/gpu/drm/i915/`, 10,500 `.c`/`.h` files. It used:

- A regex for `#include`.
- Quote includes: current dir → `ccflags`/`subdir-ccflags`/`CFLAGS_*.o` `-I` dirs from this and ancestor Makefiles/Kbuild → `LINUXINCLUDE`.
- Angle includes: `ccflags` dirs → `LINUXINCLUDE` → `generic-y`/`mandatory-y` fallback to `include/asm-generic`.

**Results:**

| | resolved | unresolved |
|---|---|---|
| `"…"` | 6,549 | 55 |
| `<…>` | 20,108 direct + 34 via `generic-y` | 284 |
| **total** | **26,691 (98.7 %)** | **339** |

The run took 0.75 s and produced 26,532 distinct edges. Output was identical under different `PYTHONHASHSEED`s (traversal is sorted). The first version, without ancestor `ccflags` and per-object `CFLAGS`, left 186 quote includes unresolved. Adding the parent-Makefile rule brought that down to 55.

Remaining unresolved, by cause:
- libc headers from userspace/host programs (`stdio.h`, `stdlib.h`, …). These are correctly external.
- Other architectures' `asm/` headers in `lib/` (`asm/neon.h`, `asm/vector.h`, `asm/cpacf.h`).
- Truly generated headers (`generated/asm-offsets.h`, `asm/syscalls_64.h`).
- `asm/types.h`, which comes from the **uapi** `generic-y`/`mandatory-y` lists that the prototype didn't read. This is an easy fix.

**General failure modes:**
- Macro includes (`#include FOO_H`, `#include __FILE__`-style tricks). tree-sitter-c reports them as a `preproc_include` with an `identifier` path, so they can be logged.
- `#include_next`.
- **Ambiguous basenames** when a heuristic falls back to "any file with this name". Never guess: drop the edge, or apply a fixed, documented tie-break.
- Build systems other than Kbuild need their own `-I` extraction. For CMake, grep `include_directories`/`target_include_directories`. Otherwise fall back to the common convention of `include/` dirs.
- `#ifdef` branches are all included (union over configs). That is desirable for structure.

### 4.5 C recommendation

A **pure scan** (regex or tree-sitter-c `preproc_include`) plus a **search-path provider** chosen per repo:

1. Kbuild provider for the kernel: `LINUXINCLUDE`, `ccflags`/`subdir-ccflags`/`CFLAGS_*.o` including the parent-Makefile rule, `generic-y`/`mandatory-y` for both `asm` and `uapi/asm`, and a fixed `SRCARCH=x86`.
2. A committed `compile_commands.json`, if any.
3. CMake/Make `-I` greps.
4. Conventions.

Unresolved includes are logged and counted; never guessed.

---

## 5. tree-sitter as a single cross-language base

**What it offers.** One incremental, error-tolerant parser API: "Robust enough to provide useful results even in the presence of syntax errors" ([tree-sitter README][ts-readme]). Grammars for all four languages ship as prebuilt Python wheels (`tree-sitter` 0.26.0, `tree-sitter-{python 0.25.0, typescript 0.23.2, javascript 0.25.0, rust 0.24.2, c 0.24.2}`), so no compiler is needed in CI. Parsing is deterministic for a given grammar version. Queries can extract `preproc_include`, `mod_item`, `use_declaration`, `import_statement` and so on uniformly. Tree-sitter's own "code navigation" support is tag extraction (definitions/references by name), **not** name resolution ([4-code-navigation.md][ts-nav]).

**What it doesn't offer.** Resolution. GitHub's **stack-graphs** (name resolution on top of tree-sitter, with language definitions for Python, JS, TS and Java only) carries the banner "This repository is no longer supported or updated by GitHub". Its last commit was 2025-09-09. Its DSL base, `tree-sitter-graph`, was last committed 2024-12-11. Building on them means adopting unmaintained code and still writing Rust and C rules.

**Comparison:**

| | tree-sitter base + own resolvers | native tools per language |
|---|---|---|
| Parse robustness | Uniform, error-tolerant, version-independent of the target's toolchain | Varies: `ast` is tied to the host Python version; tsc/acorn are robust; syn is strict |
| Resolution fidelity | Only as good as what we write. Fine for Python, Rust and C, whose rules are mostly filesystem rules. Poor for TS (`paths`, `exports`, conditions, ESM/CJS) | Best where a mature resolver exists (TS: enhanced-resolve / tsc) |
| No build / no deps | Yes | Python and TS: yes (with the symlink trick). Rust (cargo-modules/RA) and C (`clang -MM`, compile DB): **no** |
| Determinism | We control it | Python and TS tools were deterministic in testing. All still need post-sort/relativize |
| CI runtime | Python + wheels | Python + Node (+ cargo for metadata) |

**Recommendation: hybrid.** Use tree-sitter (or the stdlib `ast` for Python) as the parse layer where no good resolver exists (Rust, C). Write a small per-language resolver against a common interface, `files → [(src, dst)]`. For TS/JS, reuse dependency-cruiser's resolver rather than reimplementing Node and TypeScript resolution. All Parsers then share one normalize-and-sort writer for the Graph File.

---

## Appendix: how the experiments were run

All work was done in a session scratchpad; nothing was written to the repo except this file.

- **numpy** `80049a0ec1` (shallow clone):
  - `generate_dot.py` with `ROOT`/`OUTPUT` as argv, run under `PYTHONHASHSEED=1`/`2`. A variant also tried `module + "." + name` for `from` imports.
  - `pydeps numpy --show-deps --no-output --nodot [--max-bacon 0]`.
  - `grimp.build_graph("numpy", cache_dir=None)` with the checkout on `PYTHONPATH`.
- **dependency-cruiser 18.7.2:** synthetic two-package npm workspace (`exports` subpaths, tsconfig `paths`, `.js`-suffixed import, `require`, dynamic `import()`, `import type`). Run with and without a `node_modules/@x/a` symlink and with and without `enhancedResolveOptions.exportsFields`. Run with typescript 7.0.2 and 5.9.3.
- **Rust:** `cargo metadata [--no-deps] --offline` with an empty `CARGO_HOME` in a cargo-modules checkout. tree-sitter-rust queried for `mod_item`.
- **Linux** `a41e364995` (sparse: `include/ arch/x86/ kernel/ mm/ lib/ fs/ext4/ drivers/gpu/drm/i915/`):
  - The heuristic scanner described in §4.4.
  - `clang -nostdinc <LINUXINCLUDE> -include …kconfig.h -D__KERNEL__ -MM [-MG] kernel/fork.c`.

## Sources

Primary sources, at the commits read:

- grimp `3c4c7c9c6d`: `src/grimp/application/usecases.py`, `src/grimp/adaptors/{modulefinder,packagefinder}.py`, `rust/Cargo.toml`, `rust/src/import_{parsing,scanning}.rs` (also the installed 3.19 wheel). <https://github.com/python-grimp/grimp>
- [pydeps-readme]: <https://github.com/thebjorn/pydeps> (README; source `pydeps/mf27.py`, `py2depgraph.py` at `9f086edb4e`)
- [dc-opts]: <https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md> (`e6517db02e`)
- [dc-out]: <https://github.com/sverweij/dependency-cruiser/blob/main/doc/output-format.md>
- [dc-faq]: <https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md>
- [madge-readme]: <https://github.com/pahen/madge> (`456057b85c`)
- [ts-ref]: TypeScript Modules Reference, `packages/documentation/copy/en/modules-reference/Reference.md` in <https://github.com/microsoft/TypeScript-Website> (`a3ed0be524`; published at typescriptlang.org/docs/handbook/modules/reference.html)
- TypeScript 5.9.3 `lib/typescript.d.ts` (`preProcessFile`, `resolveModuleName`)
- [cm-readme]: <https://github.com/regexident/cargo-modules> (`48455ca596`: README, `Cargo.toml`, `src/analyzer.rs`)
- [ra-config]: rust-analyzer `docs/book/src/configuration_generated.md`. [ra-noncargo]: `docs/book/src/non_cargo_based_projects.md`. `crates/rust-analyzer/src/cli/flags.rs`. All at <https://github.com/rust-lang/rust-analyzer> (`91f2c17c55`)
- [rust-modules]: Rust Reference `src/items/modules.md`, <https://github.com/rust-lang/reference> (`a2ae66d703`)
- `cargo metadata --help` (cargo 1.97.0): `--no-deps`: "Output information only about the workspace members and don't fetch dependencies"
- [kbuild]: `Documentation/kbuild/makefiles.rst`, top-level `Makefile`, `scripts/Makefile.lib`, `scripts/clang-tools/gen_compile_commands.py`. <https://github.com/torvalds/linux> (`a41e364995`)
- [jcdb]: `clang/docs/JSONCompilationDatabase.md`; `clang/include/clang/Options/Options.td` (`-MM`, `-MG`). <https://github.com/llvm/llvm-project> (`cac5de14d5`)
- [ts-readme]: <https://github.com/tree-sitter/tree-sitter> README. [ts-nav]: `docs/src/4-code-navigation.md` (`f342e6220e`)
- stack-graphs README (`fcb7705d5b`): <https://github.com/github/stack-graphs>. tree-sitter-graph (`b930fb59c2`): <https://github.com/tree-sitter/tree-sitter-graph>

[pydeps-readme]: https://github.com/thebjorn/pydeps
[dc-opts]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md
[dc-out]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/output-format.md
[dc-faq]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md
[madge-readme]: https://github.com/pahen/madge
[ts-ref]: https://github.com/microsoft/TypeScript-Website/blob/v2/packages/documentation/copy/en/modules-reference/Reference.md
[cm-readme]: https://github.com/regexident/cargo-modules
[ra-config]: https://github.com/rust-lang/rust-analyzer/blob/master/docs/book/src/configuration_generated.md
[ra-noncargo]: https://github.com/rust-lang/rust-analyzer/blob/master/docs/book/src/non_cargo_based_projects.md
[rust-modules]: https://github.com/rust-lang/reference/blob/master/src/items/modules.md
[kbuild]: https://github.com/torvalds/linux/blob/master/Documentation/kbuild/makefiles.rst
[jcdb]: https://github.com/llvm/llvm-project/blob/main/clang/docs/JSONCompilationDatabase.md
[ts-readme]: https://github.com/tree-sitter/tree-sitter
[ts-nav]: https://github.com/tree-sitter/tree-sitter/blob/master/docs/src/4-code-navigation.md
