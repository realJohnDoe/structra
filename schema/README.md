# Graph File format

A **Graph File** (`<name>.graph.json`) is the Dependency Graph of one repository at one commit, as a Parser emits it (see `GLOSSARY.md`). This README is the one place where its rules are written down. The Python and TypeScript writers both implement them.

`graph-file.schema.json` (JSON Schema, draft 2020-12) checks the shape. It validates Graph Files in CI and on upload. A Graph File has no version field: it is valid only with the app and Parsers of the same structra commit.

## Content

```json
{
  "meta": {
    "repo": "https://github.com/pallets/flask",
    "commit": "22d924701a6ae2e4cd01e9a15bbaf3946094af65",
    "language": "python",
    "parser": { "name": "structra-parse-python" }
  },
  "nodes": [
    "src/flask/__init__.py",
    "src/flask/app.py"
  ],
  "edges": [
    ["src/flask/__init__.py", "src/flask/app.py"]
  ]
}
```

- `meta.repo` is the normalized `origin` URL, `https://<host>/<owner>/<name>`. `meta.commit` is the full SHA of the parsed commit. `meta.language` is one of `python`, `typescript`, `rust` and `c`. `meta.parser.name` names the Parser. Nothing else goes in: no versions, timestamps, hostnames, absolute paths or timings.
- `nodes` lists every In-scope File as a repo-relative POSIX path (no leading `/`, no `\`, no empty segment).
- `edges` lists `[importer, imported]` pairs. They are directed and carry no multiplicity.

The schema forbids extra keys at every level. These rules it can't express, so `validateGraphFile` (`src/core/graphFile.ts`) checks them on top:

- `nodes` is sorted by Unicode codepoint, with no duplicates. Codepoint order is not JavaScript's default string order, which compares UTF-16 code units.
- `edges` is sorted by importer, then by imported (each by codepoint), with no duplicates.
- Both ends of every edge are in `nodes`.
- No edge is a self-import.

## Serialization

A Graph File has exactly one byte form, so two Parser runs on the same commit give identical files:

- UTF-8, LF line endings, a trailing newline, no BOM.
- Keys in the fixed order shown above: `meta` (`repo`, `commit`, `language`, `parser`), then `nodes`, then `edges`.
- Two-space indentation, laid out exactly as in the example: `parser` on one line as `{ "name": … }`, one node or edge per line, `, ` between the two ends of an edge.
- An empty list is written `[]` on its key's line.
- Strings are escaped as JSON requires and no further: non-ASCII characters are written as themselves (as `JSON.stringify` does, or Python's `json.dumps(…, ensure_ascii=False)`).

`serializeGraphFile` in `src/core/graphFile.ts` is the app's TypeScript writer. The Parsers' writers are `parsers/python/src/structra_parsers/graph_file.py` and `parsers/typescript/src/graphFile.ts`.
