// The Parser of each language: its directory, the command that runs it from the repository root,
// and the toolchain a CI job needs to run it. Shared by examples-regen.ts,
// examples-check.ts and ci-matrix.ts.
export const parsers: Record<string, { command: string[]; toolchain: 'uv' | 'node'; dir: string }> = {
  python: {
    command: ['uv', 'run', '--project', 'parsers/python', '--frozen', '--quiet', 'structra-parse-python'],
    toolchain: 'uv',
    dir: 'parsers/python',
  },
  // Hosted in the Python project.
  rust: {
    command: ['uv', 'run', '--project', 'parsers/python', '--frozen', '--quiet', 'structra-parse-rust'],
    toolchain: 'uv',
    dir: 'parsers/python',
  },
  // Needs `npm ci --prefix parsers/typescript` first.
  typescript: { command: ['node', 'parsers/typescript/src/cli.ts'], toolchain: 'node', dir: 'parsers/typescript' },
}
