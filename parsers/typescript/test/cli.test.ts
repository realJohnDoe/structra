// The CLI contract beyond what a fixture's stdout shows (ADR 0003).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parse } from 'smol-toml'
import { buildCheckout, CLI, FIXTURES, git, runParser, type Fixture } from './support.ts'

const fixture = (name: string) => parse(readFileSync(join(FIXTURES, name, 'fixture.toml'), 'utf8')) as Fixture
const expected = (name: string) => readFileSync(join(FIXTURES, name, 'expected.graph.json'))

test('-o writes the Graph File to a file and nothing to stdout', async (t) => {
  const repo = await buildCheckout(t, fixture('resolution'))
  const out = join(repo, '..', 'out.graph.json')
  const result = runParser(repo, '-o', out)
  assert.equal(result.status, 0)
  assert.equal(result.stdout.length, 0)
  assert.deepEqual(readFileSync(out), expected('resolution'))
})

test('PATH defaults to the current directory', async (t) => {
  const repo = await buildCheckout(t, fixture('resolution'))
  const result = spawnSync(process.execPath, [CLI], { cwd: repo })
  assert.deepEqual(result.stdout, expected('resolution'))
})

test('running the Parser twice leaves the checkout clean', async (t) => {
  const repo = await buildCheckout(t, fixture('workspaces-npm'))
  for (let run = 0; run < 2; run++) {
    const result = runParser(repo)
    assert.equal(result.status, 0, result.stderr.toString())
    assert.deepEqual(result.stdout, expected('workspaces-npm'))
    // Not even untracked or ignored files: the workspace links live outside it.
    assert.equal(git(repo, 'status', '--porcelain', '--ignored', '--untracked-files=all'), '')
  }
})

test('--help describes the contract', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.ok(result.stdout.startsWith('usage: structra-parse-typescript [-h] [-o FILE] [--exclude GLOB]'))
  assert.ok(result.stdout.includes('[PATH]'))
})

test('--version prints name and version', () => {
  const result = spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'structra-parse-typescript 0.1.0\n')
})

test('-o without FILE is a usage error', async (t) => {
  const repo = await buildCheckout(t, fixture('resolution'))
  const result = runParser(repo, '-o')
  assert.equal(result.status, 2)
  assert.ok(result.stderr.toString().startsWith('usage: structra-parse-typescript'))
})
