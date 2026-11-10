"""Conformance fixtures: the Parser CLI as a process (spec #35, seam 1).

Each `fixtures/<name>/fixture.toml` describes a tiny repository. The test
builds it as a git checkout, runs the Parser on it, and checks the exit code,
stderr and (for exit 0) the Graph File bytes against
`fixtures/<name>/expected.graph.json`.

fixture.toml keys (all optional):
  parser   CLI to run (default "structra-parse-python")
  git      false: don't make it a git repository
  origin   remote.origin.url; omitted means no origin remote
  args     extra CLI arguments after PATH
  exit     expected exit code (default 0)
  stderr   substrings stderr must contain
  [files]  path = content, committed
  [dirty]  path = content, written after the commit
  gitlinks paths committed as submodule entries
"""

import json
import os
import subprocess
import tomllib
from pathlib import Path

import jsonschema
import pytest

HERE = Path(__file__).parent
FIXTURES = HERE.parent / "fixtures"
SCHEMA = json.loads((HERE.parents[2] / "schema" / "graph-file.schema.json").read_text())

# Fixed identity and dates, so a fixture's commit SHA never changes.
GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Structra Fixture",
    "GIT_AUTHOR_EMAIL": "fixture@structra.invalid",
    "GIT_AUTHOR_DATE": "2026-01-01T00:00:00Z",
    "GIT_COMMITTER_NAME": "Structra Fixture",
    "GIT_COMMITTER_EMAIL": "fixture@structra.invalid",
    "GIT_COMMITTER_DATE": "2026-01-01T00:00:00Z",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
}


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args], env=GIT_ENV, check=True, capture_output=True, text=True
    ).stdout


def build_checkout(spec: dict, repo: Path) -> None:
    repo.mkdir()
    for path, content in spec.get("files", {}).items():
        (repo / path).parent.mkdir(parents=True, exist_ok=True)
        (repo / path).write_text(content, encoding="utf-8")
    if not spec.get("git", True):
        return
    git(repo, "init", "--quiet", "--initial-branch=main")
    git(repo, "add", "--all")
    for path in spec.get("gitlinks", []):
        git(repo, "update-index", "--add", "--cacheinfo", f"160000,{'1' * 40},{path}")
        (repo / path).mkdir(parents=True)  # as a clone without --recurse-submodules leaves it
    git(repo, "commit", "--quiet", "--allow-empty", "--no-gpg-sign", "--message", "fixture")
    if "origin" in spec:
        git(repo, "remote", "add", "origin", spec["origin"])
    for path, content in spec.get("dirty", {}).items():
        (repo / path).write_text(content, encoding="utf-8")


def run_parser(spec: dict, repo: Path, *extra: str) -> subprocess.CompletedProcess[bytes]:
    cli = spec.get("parser", "structra-parse-python")
    return subprocess.run([cli, str(repo), *spec.get("args", []), *extra], capture_output=True)


def check_graph_file(text: str) -> None:
    graph = json.loads(text)
    jsonschema.Draft202012Validator(SCHEMA).validate(graph)
    # The rules the schema can't express (schema/README.md).
    assert graph["nodes"] == sorted(set(graph["nodes"]))
    edges = [tuple(e) for e in graph["edges"]]
    assert edges == sorted(set(edges))
    nodes = set(graph["nodes"])
    for src, dst in graph["edges"]:
        assert src in nodes and dst in nodes and src != dst


FIXTURE_NAMES = sorted(p.name for p in FIXTURES.iterdir() if (p / "fixture.toml").exists())


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_fixture(name: str, tmp_path: Path) -> None:
    spec = tomllib.loads((FIXTURES / name / "fixture.toml").read_text(encoding="utf-8"))
    repo = tmp_path / "repo"
    build_checkout(spec, repo)

    result = run_parser(spec, repo)
    stderr = result.stderr.decode()

    assert result.returncode == spec.get("exit", 0), stderr
    for fragment in spec.get("stderr", []):
        assert fragment in stderr
    if result.returncode != 0:
        assert result.stdout == b""
        return
    expected = (FIXTURES / name / "expected.graph.json").read_bytes()
    assert result.stdout.decode() == expected.decode()
    check_graph_file(result.stdout.decode())
    assert json.loads(result.stdout)["meta"]["commit"] == git(repo, "rev-parse", "HEAD").strip()
