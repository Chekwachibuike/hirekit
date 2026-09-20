// Compact microskill taxonomy — adapted from the method in
// github.com/HowProgrammingWorks/SelfAssessment (700+ skills, 7 levels),
// trimmed to 4 levels and grouped into domains to stay lightweight.
// Static data: no fetch, a few KB in the bundle, tree-shaken per page.
//
// Domains are grouped into TRACKS (web, AI engineering, embedded/PCB) further
// down. Ratings are stored in one flat map keyed by skill id, so a domain that
// several tracks share — CS fundamentals, databases, Git — is rated once and
// counts for all of them.

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

  // ── AI engineering ──────────────────────────────────────────────
  {
    id: 'py', name: 'Python for AI',
    skills: [
      { id: 'py.types',     name: 'Types, collections, comprehensions' },
      { id: 'py.functions', name: 'Functions, *args/**kwargs, decorators' },
      { id: 'py.oop',       name: 'Classes, dataclasses, protocols' },
      { id: 'py.typing',    name: 'Type hints & mypy' },
      { id: 'py.venv',      name: 'Virtual envs, pip/uv, pinning deps' },
      { id: 'py.numpy',     name: 'NumPy arrays & broadcasting' },
      { id: 'py.pandas',    name: 'pandas DataFrames, joins, groupby' },
      { id: 'py.async',     name: 'asyncio & concurrency' },
      { id: 'py.testing',   name: 'pytest & fixtures' },
      { id: 'py.notebooks', name: 'Notebook workflow & reproducibility' },
    ],
  },
  {
    id: 'ml', name: 'Machine Learning Foundations',
    skills: [
      { id: 'ml.supervised', name: 'Supervised vs unsupervised learning' },
      { id: 'ml.split',      name: 'Train/validation/test splits & leakage' },
      { id: 'ml.overfit',    name: 'Overfitting & the bias–variance tradeoff' },
      { id: 'ml.regularise', name: 'Regularisation (L1/L2, dropout)' },
      { id: 'ml.metrics',    name: 'Metrics: precision, recall, F1, ROC-AUC' },
      { id: 'ml.crossval',   name: 'Cross-validation' },
      { id: 'ml.features',   name: 'Feature engineering & scaling' },
      { id: 'ml.imbalance',  name: 'Class imbalance handling' },
      { id: 'ml.linear',     name: 'Linear & logistic regression' },
      { id: 'ml.trees',      name: 'Trees, random forests, gradient boosting' },
      { id: 'ml.cluster',    name: 'Clustering & dimensionality reduction' },
    ],
  },
  {
    id: 'dl', name: 'Deep Learning',
    skills: [
      { id: 'dl.tensors',     name: 'Tensors, shapes & broadcasting' },
      { id: 'dl.autograd',    name: 'Autograd & backpropagation' },
      { id: 'dl.optim',       name: 'Optimisers & LR schedules' },
      { id: 'dl.loss',        name: 'Loss functions & when to use which' },
      { id: 'dl.torch',       name: 'PyTorch training loops' },
      { id: 'dl.cnn',         name: 'CNNs & computer vision' },
      { id: 'dl.seq',         name: 'RNNs/LSTMs & sequence models' },
      { id: 'dl.transformer', name: 'Transformers & self-attention' },
      { id: 'dl.pretrain',    name: 'Pretraining vs fine-tuning' },
      { id: 'dl.peft',        name: 'LoRA / PEFT fine-tuning' },
      { id: 'dl.gpu',         name: 'GPU memory, batching, mixed precision' },
    ],
  },
  {
    id: 'llm', name: 'LLM Engineering',
    skills: [
      { id: 'llm.tokens',     name: 'Tokenisation & context windows' },
      { id: 'llm.prompt',     name: 'Prompt design & few-shot examples' },
      { id: 'llm.structured', name: 'Structured output & JSON schemas' },
      { id: 'llm.embed',      name: 'Embeddings & semantic similarity' },
      { id: 'llm.vector',     name: 'Vector databases & indexing' },
      { id: 'llm.rag',        name: 'RAG: chunking, retrieval, reranking' },
      { id: 'llm.tools',      name: 'Tool use / function calling' },
      { id: 'llm.agents',     name: 'Agent loops & orchestration' },
      { id: 'llm.eval',       name: 'Evals & regression testing' },
      { id: 'llm.guard',      name: 'Guardrails, safety & prompt injection' },
      { id: 'llm.cost',       name: 'Cost, latency & caching' },
      { id: 'llm.choose',     name: 'Choosing prompt vs RAG vs fine-tune' },
    ],
  },
  {
    id: 'mlops', name: 'MLOps & Serving',
    skills: [
      { id: 'mlops.track',    name: 'Experiment tracking' },
      { id: 'mlops.registry', name: 'Model registry & versioning' },
      { id: 'mlops.serve',    name: 'Model serving & inference APIs' },
      { id: 'mlops.docker',   name: 'Containerising models' },
      { id: 'mlops.quant',    name: 'Quantisation & distillation' },
      { id: 'mlops.scale',    name: 'Batch vs real-time inference' },
      { id: 'mlops.monitor',  name: 'Monitoring & drift detection' },
      { id: 'mlops.pipeline', name: 'Data pipelines & feature stores' },
    ],
  },

  // ── Embedded systems & PCB ──────────────────────────────────────
  {
    id: 'ec', name: 'C/C++ for Embedded',
    skills: [
      { id: 'ec.pointers', name: 'Pointers & memory layout' },
      { id: 'ec.memory',   name: 'Stack vs heap, static allocation' },
      { id: 'ec.bits',     name: 'Bit manipulation & masks' },
      { id: 'ec.volatile', name: 'volatile, const & memory-mapped I/O' },
      { id: 'ec.structs',  name: 'Structs, unions & packing' },
      { id: 'ec.stdint',   name: 'Fixed-width types & endianness' },
      { id: 'ec.linker',   name: 'Linker scripts & memory sections' },
      { id: 'ec.build',    name: 'Makefiles & cross-compilation toolchains' },
      { id: 'ec.debug',    name: 'Debugging over GDB / JTAG / SWD' },
    ],
  },
  {
    id: 'mcu', name: 'Microcontrollers',
    skills: [
      { id: 'mcu.gpio',      name: 'GPIO configuration & pin muxing' },
      { id: 'mcu.interrupt', name: 'Interrupts & ISR design' },
      { id: 'mcu.timers',    name: 'Timers, counters & PWM' },
      { id: 'mcu.adc',       name: 'ADC/DAC & sampling' },
      { id: 'mcu.uart',      name: 'UART & serial protocols' },
      { id: 'mcu.i2c',       name: 'I2C' },
      { id: 'mcu.spi',       name: 'SPI' },
      { id: 'mcu.dma',       name: 'DMA transfers' },
      { id: 'mcu.clock',     name: 'Clock trees & configuration' },
      { id: 'mcu.datasheet', name: 'Reading datasheets & register maps' },
      { id: 'mcu.power',     name: 'Low-power modes & sleep' },
    ],
  },
  {
    id: 'rtos', name: 'RTOS & Firmware',
    skills: [
      { id: 'rtos.tasks',        name: 'Tasks & scheduling' },
      { id: 'rtos.sync',         name: 'Semaphores, mutexes, priority inversion' },
      { id: 'rtos.queue',        name: 'Queues & message passing' },
      { id: 'rtos.isr',          name: 'ISR-safe APIs & deferred work' },
      { id: 'rtos.timing',       name: 'Real-time constraints & jitter' },
      { id: 'rtos.statemachine', name: 'State machines & event-driven firmware' },
      { id: 'rtos.watchdog',     name: 'Watchdogs & fault recovery' },
      { id: 'rtos.ota',          name: 'Bootloaders & OTA updates' },
    ],
  },
  {
    id: 'elec', name: 'Electronics Fundamentals',
    skills: [
      { id: 'el.ohm',        name: "Ohm's law, power & budgets" },
      { id: 'el.divider',    name: 'Voltage dividers & pull-ups' },
      { id: 'el.rc',         name: 'RC filters & time constants' },
      { id: 'el.diode',      name: 'Diodes & input protection' },
      { id: 'el.transistor', name: 'Transistors & MOSFET switching' },
      { id: 'el.opamp',      name: 'Op-amps & signal conditioning' },
      { id: 'el.power',      name: 'Regulators: LDO vs switching' },
      { id: 'el.decouple',   name: 'Decoupling & bypass capacitors' },
      { id: 'el.scope',      name: 'Oscilloscope & multimeter technique' },
      { id: 'el.noise',      name: 'Noise, grounding & EMI basics' },
    ],
  },
  {
    id: 'pcb', name: 'PCB Design',
    skills: [
      { id: 'pcb.schematic', name: 'Schematic capture & netlists' },
      { id: 'pcb.symbols',   name: 'Symbols & footprint creation' },
      { id: 'pcb.tools',     name: 'KiCad / Altium workflow' },
      { id: 'pcb.stackup',   name: 'Layer stackup & planes' },
      { id: 'pcb.route',     name: 'Routing, trace width & current' },
      { id: 'pcb.ground',    name: 'Ground planes & return paths' },
      { id: 'pcb.impedance', name: 'Controlled impedance & high-speed' },
      { id: 'pcb.drc',       name: 'DRC/ERC & design rules' },
      { id: 'pcb.gerber',    name: 'Gerbers, BOM & fab output' },
      { id: 'pcb.dfm',       name: 'DFM/DFA & assembly constraints' },
      { id: 'pcb.solder',    name: 'Soldering, rework & board bring-up' },
    ],
  },
]

// ── Tracks ────────────────────────────────────────────────────────
// A track is a VIEW over the domains, not a separate store. Ratings are keyed
// by skill id in one flat map, so a skill shared between tracks — CS
// fundamentals, databases, Git — is rated once and counts everywhere. Switching
// track therefore loses nothing, and needs no migration to add another one.
export interface Track {
  id: string
  name: string
  blurb: string
  /** Domain ids, in display order. */
  domains: string[]
}

export const TRACKS: Track[] = [
  {
    id: 'web', name: 'Web / Fullstack',
    blurb: 'JavaScript, React, Node and the databases behind them',
    domains: ['js', 'async', 'frontend', 'backend', 'db', 'cs', 'ops'],
  },
  {
    id: 'ai', name: 'AI Engineering',
    blurb: 'Python, ML foundations, deep learning and shipping LLM systems',
    domains: ['py', 'ml', 'dl', 'llm', 'mlops', 'db', 'cs', 'ops'],
  },
  {
    id: 'embedded', name: 'Embedded & PCB',
    blurb: 'Firmware, microcontrollers, electronics and board design',
    domains: ['ec', 'mcu', 'rtos', 'elec', 'pcb', 'cs'],
  },
]

// ── Role profiles ─────────────────────────────────────────────────
// Each maps skillId -> minimum level required (2=know, 3=used).
// Readiness = % of requirements met at or above the required level.
export interface RoleProfile {
  id: string
  name: string
  /** Which track this role belongs to — see TRACKS. */
  track: string
  requirements: Record<string, SkillLevel>
}

export const ROLE_PROFILES: RoleProfile[] = [
  {
    id: 'frontend', name: 'Frontend Developer', track: 'web',
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
    id: 'backend', name: 'Backend Developer (Node.js)', track: 'web',
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
    id: 'fullstack', name: 'Fullstack Developer', track: 'web',
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

  {
    id: 'ai-llm', name: 'AI / LLM Engineer', track: 'ai',
    requirements: {
      'py.types': 3, 'py.functions': 3, 'py.typing': 2, 'py.venv': 3, 'py.async': 2, 'py.testing': 2,
      'ml.supervised': 2, 'ml.metrics': 2, 'ml.split': 2,
      'dl.transformer': 2, 'dl.pretrain': 2,
      'llm.tokens': 3, 'llm.prompt': 3, 'llm.structured': 3, 'llm.embed': 3,
      'llm.vector': 3, 'llm.rag': 3, 'llm.tools': 3, 'llm.agents': 2,
      'llm.eval': 3, 'llm.guard': 3, 'llm.cost': 3, 'llm.choose': 3,
      'mlops.serve': 2, 'mlops.docker': 2, 'mlops.monitor': 2,
      'net.rest': 3, 'net.auth': 2, 'db.sql': 2, 'db.cache': 2,
      'cs.bigo': 2, 'cs.hashmaps': 2,
      'ops.git': 3, 'ops.deploy': 2, 'ops.envs': 2,
    },
  },
  {
    id: 'ai-ml', name: 'Machine Learning Engineer', track: 'ai',
    requirements: {
      'py.types': 3, 'py.functions': 3, 'py.typing': 2, 'py.venv': 3,
      'py.numpy': 3, 'py.pandas': 3, 'py.testing': 2, 'py.notebooks': 3,
      'ml.supervised': 3, 'ml.split': 3, 'ml.overfit': 3, 'ml.regularise': 3,
      'ml.metrics': 3, 'ml.crossval': 3, 'ml.features': 3, 'ml.imbalance': 2,
      'ml.linear': 3, 'ml.trees': 3, 'ml.cluster': 2,
      'dl.tensors': 3, 'dl.autograd': 2, 'dl.optim': 2, 'dl.loss': 3,
      'dl.torch': 3, 'dl.gpu': 2,
      'mlops.track': 3, 'mlops.registry': 2, 'mlops.serve': 3,
      'mlops.docker': 2, 'mlops.monitor': 3, 'mlops.pipeline': 2,
      'db.sql': 3, 'cs.bigo': 2,
      'ops.git': 3, 'ops.linux': 2, 'ops.deploy': 2,
    },
  },
  {
    id: 'emb-firmware', name: 'Embedded Firmware Engineer', track: 'embedded',
    requirements: {
      'ec.pointers': 3, 'ec.memory': 3, 'ec.bits': 3, 'ec.volatile': 3,
      'ec.structs': 3, 'ec.stdint': 3, 'ec.linker': 2, 'ec.build': 3, 'ec.debug': 3,
      'mcu.gpio': 3, 'mcu.interrupt': 3, 'mcu.timers': 3, 'mcu.adc': 3,
      'mcu.uart': 3, 'mcu.i2c': 3, 'mcu.spi': 3, 'mcu.dma': 2,
      'mcu.clock': 2, 'mcu.datasheet': 3, 'mcu.power': 2,
      'rtos.tasks': 3, 'rtos.sync': 3, 'rtos.queue': 2, 'rtos.isr': 3,
      'rtos.timing': 3, 'rtos.statemachine': 3, 'rtos.watchdog': 2, 'rtos.ota': 2,
      'el.ohm': 2, 'el.divider': 2, 'el.scope': 3,
      'cs.bigo': 2, 'cs.stackqueue': 2,
    },
  },
  {
    id: 'emb-hardware', name: 'Hardware / PCB Designer', track: 'embedded',
    requirements: {
      'el.ohm': 3, 'el.divider': 3, 'el.rc': 3, 'el.diode': 3,
      'el.transistor': 3, 'el.opamp': 2, 'el.power': 3,
      'el.decouple': 3, 'el.scope': 3, 'el.noise': 2,
      'pcb.schematic': 3, 'pcb.symbols': 3, 'pcb.tools': 3, 'pcb.stackup': 2,
      'pcb.route': 3, 'pcb.ground': 3, 'pcb.impedance': 2, 'pcb.drc': 3,
      'pcb.gerber': 3, 'pcb.dfm': 2, 'pcb.solder': 3,
      'mcu.datasheet': 3, 'mcu.gpio': 2, 'mcu.i2c': 2, 'mcu.spi': 2, 'mcu.power': 2,
      'ec.stdint': 2,
    },
  },
]

export const ALL_SKILLS_COUNT = SKILL_DOMAINS.reduce((n, d) => n + d.skills.length, 0)

// ── Track helpers ─────────────────────────────────────────────────
export function domainsForTrack(trackId: string): SkillDomain[] {
  const track = TRACKS.find(t => t.id === trackId) ?? TRACKS[0]
  // Ordered by the track, not by SKILL_DOMAINS, so each track reads in the
  // sequence that makes sense for it.
  return track.domains
    .map(id => SKILL_DOMAINS.find(d => d.id === id))
    .filter((d): d is SkillDomain => !!d)
}

export function rolesForTrack(trackId: string): RoleProfile[] {
  return ROLE_PROFILES.filter(r => r.track === trackId)
}

export function trackSkillCount(trackId: string): number {
  return domainsForTrack(trackId).reduce((n, d) => n + d.skills.length, 0)
}

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
