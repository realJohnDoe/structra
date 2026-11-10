// Draws the README's toy diagram: the toy Graph File's Dependency Graph next to
// its Optimal Tree, both from our own optimizer, as one SVG.
//
//   npm run readme:diagram [-- --out FILE]
//
// Reads examples/toy.graph.json and writes docs/images/toy-diagram.svg (or FILE).
// The output is byte-deterministic; scripts/readme-diagram.test.ts checks that
// the committed SVG is what this script writes. Exit codes: 0 written, 2 usage error.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildArtifact, treeAt } from '../src/core/artifact.ts'
import type { GraphFile } from '../src/core/graphFile.ts'
import type { OptimalGroup } from '../src/core/sweep.ts'
import { isGroup, type TreeNode } from '../src/app/icicle.ts'
import { lambdaOf } from '../src/app/url.ts'

/** The λ step drawn: 0.80, where the toy splits into three groups. */
const STEP = 80

const root = join(import.meta.dirname, '..')
const usage = 'usage: readme-diagram [--out FILE]'

function parseArgs(argv: string[]): { out: string } | null {
  let out = join(root, 'docs', 'images', 'toy-diagram.svg')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && i + 1 < argv.length) out = argv[++i]
    else return null
  }
  return { out }
}

const ROW = 30
const TOP = 58
const ANCHOR = 116 // x of the file dots; import arcs bulge left of it
const LEAF = 308 // x where the tree's leaf lines start
const LEVEL = 34 // x per level of the tree
const HUES = ['#2f7fd8', '#e0802a', '#2a9d6e', '#9b5de5', '#d64f7a']

/** The SVG's stylesheet, with a dark variant for GitHub's dark theme. */
const STYLE = [
  '  <style>',
  '    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; fill: #24292f; }',
  '    .title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; }',
  '    .label { fill: #57606a; }',
  '    .ink { fill: #57606a; }',
  '    .import { fill: none; stroke-width: 1.5; opacity: 0.85; }',
  '    .across { stroke: #8c959f; stroke-dasharray: 4 3; }',
  '    .tree { fill: none; stroke-width: 2; }',
  '    .tree:not([stroke]) { stroke: #57606a; }',
  '    #head path { fill: #8c959f; }',
  '    @media (prefers-color-scheme: dark) {',
  '      text { fill: #e6edf3; }',
  '      .label, .ink { fill: #9198a1; }',
  '      .tree:not([stroke]) { stroke: #9198a1; }',
  '      .across { stroke: #6e7681; }',
  '      #head path { fill: #6e7681; }',
  '    }',
  '  </style>',
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderDiagram(graph: GraphFile, tree: OptimalGroup, lambda: string): string {
  // Leaf order, and each file's top-level group (the root's child it sits in).
  const order: string[] = []
  const topGroupOf = new Map<string, number>()
  const collect = (t: TreeNode, group: number) => {
    if (isGroup(t)) t.children.forEach((c) => collect(c, group))
    else {
      order.push(t.file)
      topGroupOf.set(t.file, group)
    }
  }
  const groupIndex = new Map<TreeNode, number>()
  for (const child of tree.children) {
    if (isGroup(child)) groupIndex.set(child, groupIndex.size)
    collect(child, groupIndex.get(child) ?? -1)
  }
  const colour = (group: number) => (group < 0 ? null : HUES[group % HUES.length])
  const y = (file: string) => TOP + order.indexOf(file) * ROW

  const height = (t: TreeNode): number => (isGroup(t) ? 1 + Math.max(...t.children.map(height)) : 0)
  const width = LEAF + LEVEL * height(tree) + 110
  const bottom = TOP + (order.length - 1) * ROW
  const out: string[] = []

  // Imports: one arc per edge, from importer to imported, coloured when it stays inside one top-level group.
  for (const [src, dst] of graph.edges) {
    const [y1, y2] = [y(src), y(dst)]
    const d = 16 + 0.5 * Math.abs(y2 - y1)
    const inside = topGroupOf.get(src) === topGroupOf.get(dst) ? colour(topGroupOf.get(src)!) : null
    out.push(
      `  <path class="import${inside ? '' : ' across'}" d="M${ANCHOR - 6} ${y1} C${ANCHOR - 6 - d} ${y1} ${ANCHOR - 6 - d} ${y2} ${ANCHOR - 8} ${y2}"` +
        `${inside ? ` stroke="${inside}"` : ''} marker-end="url(#${inside ? `head-${HUES.indexOf(inside)}` : 'head'})"/>`,
    )
  }

  // Files: a dot and the path.
  for (const file of order) {
    const fill = colour(topGroupOf.get(file)!)
    out.push(`  <circle cx="${ANCHOR}" cy="${y(file)}" r="4"${fill ? ` fill="${fill}"` : ' class="ink"'}/>`)
    out.push(`  <text class="file" x="${ANCHOR + 12}" y="${y(file) + 4}">${esc(file)}</text>`)
  }

  // The Optimal Tree as an elbow dendrogram, root on the right. A top-level group and
  // everything under it share one colour; the root and files directly in it stay neutral.
  const stroke = (c: string | null) => (c ? ` stroke="${c}"` : '')
  const draw = (t: TreeNode, c: string | null): { x: number; y: number } => {
    if (!isGroup(t)) return { x: LEAF, y: y(t.file) }
    const kids = t.children.map((child) => {
      const childColour = t === tree ? colour(isGroup(child) ? groupIndex.get(child)! : -1) : c
      return { ...draw(child, childColour), c: childColour }
    })
    const x = LEAF + LEVEL * height(t)
    out.push(`  <path class="tree"${stroke(c)} d="M${x} ${kids[0].y} V${kids[kids.length - 1].y}"/>`)
    for (const k of kids) out.push(`  <path class="tree"${stroke(k.c)} d="M${k.x} ${k.y} H${x}"/>`)
    return { x, y: (kids[0].y + kids[kids.length - 1].y) / 2 }
  }
  const rootJoint = draw(tree, null)
  out.push(`  <path class="tree" d="M${rootJoint.x} ${rootJoint.y} H${rootJoint.x + 10}"/>`)
  out.push(`  <text class="label" x="${rootJoint.x + 16}" y="${rootJoint.y + 4}">All ${order.length} files</text>`)

  const total = bottom + 34
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" role="img" aria-label="A toy Dependency Graph of ${order.length} files next to its Optimal Tree at λ = ${lambda}">`,
    ...STYLE,
    '  <defs>',
    '    <marker id="head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z"/></marker>',
    ...HUES.map(
      (h, i) =>
        `    <marker id="head-${i}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="${h}"/></marker>`,
    ),
    '  </defs>',
    `  <text class="title" x="16" y="26">Dependency Graph</text>`,
    `  <text class="title" x="${LEAF}" y="26">Optimal Tree at λ = ${lambda}</text>`,
    ...out,
    '</svg>',
    '',
  ].join('\n')
}

const args = parseArgs(process.argv.slice(2))
if (!args) {
  console.error(usage)
  process.exit(2)
}
const graph: GraphFile = JSON.parse(readFileSync(join(root, 'examples', 'toy.graph.json'), 'utf8'))
const artifact = await buildArtifact(graph)
writeFileSync(args.out, renderDiagram(graph, treeAt(artifact, graph, STEP), lambdaOf(STEP)))
console.error(`wrote ${args.out}`)
