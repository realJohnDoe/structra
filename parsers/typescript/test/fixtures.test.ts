/**
 * Conformance fixtures: the Parser CLI as a process (spec #35, seam 1).
 *
 * Each `fixtures/<name>/fixture.toml` describes a tiny repository. The test
 * builds it as a git checkout, runs the Parser on it, and checks the exit
 * code, stderr and (for exit 0) the Graph File bytes against
 * `fixtures/<name>/expected.graph.json`.
 *
 * fixture.toml keys (all optional), as in parsers/python/tests/test_fixtures.py:
 *   git        false: don't make it a git repository
 *   origin     remote.origin.url; omitted means no origin remote
 *   args       extra CLI arguments after PATH
 *   exit       expected exit code (default 0)
 *   stderr     substrings stderr must contain
 *   [files]    path = content, committed
 *   [symlinks] path = target, committed as symbolic links
 *   [dirty]    path = content, written after the commit
 *   gitlinks   paths committed as submodule entries
 *
 * Fixture commits use a fixed author and date, so `meta.commit` is stable.
 * `STRUCTRA_UPDATE_FIXTURES=1 npm test` rewrites the expected files of
 * fixtures that exit 0; review the diff before committing it.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parse } from 'smol-toml'
import { buildCheckout, checkGraphFile, FIXTURES, git, runParser, type Fixture } from './support.ts'

const names = readdirSync(FIXTURES)
  .filter((name) => existsSync(join(FIXTURES, name, 'fixture.toml')))
  .sort()

for (const name of names) {
  test(`fixture ${name}`, async (t) => {
    const spec = parse(readFileSync(join(FIXTURES, name, 'fixture.toml'), 'utf8')) as Fixture
    const repo = await buildCheckout(t, spec)
    const result = runParser(repo, ...(spec.args ?? []))
    const stderr = result.stderr.toString()

    assert.equal(result.status, spec.exit ?? 0, stderr)
    for (const fragment of spec.stderr ?? []) assert.ok(stderr.includes(fragment), `stderr lacks ${JSON.stringify(fragment)}:\n${stderr}`)
    if (result.status !== 0) {
      assert.equal(result.stdout.length, 0)
      return
    }
    const expectedFile = join(FIXTURES, name, 'expected.graph.json')
    if (process.env.STRUCTRA_UPDATE_FIXTURES) writeFileSync(expectedFile, result.stdout)
    const expected = readFileSync(expectedFile, 'utf8')
    assert.equal(result.stdout.toString(), expected)
    checkGraphFile(expected)
    assert.equal(JSON.parse(expected).meta.commit, git(repo, 'rev-parse', 'HEAD').trim())
  })
}
