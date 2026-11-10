"""The crates of a checkout: every target of every package whose tracked
`Cargo.toml` has a `[package]` table.

Crates come from `cargo metadata --no-deps --offline` (no network, no build),
run once per workspace. When `cargo` is missing or fails on a manifest (for
example on a package that sits inside a workspace without being a member of
it), that manifest is read directly, with Cargo's target auto-discovery rules.
Both routes give the same crates, so a Graph File doesn't depend on whether
`cargo` is installed. Crate roots outside the tracked files are dropped.
"""

import json
import posixpath
import subprocess
import tomllib
from dataclasses import dataclass
from pathlib import Path

LIB_KINDS = frozenset({"lib", "rlib", "dylib", "cdylib", "staticlib", "proc-macro"})


@dataclass(frozen=True, order=True)
class Crate:
    root: str  # repo-relative path of the crate root file
    edition: str
    lib_name: str | None  # the name other crates `use` a library by; None for other targets


def crates(repo: Path, tracked: list[str]) -> list[Crate]:
    """The crates of every tracked manifest, sorted."""
    manifests = _Manifests(repo, tracked)
    found: set[Crate] = set()
    covered: set[str] = set()
    for manifest in manifests.paths:
        if manifest in covered:
            continue
        packages = _cargo_metadata(repo, manifest)
        if packages is None:
            packages = [(manifest, manifests.crates(manifest))]
        for package_manifest, package_crates in packages:
            if package_manifest in manifests.tracked and package_manifest not in covered:
                covered.add(package_manifest)
                found |= package_crates
        covered.add(manifest)  # a virtual workspace manifest has no package
    return sorted(c for c in found if c.root in manifests.tracked)


def _cargo_metadata(repo: Path, manifest: str) -> list[tuple[str, set[Crate]]] | None:
    """(package manifest, its crates) for each package of the manifest's
    workspace, or None when `cargo` is missing or fails."""
    command = ["cargo", "metadata", "--no-deps", "--offline", "--format-version", "1"]
    try:
        result = subprocess.run(
            [*command, "--manifest-path", str(repo / manifest)], capture_output=True, text=True
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    root = repo.resolve()
    packages = []
    for package in json.loads(result.stdout)["packages"]:
        package_manifest = _relative(root, package["manifest_path"])
        if package_manifest is None:
            continue
        found = set()
        for target in package["targets"]:
            path = _relative(root, target["src_path"])
            if path is not None:
                lib = target["name"] if LIB_KINDS.intersection(target["kind"]) else None
                found.add(Crate(path, target.get("edition", package["edition"]), lib))
        packages.append((package_manifest, found))
    return packages


def _relative(root: Path, path: str) -> str | None:
    try:
        return Path(path).resolve().relative_to(root).as_posix()
    except ValueError:
        return None


# Target kinds other than lib: (manifest key, auto-discovery switch, directory).
_TARGET_KINDS = [("bin", "autobins", "src/bin"), ("example", "autoexamples", "examples"),
                 ("test", "autotests", "tests"), ("bench", "autobenches", "benches")]


class _Manifests:
    """The tracked manifests, read without cargo."""

    def __init__(self, repo: Path, tracked: list[str]) -> None:
        self.repo = repo
        self.tracked = set(tracked)
        self.paths = sorted(f for f in tracked if posixpath.basename(f) == "Cargo.toml")
        self.cache: dict[str, dict | None] = {}

    def load(self, manifest: str) -> dict | None:
        if manifest not in self.cache:
            data = None
            if manifest in self.tracked:
                try:
                    data = tomllib.loads((self.repo / manifest).read_text(encoding="utf-8"))
                except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError):
                    pass
            self.cache[manifest] = data
        return self.cache[manifest]

    def _workspace_edition(self, manifest: str, package: dict) -> str:
        if isinstance(package.get("workspace"), str):
            candidates = [posixpath.normpath(posixpath.join(posixpath.dirname(manifest), package["workspace"]))]
        else:
            candidates, d = [], posixpath.dirname(manifest)
            while True:
                candidates.append(d)
                if not d:
                    break
                d = posixpath.dirname(d)
        for d in candidates:
            data = self.load(posixpath.join(d, "Cargo.toml"))
            if data is not None and isinstance(data.get("workspace"), dict):
                return str(data["workspace"].get("package", {}).get("edition", "2015"))
        return "2015"

    def _edition(self, manifest: str, package: dict) -> str:
        edition = package.get("edition", "2015")
        if isinstance(edition, dict):
            return self._workspace_edition(manifest, package)
        return str(edition)

    def crates(self, manifest: str) -> set[Crate]:
        data = self.load(manifest)
        if data is None or not isinstance(data.get("package"), dict):
            return set()
        package = data["package"]
        name = package.get("name")
        if not isinstance(name, str):
            return set()
        base = posixpath.dirname(manifest)
        edition = self._edition(manifest, package)

        def path(relative: str) -> str:
            return posixpath.normpath(posixpath.join(base, relative))

        def exists(relative: str) -> bool:
            return path(relative) in self.tracked

        found = set()
        lib = data.get("lib")
        if isinstance(lib, dict) or (package.get("autolib", True) and exists("src/lib.rs")):
            lib = lib if isinstance(lib, dict) else {}
            lib_path = lib.get("path", "src/lib.rs")
            if exists(lib_path):
                lib_name = lib.get("name", name.replace("-", "_"))
                found.add(Crate(path(lib_path), str(lib.get("edition", edition)), lib_name))

        for kind, auto_key, directory in _TARGET_KINDS:
            discovered = self._discover(base, directory)
            if kind == "bin" and exists("src/main.rs"):
                discovered = {name: "src/main.rs", **discovered}
            explicit = [t for t in data.get(kind, []) if isinstance(t, dict)]
            paths: dict[str, str] = {}  # target path -> edition
            for target in explicit:
                target_name = target.get("name")
                relative = target.get("path") or (discovered.get(target_name) if isinstance(target_name, str) else None)
                if relative is None and isinstance(target_name, str):
                    relative = next(
                        (p for p in (f"{directory}/{target_name}.rs", f"{directory}/{target_name}/main.rs") if exists(p)),
                        None,
                    )
                if relative is not None and exists(relative):
                    paths[relative] = str(target.get("edition", edition))
            if package.get(auto_key, edition != "2015" or not explicit):
                names = {t.get("name") for t in explicit}
                for target_name, relative in discovered.items():
                    if target_name not in names and relative not in paths:
                        paths[relative] = edition
            found |= {Crate(path(relative), target_edition, None) for relative, target_edition in paths.items()}

        build = package.get("build", True)
        if isinstance(build, str) and exists(build):
            found.add(Crate(path(build), edition, None))
        elif build is True and exists("build.rs"):
            found.add(Crate(path("build.rs"), edition, None))
        return found

    def _discover(self, base: str, directory: str) -> dict[str, str]:
        """Target name -> path (relative to the package) of `directory/*.rs`
        and `directory/*/main.rs`."""
        prefix = posixpath.join(base, directory) + "/"
        found: dict[str, str] = {}
        for f in sorted(self.tracked):
            if not f.startswith(prefix):
                continue
            rest = f[len(prefix):].split("/")
            if len(rest) == 1 and rest[0].endswith(".rs"):
                found.setdefault(rest[0][:-3], f"{directory}/{rest[0]}")
            elif len(rest) == 2 and rest[1] == "main.rs":
                found.setdefault(rest[0], f"{directory}/{rest[0]}/main.rs")
        return found
