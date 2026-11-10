// The Parser of each language: the command that runs it from the repository root,
// and the toolchain a CI job needs to run it. Shared by examples-regen.ts,
// examples-check.ts and ci-matrix.ts.
export const parsers: Record<string, { command: string[]; toolchain: 'uv' | 'node' }> = {
  python: {
    command: ['uv', 'run', '--project', 'parsers/python', '--frozen', '--quiet', 'structra-parse-python'],
    toolchain: 'uv',
  },
}
