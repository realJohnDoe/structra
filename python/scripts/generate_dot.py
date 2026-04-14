import ast
from pathlib import Path
from collections import defaultdict

# =========================
# CONFIG
# =========================
ROOT = Path(r"C:\Users\johan\code\numpy\numpy")  # <-- change this
OUTPUT = "file_deps.dot"

# =========================
# HELPERS
# =========================

def relpath(p: Path) -> str:
    return str(p.relative_to(ROOT)).replace("\\", "/")

def resolve_module(module: str, current_file: Path) -> Path | None:
    """
    Resolve a module name to a file inside ROOT, handling:
    - absolute imports
    - relative imports
    """
    # -------------------------
    # Relative import handling
    # -------------------------
    if module.startswith("."):
        # count leading dots
        level = len(module) - len(module.lstrip("."))
        base = current_file.parent

        # go up for each dot beyond first
        for _ in range(level - 1):
            base = base.parent

        module = module.lstrip(".")
        parts = module.split(".") if module else []

    else:
        base = ROOT
        parts = module.split(".") if module else []

    # -------------------------
    # Try module.py
    # -------------------------
    p1 = base.joinpath(*parts).with_suffix(".py")
    if p1.exists():
        return p1

    # -------------------------
    # Try module/__init__.py
    # -------------------------
    p2 = base.joinpath(*parts, "__init__.py")
    if p2.exists():
        return p2

    return None


def extract_imports(file: Path):
    """
    Extract import statements from a Python file,
    including relative imports and __init__ cases.
    """
    try:
        tree = ast.parse(file.read_text(encoding="utf-8"))
    except Exception:
        return []

    imports = []

    for node in ast.walk(tree):

        # import x.y.z
        if isinstance(node, ast.Import):
            for n in node.names:
                imports.append(n.name)

        # from x.y import z
        elif isinstance(node, ast.ImportFrom):

            # relative imports
            if node.level > 0:
                base = "." * node.level
                if node.module:
                    imports.append(base + node.module)
                else:
                    # from . import x
                    for n in node.names:
                        imports.append(base + n.name)

            else:
                if node.module:
                    imports.append(node.module)

    return imports


# =========================
# BUILD GRAPH
# =========================

edges = defaultdict(set)

py_files = list(ROOT.rglob("*.py"))

for file in py_files:
    src = relpath(file)

    imports = extract_imports(file)

    for imp in imports:
        target = resolve_module(imp, file)

        if not target:
            continue  # skip external libs / unresolved imports

        dst = relpath(target)

        if src != dst:
            edges[src].add(dst)


# =========================
# WRITE DOT FILE
# =========================

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write("digraph G {\n")
    f.write("  rankdir=LR;\n")
    f.write("  node [shape=box];\n\n")

    for src, targets in edges.items():
        for dst in targets:
            f.write(f'  "{src}" -> "{dst}";\n')

    f.write("}\n")

print(f"Written: {OUTPUT}")