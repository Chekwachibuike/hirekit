// Compact microskill taxonomy — adapted from the method in
// github.com/HowProgrammingWorks/SelfAssessment (700+ skills, 7 levels),
// trimmed to ~110 skills across 7 domains and 4 levels to stay lightweight.
// Static data: no fetch, a few KB in the bundle, tree-shaken per page.

export type SkillLevel = 0 | 1 | 2 | 3 | 4

export const LEVELS: { value: SkillLevel; label: string; emoji: string; desc: string }[] = [
  { value: 1, label: 'Heard',  emoji: '👂', desc: 'Aware it exists' },
  { value: 2, label: 'Know',   emoji: '🎓', desc: 'Studied, not used in a real project' },
  { value: 3, label: 'Used',   emoji: '🖐️', desc: 'Applied in a real project' },
  { value: 4, label: 'Teach',  emoji: '🙋', desc: 'Can explain it to someone else' },
]

export interface SkillDomain {
  id: string
  name: string
  skills: { id: string; name: string }[]
}

// Skill ids are stable keys stored in the DB — never rename, only add.
export const SKILL_DOMAINS: SkillDomain[] = [
  {
    id: 'js', name: 'JavaScript & TypeScript',
    skills: [
      { id: 'js.types',        name: 'Primitive vs reference types' },
      { id: 'js.closures',     name: 'Closures & lexical scope' },
      { id: 'js.this',         name: 'this, call/apply/bind' },
      { id: 'js.proto',        name: 'Prototypes & inheritance' },
      { id: 'js.classes',      name: 'Classes, getters/setters, static' },
      { id: 'js.destructure',  name: 'Destructuring & spread/rest' },
      { id: 'js.iterators',    name: 'Iterators & generators' },
      { id: 'js.modules',      name: 'ES Modules vs CommonJS' },
      { id: 'js.errors',       name: 'Error handling & custom errors' },
      { id: 'js.regex',        name: 'Regular expressions' },
      { id: 'ts.basics',       name: 'TypeScript: interfaces & types' },
      { id: 'ts.generics',     name: 'TypeScript: generics' },
      { id: 'ts.narrowing',    name: 'TypeScript: narrowing & guards' },
      { id: 'ts.utility',      name: 'TypeScript: utility types (Pick, Omit…)' },
    ],
  },
  {
    id: 'async', name: 'Async & Networking',
    skills: [
      { id: 'async.eventloop',  name: 'Event loop, micro/macrotasks' },
      { id: 'async.promises',   name: 'Promises: chaining, all/race/allSettled' },
      { id: 'async.await',      name: 'async/await & error handling' },
      { id: 'async.callbacks',  name: 'Callbacks & callback hell' },
      { id: 'async.abort',      name: 'AbortController & cancellation' },
      { id: 'net.http',         name: 'HTTP: methods, status codes, headers' },
      { id: 'net.rest',         name: 'REST API design' },
      { id: 'net.fetch',        name: 'fetch API & interceptor patterns' },
      { id: 'net.ws',           name: 'WebSockets & real-time' },
      { id: 'net.cors',         name: 'CORS: how it works, preflight' },
      { id: 'net.auth',         name: 'Auth: JWT, sessions, cookies, OAuth' },
      { id: 'net.graphql',      name: 'GraphQL basics' },
    ],
  },
  {
    id: 'frontend', name: 'Frontend & React',
    skills: [
      { id: 'fe.dom',          name: 'DOM manipulation & events' },
      { id: 'fe.css',          name: 'CSS: flexbox, grid, specificity' },
      { id: 'fe.responsive',   name: 'Responsive design & media queries' },
      { id: 'fe.a11y',         name: 'Accessibility (ARIA, semantics)' },
      { id: 'react.jsx',       name: 'React: components & JSX' },
      { id: 'react.state',     name: 'React: useState/useEffect correctly' },
      { id: 'react.hooks',     name: 'React: custom hooks' },
      { id: 'react.context',   name: 'React: Context & prop drilling' },
      { id: 'react.perf',      name: 'React: memo, useMemo, useCallback' },
      { id: 'react.forms',     name: 'React: controlled forms & validation' },
      { id: 'next.approuter',  name: 'Next.js: App Router, layouts, pages' },
      { id: 'next.ssr',        name: 'Next.js: SSR vs SSG vs CSR' },
      { id: 'next.api',        name: 'Next.js: API routes & middleware' },
      { id: 'fe.statemgmt',    name: 'State management (SWR/Redux/Zustand)' },
      { id: 'fe.bundling',     name: 'Bundlers & code splitting' },
    ],
  },
  {
    id: 'backend', name: 'Backend & Node.js',
    skills: [
      { id: 'node.runtime',    name: 'Node.js runtime & globals' },
      { id: 'node.fs',         name: 'File system & path APIs' },
      { id: 'node.streams',    name: 'Streams & buffers' },
      { id: 'node.events',     name: 'EventEmitter pattern' },
      { id: 'node.express',    name: 'Express/framework routing & middleware' },
      { id: 'node.env',        name: 'Config & environment variables' },
      { id: 'be.validation',   name: 'Input validation & sanitization' },
      { id: 'be.security',     name: 'OWASP basics: XSS, CSRF, SQLi' },
      { id: 'be.uploads',      name: 'File uploads & processing' },
      { id: 'be.email',        name: 'Sending email (SMTP/API)' },
      { id: 'be.cron',         name: 'Scheduled jobs & queues' },
      { id: 'be.logging',      name: 'Logging & error monitoring' },
      { id: 'be.testing',      name: 'API testing (unit/integration)' },
    ],
  },
  {
    id: 'db', name: 'Databases',
    skills: [
      { id: 'db.sql',          name: 'SQL: SELECT, JOIN, GROUP BY' },
      { id: 'db.schema',       name: 'Schema design & normalization' },
      { id: 'db.indexes',      name: 'Indexes & query performance' },
      { id: 'db.transactions', name: 'Transactions & ACID' },
      { id: 'db.migrations',   name: 'Migrations & versioning' },
      { id: 'db.orm',          name: 'ORMs / query builders' },
      { id: 'db.nosql',        name: 'NoSQL: documents, key-value' },
      { id: 'db.rls',          name: 'Row-level security / multi-tenancy' },
      { id: 'db.cache',        name: 'Caching (Redis, in-memory)' },
      { id: 'db.pagination',   name: 'Pagination strategies' },
    ],
  },
  {
    id: 'cs', name: 'CS Fundamentals',
    skills: [
      { id: 'cs.bigo',         name: 'Big-O & complexity analysis' },
      { id: 'cs.arrays',       name: 'Arrays & strings algorithms' },
      { id: 'cs.hashmaps',     name: 'Hash maps & sets' },
      { id: 'cs.linkedlist',   name: 'Linked lists' },
      { id: 'cs.stackqueue',   name: 'Stacks & queues' },
      { id: 'cs.trees',        name: 'Trees & binary search trees' },
      { id: 'cs.graphs',       name: 'Graphs: BFS/DFS' },
      { id: 'cs.sorting',      name: 'Sorting algorithms' },
      { id: 'cs.recursion',    name: 'Recursion & backtracking' },
      { id: 'cs.dp',           name: 'Dynamic programming basics' },
      { id: 'cs.patterns',     name: 'Design patterns (factory, observer…)' },
      { id: 'cs.solid',        name: 'SOLID principles' },
    ],
  },
  {
    id: 'ops', name: 'DevOps & Tooling',
    skills: [
      { id: 'ops.git',         name: 'Git: branching, rebase, conflicts' },
      { id: 'ops.github',      name: 'GitHub flow: PRs, reviews, CI' },
      { id: 'ops.npm',         name: 'npm/package.json & semver' },
      { id: 'ops.linux',       name: 'Linux CLI basics' },
      { id: 'ops.docker',      name: 'Docker: images, containers, compose' },
      { id: 'ops.deploy',      name: 'Deployment (Vercel/VPS/cloud)' },
      { id: 'ops.ci',          name: 'CI/CD pipelines' },
      { id: 'ops.envs',        name: 'Environments: dev/staging/prod' },
      { id: 'ops.monitoring',  name: 'Monitoring & health checks' },
      { id: 'ops.dns',         name: 'DNS, domains, HTTPS/TLS' },
    ],
  },
]

// ── Role profiles ─────────────────────────────────────────────────
// Each maps skillId -> minimum level required (2=know, 3=used).
// Readiness = % of requirements met at or above the required level.
export interface RoleProfile {
  id: string
  name: string
  requirements: Record<string, SkillLevel>
}

export const ROLE_PROFILES: RoleProfile[] = [
  {
    id: 'frontend', name: 'Frontend Developer',
    requirements: {
      'js.types': 3, 'js.closures': 3, 'js.this': 2, 'js.destructure': 3, 'js.modules': 3,
      'ts.basics': 3, 'ts.generics': 2,
      'async.eventloop': 2, 'async.promises': 3, 'async.await': 3, 'net.http': 3, 'net.fetch': 3, 'net.cors': 2, 'net.auth': 2,
      'fe.dom': 3, 'fe.css': 3, 'fe.responsive': 3, 'fe.a11y': 2,
      'react.jsx': 3, 'react.state': 3, 'react.hooks': 3, 'react.context': 2, 'react.perf': 2, 'react.forms': 3,
      'next.approuter': 2, 'next.ssr': 2, 'fe.statemgmt': 2,
      'cs.bigo': 2, 'cs.arrays': 3, 'cs.hashmaps': 2,
      'ops.git': 3, 'ops.github': 2, 'ops.npm': 2,
    },
  },
  {
    id: 'backend', name: 'Backend Developer (Node.js)',
    requirements: {
      'js.types': 3, 'js.closures': 3, 'js.errors': 3, 'js.modules': 3,
      'ts.basics': 3, 'ts.generics': 2,
      'async.eventloop': 3, 'async.promises': 3, 'async.await': 3, 'async.callbacks': 2,
      'net.http': 3, 'net.rest': 3, 'net.cors': 2, 'net.auth': 3,
      'node.runtime': 3, 'node.fs': 3, 'node.streams': 2, 'node.events': 2, 'node.express': 3, 'node.env': 3,
      'be.validation': 3, 'be.security': 2, 'be.logging': 2, 'be.testing': 2,
      'db.sql': 3, 'db.schema': 3, 'db.indexes': 2, 'db.transactions': 2, 'db.migrations': 2, 'db.pagination': 2,
      'cs.bigo': 2, 'cs.arrays': 3, 'cs.hashmaps': 3, 'cs.patterns': 2,
      'ops.git': 3, 'ops.linux': 2, 'ops.deploy': 2, 'ops.envs': 2,
    },
  },
  {
    id: 'fullstack', name: 'Fullstack Developer',
    requirements: {
      'js.types': 3, 'js.closures': 3, 'js.this': 2, 'js.modules': 3, 'js.errors': 3,
      'ts.basics': 3,
      'async.eventloop': 2, 'async.promises': 3, 'async.await': 3,
      'net.http': 3, 'net.rest': 3, 'net.cors': 2, 'net.auth': 3,
      'fe.dom': 3, 'fe.css': 3, 'fe.responsive': 2,
      'react.jsx': 3, 'react.state': 3, 'react.hooks': 3, 'react.forms': 3,
      'next.approuter': 3, 'next.ssr': 2, 'next.api': 3, 'fe.statemgmt': 2,
      'node.runtime': 3, 'node.express': 2, 'node.env': 3,
      'be.validation': 3, 'be.security': 2,
      'db.sql': 3, 'db.schema': 3, 'db.migrations': 2, 'db.rls': 2,
      'cs.bigo': 2, 'cs.arrays': 3, 'cs.hashmaps': 2,
      'ops.git': 3, 'ops.github': 2, 'ops.deploy': 2,
    },
  },
]

export const ALL_SKILLS_COUNT = SKILL_DOMAINS.reduce((n, d) => n + d.skills.length, 0)

export function roleReadiness(
  role: RoleProfile,
  levels: Record<string, SkillLevel>,
): { percent: number; met: number; total: number; gaps: { id: string; name: string; have: SkillLevel; need: SkillLevel }[] } {
  const nameOf = new Map<string, string>()
  for (const d of SKILL_DOMAINS) for (const s of d.skills) nameOf.set(s.id, s.name)

  const entries = Object.entries(role.requirements)
  let met = 0
  const gaps: { id: string; name: string; have: SkillLevel; need: SkillLevel }[] = []
  for (const [id, need] of entries) {
    const have = levels[id] ?? 0
    if (have >= need) met++
    else gaps.push({ id, name: nameOf.get(id) ?? id, have: have as SkillLevel, need })
  }
  // Sort gaps: biggest deficit first
  gaps.sort((a, b) => (b.need - b.have) - (a.need - a.have))
  return { percent: Math.round((met / entries.length) * 100), met, total: entries.length, gaps }
}
