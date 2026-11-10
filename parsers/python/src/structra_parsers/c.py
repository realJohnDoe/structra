"""structra-parse-c: C `#include`s, resolved with a scan and search paths.

Resolution rules (see docs/research/import-resolution.md, section 4):

- Every `#include "…"` and `#include <…>` counts, in every `#if` branch.
  Includes inside comments don't. Macro includes (`#include NAME`) and
  `#include_next` are skipped.
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
- An unresolved `"…"` include is reported on stderr. An unresolved `<…>`
  include is a system or external header and is ignored.
"""

import posixpath
import re
import sys
from pathlib import Path

from .cli import Diagnostics, Language, run
from .scope import tracked_files

# String and character literals are matched so that comment markers inside them
# are kept; comments are blanked, keeping their newlines.
_LEXEMES = re.compile(r'"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'|/\*.*?\*/|//[^\n]*', re.S)
_INCLUDE = re.compile(r'^[ \t]*#[ \t]*include[ \t]*(?:"([^"\n]+)"|<([^>\n]+)>)', re.M)

_BUILD_FILE = re.compile(r"^(?:[Mm]akefile|GNUmakefile|.+\.mk|.+\.mak|.+\.mak\..+)$")
_FLAG = re.compile(r"""(?:^|(?<=[\s'"=(,]))-I[ \t]*([^\s$(){}'";,\\]+)(?=[\s'";,)]|$)""")


def _strip_comments(text: str) -> str:
    def blank(match: re.Match[str]) -> str:
        lexeme = match[0]
        return lexeme if lexeme[0] in "\"'" else " " + "\n" * lexeme.count("\n")

    return _LEXEMES.sub(blank, text)


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
                text = (repo / build_file).read_bytes().decode("utf-8", errors="replace")
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
    edges = []
    for file in files:
        try:
            text = (repo / file).read_bytes().decode("utf-8", errors="replace")
        except OSError as e:
            diagnostics.parse_failed(file, f"{type(e).__name__}: {e}")
            continue
        directory = posixpath.dirname(file)
        for quoted, angled in _INCLUDE.findall(_strip_comments(text)):
            name = quoted or angled
            places = ([directory] if quoted else []) + search.of(directory)
            candidates = (_join(place, name) for place in places)
            target = next((c for c in candidates if c in known), None)
            if target:
                edges.append((file, target))
            elif quoted:
                diagnostics.unresolved_import(name)
    return edges


C = Language("c", frozenset({".c", ".h"}), resolve)


def main() -> None:
    sys.exit(run(C))
