"""structra-parse-c: C `#include`s, parsed with tree-sitter-c and resolved
with search paths.

Resolution rules (see docs/research/import-resolution.md, section 4):

- Every `#include "…"` and `#include <…>` counts, in every `#if` branch.
  Includes inside comments and `#include_next` don't. Files that don't parse
  cleanly (macro-heavy C) still give the includes tree-sitter recovers.
- Headers are looked up among the In-scope Files only, by exact path, so
  results don't depend on the filesystem's case sensitivity. A path that
  leaves the repository finds nothing.
- `#include "f"` is looked up in the includer's directory, then in the search
  path. `#include <f>` is looked up in the search path only.
- A file's search path comes from the build files (`Makefile`, `makefile`,
  `GNUmakefile`, `*.mk`, `*.mak`, `*.mak.*`) of its directory and of each
  ancestor, nearest directory first. Each directory contributes the literal
  `-I DIR` flags of its build files (in path order, then in file order),
  relative to that directory, and then its `include/`. Flags with variables
  (`-I$(X)`), absolute paths, paths outside the repository and flags in `#`
  comments are ignored. All conditional flags count, like all `#if` branches.
- Headers use the search path of their own directory, since they have no
  compile flags of their own.
- The first match wins. Nothing is guessed from a basename.
- An unresolved `"…"` include is reported on stderr, and so is a macro
  include (`#include NAME`), by its macro. An unresolved `<…>` include is a
  system or external header and is ignored.

Not modelled yet (Linux is out of scope for v1): Kbuild (`ccflags-y`,
`LINUXINCLUDE`, `generic-y`), CMake `include_directories`,
`compile_commands.json`, and `-iquote`/`-isystem` flags.

tree-sitter and tree-sitter-c are pinned exactly: a new grammar can change
what is parsed, so a bump regenerates the C Example Repos on purpose.
"""

import posixpath
import re
import sys
from pathlib import Path

import tree_sitter_c
from tree_sitter import Language as Grammar
from tree_sitter import Parser, Query, QueryCursor

from .cli import Diagnostics, Language, run
from .scope import tracked_files

_GRAMMAR = Grammar(tree_sitter_c.language())
_INCLUDE_PATHS = Query(_GRAMMAR, "(preproc_include path: (_) @path)")

_BUILD_FILE = re.compile(r"^(?:[Mm]akefile|GNUmakefile|.+\.mk|.+\.mak|.+\.mak\..+)$")
_FLAG = re.compile(r"""(?:^|(?<=[\s'"=(,]))-I[ \t]*([^\s$(){}'";,\\]+)(?=[\s'";,)]|$)""")


def _includes(parser: Parser, source: bytes) -> list[tuple[str, str]]:
    """(kind, name) of each `#include` in order: kind is `"` for `"name"`, `<`
    for `<name>`, and `macro` for a macro include, named by its source text."""
    paths = QueryCursor(_INCLUDE_PATHS).captures(parser.parse(source).root_node).get("path", [])
    found = []
    for node in sorted(paths, key=lambda n: n.start_byte):
        text = (node.text or b"").decode("utf-8", errors="replace")
        if node.type == "string_literal":
            found.append(('"', text[1:-1]))
        elif node.type == "system_lib_string":
            found.append(("<", text[1:-1]))
        else:
            found.append(("macro", text))
    return found


def _read_text(repo: Path, path: str) -> str:
    return (repo / path).read_bytes().decode("utf-8", errors="replace")


def _join(directory: str, name: str) -> str | None:
    """`directory/name` normalized, or None if it leaves the repository."""
    if posixpath.isabs(name):
        return None
    path = posixpath.normpath(posixpath.join(directory, name))
    if path == ".":
        return ""
    if path == ".." or path.startswith("../"):
        return None
    return path


class _SearchPaths:
    """The search path each directory sees, nearest directory first."""

    def __init__(self, repo: Path, tracked: list[str]) -> None:
        self.flags: dict[str, list[str]] = {}
        for build_file in sorted(f for f in tracked if _BUILD_FILE.match(posixpath.basename(f))):
            directory = posixpath.dirname(build_file)
            try:
                text = _read_text(repo, build_file)
            except OSError:
                continue
            for line in text.splitlines():
                for value in _FLAG.findall(line.split("#", 1)[0]):
                    if (path := _join(directory, value)) is not None:
                        self.flags.setdefault(directory, []).append(path)
        self.cache: dict[str, list[str]] = {}

    def of(self, directory: str) -> list[str]:
        if directory not in self.cache:
            outer = self.of(posixpath.dirname(directory)) if directory else []
            own = [*self.flags.get(directory, []), posixpath.join(directory, "include")]
            self.cache[directory] = list(dict.fromkeys(own + outer))
        return self.cache[directory]


def resolve(repo: Path, files: list[str], diagnostics: Diagnostics) -> list[tuple[str, str]]:
    known = set(files)
    search = _SearchPaths(repo, tracked_files(repo))
    parser = Parser(_GRAMMAR)
    edges = []
    for file in files:
        try:
            source = (repo / file).read_bytes()
        except OSError as e:
            diagnostics.parse_failed(file, f"{type(e).__name__}: {e}")
            continue
        directory = posixpath.dirname(file)
        for kind, name in _includes(parser, source):
            if kind == "macro":
                diagnostics.unresolved_import(name)
                continue
            places = ([directory] if kind == '"' else []) + search.of(directory)
            candidates = (_join(place, name) for place in places)
            target = next((c for c in candidates if c in known), None)
            if target:
                edges.append((file, target))
            elif kind == '"':
                diagnostics.unresolved_import(name)
    return edges


C = Language("c", frozenset({".c", ".h"}), resolve)


def main() -> None:
    sys.exit(run(C))
