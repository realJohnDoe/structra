// PROTOTYPE (throwaway, ticket "Tune the mapping from Dependency Graph to Optimal Tree").
// A contraction of a binary dendrogram is a set S of surviving internal nodes (root ∈ S).
// Cost(S; λ) = Σ_{x∈S} (α·X(x) + β)·ln k(x), α = λ/|E|, β = (1−λ)/N   (ADR 0001)
//   k(x) = #frontier nodes under x, X(x) = cut(x) + I(x) − Σ_{f∈frontier(x)} I(f)
// with static per-dendrogram-node I (edges inside) and cut (edges with one end inside).
export interface Dendro { n: number; parent: Int32Array; children: [number, number][]; root: number }

export class Contraction {
  n: number; total: number; root: number;
  kids: Int32Array; par: Int32Array; I: Float64Array; cut: Float64Array; E: number;
  surv: Uint8Array;
  // scratch from refresh()
  bk = new Float64Array(0); bs = new Float64Array(0); anc = new Int32Array(0); order: number[] = [];
  constructor(d: Dendro, edges: [number, number][]) {
    const n = d.n; this.n = n; this.total = 2 * n - 1; this.root = d.root; this.E = edges.length;
    this.par = Int32Array.from(d.parent);
    this.kids = new Int32Array(2 * this.total).fill(-1);
    for (let i = 0; i < d.children.length; i++) { this.kids[2 * (n + i)] = d.children[i][0]; this.kids[2 * (n + i) + 1] = d.children[i][1]; }
    // pre-order
    const order: number[] = []; const st = [d.root];
    while (st.length) { const x = st.pop()!; order.push(x); if (x >= n) { st.push(this.kids[2 * x + 1], this.kids[2 * x]); } }
    this.order = order;
    const depth = new Int32Array(this.total);
    for (const x of order) if (x !== d.root) depth[x] = depth[this.par[x]] + 1;
    const deg = new Float64Array(this.total); const lcaCnt = new Float64Array(this.total);
    for (const [a0, b0] of edges) {
      deg[a0]++; deg[b0]++;
      let a = a0, b = b0;
      while (a !== b) { if (depth[a] >= depth[b]) a = this.par[a]; else b = this.par[b]; }
      lcaCnt[a]++;
    }
    this.I = new Float64Array(this.total); this.cut = new Float64Array(this.total);
    for (let i = order.length - 1; i >= 0; i--) {
      const x = order[i];
      this.I[x] += lcaCnt[x];
      if (x !== d.root) { this.I[this.par[x]] += this.I[x]; deg[this.par[x]] += deg[x]; }
      this.cut[x] = deg[x] - 2 * this.I[x];
    }
    this.surv = new Uint8Array(this.total);
    this.surv[d.root] = 1;
  }
  full() { for (let x = this.n; x < this.total; x++) this.surv[x] = 1; return this; }
  flat() { this.surv.fill(0); this.surv[this.root] = 1; return this; }
  setSurvivors(s: Uint8Array) { this.surv.set(s); return this; }
  // below(v): (#frontier, ΣI frontier) over v's children's fronts; anc: nearest survivor strictly above.
  refresh() {
    const { n, total, order, kids, par, surv, I } = this;
    if (this.bk.length !== total) { this.bk = new Float64Array(total); this.bs = new Float64Array(total); this.anc = new Int32Array(total); }
    const bk = this.bk, bs = this.bs, anc = this.anc;
    const fk = new Float64Array(total), fs = new Float64Array(total);
    for (let i = order.length - 1; i >= 0; i--) {
      const x = order[i];
      if (x < n) { fk[x] = 1; fs[x] = 0; continue; }
      const a = kids[2 * x], b = kids[2 * x + 1];
      bk[x] = fk[a] + fk[b]; bs[x] = fs[a] + fs[b];
      if (surv[x]) { fk[x] = 1; fs[x] = I[x]; } else { fk[x] = bk[x]; fs[x] = bs[x]; }
    }
    anc[this.root] = -1;
    for (const x of order) { if (x === this.root) continue; const p = par[x]; anc[x] = surv[p] ? p : anc[p]; }
  }
  X(x: number) { return this.cut[x] + this.I[x] - this.bs[x]; }
  cost(lambda: number) {
    this.refresh();
    const a = this.E ? lambda / this.E : 0, b = (1 - lambda) / this.n;
    let c = 0, e = 0, nd = 0;
    for (let x = this.n; x < this.total; x++) if (this.surv[x]) { const lk = Math.log(this.bk[x]); c += (a * this.X(x) + b) * lk; e += this.X(x) * lk; nd += lk; }
    return { total: c, edgeTerm: this.E ? e / this.E : 0, nodeTerm: nd / this.n };
  }
  // Δ of toggling v (after refresh()).
  delta(v: number, lambda: number): number {
    const a = this.E ? lambda / this.E : 0, b = (1 - lambda) / this.n;
    const x = this.anc[v];
    const kx = this.bk[x], Xx = this.X(x);
    const kv = this.bk[v], Xv = this.cut[v] + this.I[v] - this.bs[v];
    if (this.surv[v]) { // remove
      const kx2 = kx + kv - 1, Xx2 = Xx + this.I[v] - this.bs[v];
      return a * (Xx2 * Math.log(kx2) - Xx * Math.log(kx) - Xv * Math.log(kv)) + b * (Math.log(kx2) - Math.log(kx) - Math.log(kv));
    } // add
    const kx2 = kx - kv + 1, Xx2 = Xx + this.bs[v] - this.I[v];
    return a * (Xx2 * Math.log(kx2) + Xv * Math.log(kv) - Xx * Math.log(kx)) + b * (Math.log(kx2) + Math.log(kv) - Math.log(kx));
  }
  // Best-improvement descent. mode: "remove" | "add" | "both". Returns #moves.
  descend(lambda: number, mode: "remove" | "add" | "both", eps = 1e-9) {
    let moves = 0;
    for (;;) {
      this.refresh();
      let best = -eps, bv = -1;
      for (let v = this.n; v < this.total; v++) {
        if (v === this.root) continue;
        if (this.surv[v] ? mode === "add" : mode === "remove") continue;
        const d = this.delta(v, lambda);
        if (d < best) { best = d; bv = v; }
      }
      if (bv < 0) return moves;
      this.surv[bv] ^= 1; moves++;
    }
  }
  // Contracted tree as par/kids over dendrogram ids (for materialization).
  tree(): { par: Int32Array; kids: number[][] } {
    this.refresh();
    const par = new Int32Array(this.total).fill(-1); const kids: number[][] = Array.from({ length: this.total }, () => []);
    for (const x of this.order) {
      if (x === this.root) continue;
      if (x < this.n || this.surv[x]) { const p = this.anc[x]; par[x] = p; kids[p].push(x); }
    }
    return { par, kids };
  }
}
