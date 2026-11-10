# Python-hosted Parsers

The uv project behind `structra-parse-python` (and later `structra-parse-rust` and `structra-parse-c`). The CLI contract, the in-scope rules and the exit codes are in `docs/adr/0003-parser-architecture.md`. The Graph File rules are in `schema/README.md`.

```sh
uv sync                                    # pinned Python (.python-version) and dev dependencies
uv run structra-parse-python PATH -o out.graph.json [--exclude GLOB]...
uv run pytest                              # conformance fixtures and the grimp oracle
```

## Layout

- `src/structra_parsers/cli.py`: the CLI layer every Parser shares: arguments, git checks (`HEAD`, clean tree, normalized `origin`), stderr diagnostics and exit codes. A Parser is a `Language`: a name, file extensions and a resolver.
- `src/structra_parsers/scope.py`: which tracked files are In-scope Files.
- `src/structra_parsers/graph_file.py`: the Python Graph File writer.
- `src/structra_parsers/python.py`: Python import resolution with a stdlib-`ast` scanner. Its docstring states the resolution rules.

## Conformance fixtures

Each `fixtures/<name>/fixture.toml` describes a tiny repository with its files inline, so case-only and non-ASCII paths work on every filesystem. `tests/test_fixtures.py` builds it as a git checkout, runs the Parser as a process, and checks the exit code, stderr fragments and the Graph File bytes against `expected.graph.json`. The keys are listed in that test's docstring.

Fixture commits use a fixed author and date, so `meta.commit` is stable. When you add or change a fixture, take the new SHA from the test failure.

`tests/test_grimp_oracle.py` checks the Parser's edges against grimp's on every fixture's regular packages. Intended differences are listed, with reasons, in its `DIFFERENCES`.

Python resolution doesn't see dynamic imports (`importlib.import_module`, `__import__`), or sub-projects that only an install would put on `sys.path` (such as flask's `examples/tutorial`). Source roots are the repository root and `src/`.
