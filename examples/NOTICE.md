# Example Repo notice

The Graph Files (`examples/<name>.graph.json`) and dendrograms in this
directory are derived from the third-party repositories listed below, each at
the commit pinned in [`repos.toml`](repos.toml). They describe those
repositories' file names and import structure.

Each derived artifact stays under its upstream repository's license. Structra's
own [MIT license](../LICENSE) does not cover them.

| Example Repo | Upstream | License (SPDX) | License file at the pin |
| --- | --- | --- | --- |
| flask | [pallets/flask](https://github.com/pallets/flask) | `BSD-3-Clause` | `LICENSE.txt` |
| requests | [psf/requests](https://github.com/psf/requests) | `Apache-2.0` | `LICENSE`, `NOTICE` |
| numpy | [numpy/numpy](https://github.com/numpy/numpy) | `BSD-3-Clause` | `LICENSE.txt` |
| django | [django/django](https://github.com/django/django) | `BSD-3-Clause` | `LICENSE`, `LICENSE.python` |
| express | [expressjs/express](https://github.com/expressjs/express) | `MIT` | `LICENSE` |
| vite | [vitejs/vite](https://github.com/vitejs/vite) | `MIT` | `LICENSE` |
| react | [facebook/react](https://github.com/facebook/react) | `MIT` | `LICENSE` |
| ripgrep | [BurntSushi/ripgrep](https://github.com/BurntSushi/ripgrep) | `Unlicense OR MIT` | `COPYING`, `UNLICENSE`, `LICENSE-MIT` |
| tokio | [tokio-rs/tokio](https://github.com/tokio-rs/tokio) | `MIT` | `LICENSE` |
| redis | [redis/redis](https://github.com/redis/redis) | `LicenseRef-RSALv2 OR SSPL-1.0 OR AGPL-3.0-only` | `LICENSE.txt` |
| git | [git/git](https://github.com/git/git) | `GPL-2.0-only` | `COPYING` |

Notes:

- **numpy**: the Graph File covers Python files only. The repo-level license is
  BSD-3-Clause; the broader expression in numpy's `pyproject.toml` covers C
  libraries vendored into its built wheels.
- **django**: BSD-3-Clause, with some code taken from the Python standard
  library under the Python license (see its `LICENSE.python`).
- **redis**: from Redis 8 on, the repo is tri-licensed at the user's choice.
  RSALv2 has no SPDX identifier, hence `LicenseRef-RSALv2`.
- **git**: GPLv2 only, as stated at the top of its `COPYING`; some
  individual files carry other compatible licenses.
