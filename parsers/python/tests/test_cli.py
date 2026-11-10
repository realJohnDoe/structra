"""The CLI contract beyond what a fixture's stdout shows (ADR 0003)."""

import subprocess
import tomllib
from pathlib import Path

import pytest

from test_fixtures import FIXTURES, build_checkout

CLI = "structra-parse-python"


def test_output_flag_writes_the_graph_file_to_a_file_and_nothing_to_stdout(tmp_path: Path) -> None:
    spec = tomllib.loads((FIXTURES / "packages" / "fixture.toml").read_text(encoding="utf-8"))
    build_checkout(spec, tmp_path / "repo")
    out = tmp_path / "out.graph.json"
    result = subprocess.run([CLI, str(tmp_path / "repo"), "-o", str(out)], capture_output=True)
    assert result.returncode == 0
    assert result.stdout == b""
    assert out.read_bytes() == (FIXTURES / "packages" / "expected.graph.json").read_bytes()


def test_path_defaults_to_the_current_directory(tmp_path: Path) -> None:
    spec = tomllib.loads((FIXTURES / "packages" / "fixture.toml").read_text(encoding="utf-8"))
    build_checkout(spec, tmp_path / "repo")
    result = subprocess.run([CLI], capture_output=True, cwd=tmp_path / "repo")
    assert result.stdout == (FIXTURES / "packages" / "expected.graph.json").read_bytes()


@pytest.mark.parametrize("cli", ["structra-parse-python", "structra-parse-c"])
def test_help_describes_the_contract(cli: str) -> None:
    result = subprocess.run([cli, "--help"], capture_output=True, text=True)
    assert result.returncode == 0
    assert result.stdout.startswith(f"usage: {cli} [-h] [-o FILE] [--exclude GLOB]")
    assert "[PATH]" in result.stdout


@pytest.mark.parametrize("cli", ["structra-parse-python", "structra-parse-c"])
def test_version_prints_name_and_version(cli: str) -> None:
    result = subprocess.run([cli, "--version"], capture_output=True, text=True)
    assert result.returncode == 0
    assert result.stdout == f"{cli} 0.1.0\n"
