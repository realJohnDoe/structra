"""structra-parse-python: Python imports, resolved with a stdlib-ast scanner.

Resolution rules (see docs/research/import-resolution.md, section 1):

- Every `import` and `from … import` anywhere in a file counts, including
  conditional, function-local and `TYPE_CHECKING` imports.
- Modules are looked up among the In-scope Files only, by exact path, so
  results don't depend on the filesystem's case sensitivity. A module `a/b` is
  `a/b/__init__.py`, `a/b.py`, `a/b/__init__.pyi` or `a/b.pyi`, in that order.
- Absolute imports are looked up in the source roots, the repository root and
  then `src/`. The first root that has the top-level name (as a module or as a
  directory) is used, as `sys.path` would.
- Relative imports are resolved from the importing file's directory.
- An import links to the longest prefix of its dotted name that is a module
  (grimp's rule). For `from M import n`, `M.n` is tried first, so importing a
  submodule links to the submodule and not to its package's `__init__`.
- An import that names a module of this repository but resolves to no file is
  reported on stderr as unresolved.
"""

import ast
import posixpath
import sys
import warnings
from pathlib import Path

from .cli import Diagnostics, Language, run

ROOTS = ("", "src")


class _Modules:
    """The In-scope Files, looked up as modules."""

    def __init__(self, files: list[str]) -> None:
        self.files = set(files)
        self.dirs = {posixpath.dirname(f) for f in files}
        for d in list(self.dirs):
            while d:
                d = posixpath.dirname(d)
                self.dirs.add(d)

    def file(self, path: str) -> str | None:
        for candidate in (f"{path}/__init__.py", f"{path}.py", f"{path}/__init__.pyi", f"{path}.pyi"):
            if candidate in self.files:
                return candidate
        return None

    def exists(self, path: str) -> bool:
        return self.file(path) is not None or path in self.dirs

    def longest(self, base: str, parts: list[str]) -> str | None:
        """The file of the longest module `base/parts[:i]`, down to `base` itself."""
        for i in range(len(parts), -1, -1):
            path = posixpath.join(base, *parts[:i]) if i else base
            if path and (found := self.file(path)):
                return found
        return None


def _targets(modules: _Modules, file: str, node: ast.Import | ast.ImportFrom, diagnostics: Diagnostics) -> list[str]:
    """The files one import statement links to."""
    if isinstance(node, ast.Import):
        requests = [(0, alias.name, None) for alias in node.names]
    else:
        names = [alias.name for alias in node.names if alias.name != "*"]
        requests = [(node.level, node.module or "", name) for name in names] or [(node.level, node.module or "", None)]

    targets = []
    for level, module, name in requests:
        parts = module.split(".") if module else []
        written = "." * level + (module if module or name is None else name)
        if level:
            package = file.split("/")[:-1]
            if level - 1 > len(package):
                diagnostics.unresolved_import(written)  # beyond the repository root
                continue
            base = "/".join(package[: len(package) - (level - 1)])
        else:
            base = next((r for r in ROOTS if modules.exists(posixpath.join(r, parts[0]))), None)
            if base is None:
                continue  # not a module of this repository
        found = name is not None and modules.file(posixpath.join(base, *parts, name))
        found = found or modules.longest(base, parts)
        if found:
            targets.append(found)
        else:
            diagnostics.unresolved_import(written)
    return targets


def resolve(repo: Path, files: list[str], diagnostics: Diagnostics) -> list[tuple[str, str]]:
    modules = _Modules(files)
    edges = []
    for file in files:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                tree = ast.parse((repo / file).read_bytes(), filename=file)
        except (SyntaxError, ValueError, RecursionError, OSError) as e:
            diagnostics.parse_failed(file, f"{type(e).__name__}: {e}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import | ast.ImportFrom):
                edges.extend((file, target) for target in _targets(modules, file, node, diagnostics))
    return edges


PYTHON = Language("python", frozenset({".py", ".pyi"}), resolve)


def main() -> None:
    sys.exit(run(PYTHON))
