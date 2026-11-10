"""The CLI layer every Parser shares (ADR 0003):

    structra-parse-<language> [PATH] [-o FILE] [--exclude GLOB]...

Exit codes: 0 Graph File written, 1 fatal, 2 usage error.
"""

import argparse
import re
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from . import __version__
from .graph_file import Meta, serialize_graph_file
from .scope import in_scope_files


class Fatal(Exception):
    """An error that stops the run with exit code 1."""


@dataclass
class Diagnostics:
    """Collects what a language plugin reports, for stderr."""

    parse_failures: list[str]
    unresolved: dict[str, int]

    def parse_failed(self, path: str, reason: str) -> None:
        self.parse_failures.append(f"{path}: {reason}")

    def unresolved_import(self, name: str) -> None:
        self.unresolved[name] = self.unresolved.get(name, 0) + 1


# Reads the files (repo-relative paths) of one checkout and returns the edges.
Resolver = Callable[[Path, list[str], Diagnostics], list[tuple[str, str]]]


@dataclass(frozen=True)
class Language:
    name: str  # meta.language
    extensions: frozenset[str]
    resolve: Resolver

    @property
    def parser(self) -> str:
        return f"structra-parse-{self.name}"


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise Fatal(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


_SCP = re.compile(r"^(?:[^@/:]+@)?([^@/:]+):(?!//)(.+)$")


def normalize_origin(url: str) -> str:
    """`https://<host>/<owner>/<name>` for an origin URL in https, scp-style
    (`git@host:owner/name.git`) or `ssh://` form, without credentials, ports
    (except on http(s)), a trailing `.git` or a trailing slash."""
    if scp := _SCP.match(url):
        host, port, path = scp[1], None, scp[2]
    else:
        parts = urlsplit(url)
        if parts.scheme not in {"https", "http", "ssh", "git", "git+ssh"} or not parts.hostname:
            raise Fatal(f"can't turn the origin URL {url!r} into https://<host>/<owner>/<name>")
        host, path = parts.hostname, parts.path
        port = parts.port if parts.scheme in {"https", "http"} else None
    path = path.strip("/").removesuffix(".git").strip("/")
    if not path:
        raise Fatal(f"the origin URL {url!r} names no repository")
    return f"https://{host.lower()}{f':{port}' if port else ''}/{path}"


def _meta(repo: Path, language: Language) -> Meta:
    toplevel = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    if toplevel.returncode != 0:
        raise Fatal(f"{repo} is not a git work tree")
    if Path(toplevel.stdout.strip()).resolve() != repo.resolve():
        raise Fatal(f"{repo} is not the root of its git work tree ({toplevel.stdout.strip()})")
    commit = _git(repo, "rev-parse", "--verify", "HEAD").strip()
    if _git(repo, "status", "--porcelain", "--untracked-files=no"):
        raise Fatal(f"{repo} has uncommitted changes to tracked files; commit or stash them first")
    origin = subprocess.run(
        ["git", "-C", str(repo), "config", "--get", "remote.origin.url"], capture_output=True, text=True
    )
    if origin.returncode != 0:
        raise Fatal(f"{repo} has no origin remote; a Graph File must name its repository")
    return Meta(normalize_origin(origin.stdout.strip()), commit, language.name, language.parser)


def _parse_args(language: Language, argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog=language.parser,
        description=f"Write the Graph File of a git checkout's {language.name} files.",
    )
    parser.add_argument("path", nargs="?", default=".", metavar="PATH", help="the checkout (default: .)")
    parser.add_argument("-o", dest="output", metavar="FILE", help="write the Graph File to FILE, not stdout")
    parser.add_argument(
        "--exclude", action="append", default=[], metavar="GLOB", help="leave out matching files (repeatable)"
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser.parse_args(argv)


def _report(language: Language, diagnostics: Diagnostics) -> None:
    def say(line: str) -> None:
        print(line, file=sys.stderr)

    if diagnostics.parse_failures:
        say(f"{language.parser}: {len(diagnostics.parse_failures)} files failed to parse (kept as nodes without edges):")
        for failure in sorted(diagnostics.parse_failures):
            say(f"  {failure}")
    if diagnostics.unresolved:
        say(f"{language.parser}: {sum(diagnostics.unresolved.values())} unresolved internal-looking imports:")
        for name in sorted(diagnostics.unresolved):
            say(f"  {name} ({diagnostics.unresolved[name]})")


def run(language: Language, argv: list[str] | None = None) -> int:
    args = _parse_args(language, argv)
    repo = Path(args.path)
    try:
        meta = _meta(repo, language)
        files = in_scope_files(repo, language.extensions, args.exclude)
    except Fatal as e:
        print(f"{language.parser}: {e}", file=sys.stderr)
        return 1
    diagnostics = Diagnostics([], {})
    edges = language.resolve(repo, files, diagnostics)
    _report(language, diagnostics)
    text = serialize_graph_file(meta, files, edges)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8", newline="\n")
    else:
        sys.stdout.buffer.write(text.encode("utf-8"))
    return 0
