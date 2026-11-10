"""grimp as an oracle for import resolution (spec #35, seam 1).

For every fixture that produces a Graph File, grimp builds the import graph of
the fixture's regular packages (top-level directories with an `__init__.py`
in a source root). On the files grimp sees, the Parser's edges must equal
grimp's, apart from the differences documented in DIFFERENCES. Self-imports
are left out of grimp's edges, since a Graph File has none by definition.

grimp doesn't see files outside regular packages (such as a tests directory
without `__init__.py`) or `.pyi` stubs, so those aren't compared.
"""

import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest
from test_fixtures import FIXTURE_NAMES, FIXTURES, build_checkout

ROOTS = ("", "src")

# Edges on which the Parser and grimp disagree on purpose:
# (fixture, importer, imported) -> who has the edge, and why.
DIFFERENCES = {
    ("packages", "src/app/core/engine.py", "src/app/__init__.py"): (
        "grimp only: `from .. import types` names the stub-only module types.pyi. "
        "grimp doesn't see stubs and links to the package; the Parser links to the stub."
    ),
}

GRIMP = """
import json, sys, grimp
graph = grimp.build_graph(*sys.argv[1:], cache_dir=None)
print(json.dumps({
    "modules": sorted(graph.modules),
    "edges": sorted([m, i] for m in graph.modules for i in graph.find_modules_directly_imported_by(m)),
}))
"""


def regular_packages(repo: Path) -> dict[str, Path]:
    """Top-level regular packages, by name, with the source root they're in."""
    found: dict[str, Path] = {}
    for root in ROOTS:
        for init in sorted((repo / root).glob("*/__init__.py")):
            found.setdefault(init.parent.name, repo / root)
    return found


def module_file(repo: Path, packages: dict[str, Path], module: str) -> str:
    path = packages[module.split(".")[0]].joinpath(*module.split("."))
    file = path / "__init__.py" if (path / "__init__.py").is_file() else path.with_suffix(".py")
    return file.relative_to(repo).as_posix()


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_edges_agree_with_grimp(name: str, tmp_path: Path) -> None:
    spec = tomllib.loads((FIXTURES / name / "fixture.toml").read_text(encoding="utf-8"))
    if spec.get("exit", 0) != 0:
        pytest.skip("no Graph File")
    repo = tmp_path / "repo"
    build_checkout(spec, repo)
    packages = regular_packages(repo)
    if not packages:
        pytest.skip("no regular packages for grimp")

    env = {**os.environ, "PYTHONPATH": os.pathsep.join(sorted({str(p) for p in packages.values()}))}
    oracle = json.loads(
        subprocess.run(
            [sys.executable, "-c", GRIMP, *sorted(packages)],
            env=env, cwd=tmp_path, check=True, capture_output=True, text=True,
        ).stdout
    )
    seen = {module_file(repo, packages, m) for m in oracle["modules"]}
    theirs = {(module_file(repo, packages, m), module_file(repo, packages, i)) for m, i in oracle["edges"] if m != i}

    graph = subprocess.run(
        ["structra-parse-python", str(repo), *spec.get("args", [])], check=True, capture_output=True
    ).stdout
    ours = {(s, d) for s, d in json.loads(graph)["edges"] if s in seen and d in seen}

    documented = {(s, d) for (fixture, s, d) in DIFFERENCES if fixture == name}
    assert ours ^ theirs == documented
