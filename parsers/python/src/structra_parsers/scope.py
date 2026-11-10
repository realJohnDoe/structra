"""Which files of a checkout are In-scope Files (ADR 0003)."""

import subprocess
from pathlib import Path

VENDORED = frozenset({"vendor", "third_party", "third-party", "node_modules"})


def in_scope_files(repo: Path, extensions: frozenset[str], excludes: list[str]) -> list[str]:
    """Tracked files with one of `extensions`, minus vendored directories,
    submodules and paths matching an `excludes` glob (git pathspec syntax)."""
    pathspecs = [f":(top,glob,exclude){glob}" for glob in excludes]
    out = subprocess.run(
        ["git", "-C", str(repo), "ls-files", "-z", "--stage", "--", *pathspecs],
        check=True,
        capture_output=True,
    ).stdout
    files = []
    for entry in out.decode("utf-8").split("\0"):
        if not entry:
            continue
        info, path = entry.split("\t", 1)
        if info.startswith("160000 "):  # a submodule
            continue
        if Path(path).suffix not in extensions:
            continue
        if VENDORED.intersection(path.split("/")):
            continue
        files.append(path)
    return files
