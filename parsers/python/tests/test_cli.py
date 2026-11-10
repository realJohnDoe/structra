"""The CLI contract beyond what a fixture's stdout shows (ADR 0003)."""

import subprocess
import tomllib
from pathlib import Path

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


def test_help_describes_the_contract() -> None:
    result = subprocess.run([CLI, "--help"], capture_output=True, text=True)
    assert result.returncode == 0
    assert result.stdout.startswith("usage: structra-parse-python [-h] [-o FILE] [--exclude GLOB]")
    assert "[PATH]" in result.stdout


def test_version_prints_name_and_version() -> None:
    result = subprocess.run([CLI, "--version"], capture_output=True, text=True)
    assert result.returncode == 0
    assert result.stdout == "structra-parse-python 0.1.0\n"


def test_c_parser_shares_the_contract() -> None:
    result = subprocess.run(["structra-parse-c", "--help"], capture_output=True, text=True)
    assert result.returncode == 0
    assert result.stdout.startswith("usage: structra-parse-c [-h] [-o FILE] [--exclude GLOB]")
    version = subprocess.run(["structra-parse-c", "--version"], capture_output=True, text=True)
    assert version.stdout == "structra-parse-c 0.1.0\n"
