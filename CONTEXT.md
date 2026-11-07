# Structra glossary

**Dependency Graph**: Files of a repository (nodes) and the directed file-to-file import relationships between them (edges), as extracted by a Parser. An edge says only that one file imports another, not how often.

**Leaf**: A file. The smallest unit placed in a tree.

**Tree**: A rooted hierarchy whose leaves are the files of a Dependency Graph. Its internal nodes group files.

**Directory Tree**: The Tree given by the repository's actual folder structure.

**Optimal Tree**: The Tree that minimizes Total Cost for a given Balance, found by search rather than taken from the folder structure. Has no single-child internal nodes.

**Branching (k)**: The number of children of an internal node.

**Node Cost**: Σ ln k over all internal nodes of a Tree. Penalizes having many decision points.

**Crossing**: An internal node on the tree path between the two files of a dependency edge.

**Edge Cost**: For one dependency edge, Σ ln k over the internal nodes it crosses. Penalizes dependencies that span distant parts of the Tree. (Exactly which path nodes count is still open.)

**Balance (λ)**: The slider weight between Edge Cost and Node Cost: Total Cost = λ·Σ Edge Cost + (1−λ)·Node Cost.

**Parser**: A per-language tool that reads a repository checkout and emits a Graph File.

**Graph File**: The serialized Dependency Graph of one repository at one commit, as emitted by a Parser and read by the app. Lists every in-scope file, including files with no dependencies, and each directed import from importer to imported file at most once. Records which repository, commit, language and Parser it came from, and nothing that varies between runs. Valid only together with the app and Parsers of the same structra commit.

**Example Repo**: A well-known repository pinned at a specific commit, shipped with a precomputed Graph File. It doubles as an end-to-end test for its Parser.
