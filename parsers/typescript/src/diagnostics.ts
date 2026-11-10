/** What the resolver reports, for stderr. */
export class Diagnostics {
  readonly parseFailures: string[] = []
  readonly unresolved = new Map<string, number>()
  readonly warnings: string[] = []

  parseFailed(path: string, reason: string): void {
    this.parseFailures.push(`${path}: ${reason}`)
  }

  unresolvedImport(name: string): void {
    this.unresolved.set(name, (this.unresolved.get(name) ?? 0) + 1)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }
}
