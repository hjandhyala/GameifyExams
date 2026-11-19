import {
  bigserial,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const trackId = pgEnum('track_id', ['mcat', 'lsat', 'boards', 'bar']);
export const engineId = pgEnum('engine_id', ['quartet', 'jargon', 'workup', 'gauntlet', 'classify']);
export const itemStatus = pgEnum('item_status', [
  'draft',
  'auto_rejected',
  'in_review',
  'changes_requested',
  'approved',
  'reserve',
  'scheduled',
  'published',
  'retired',
]);
export const puzzleStatus = pgEnum('puzzle_status', ['scheduled', 'live', 'voided']);
export const staffRole = pgEnum('staff_role', ['admin', 'editor', 'reviewer']);

const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const staffUsers = pgTable('staff_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: staffRole('role').notNull(),
  qualifications: text('qualifications').array().notNull().default([]),
  tracks: trackId('tracks').array().notNull().default([]),
  createdAt: ts('created_at'),
});

export const items = pgTable('items', {
  id: text('id').primaryKey(),
  track: trackId('track').notNull(),
  engine: engineId('engine').notNull(),
  gameId: text('game_id').notNull(),
  kind: text('kind').notNull(),
  status: itemStatus('status').notNull().default('draft'),
  difficulty: smallint('difficulty').notNull(),
  difficultyObserved: real('difficulty_observed'),
  blueprintCodes: text('blueprint_codes').array().notNull(),
  conceptIds: text('concept_ids').array().notNull().default([]),
  answerKey: text('answer_key'),
  /** Authored content (validated by the engine's authoredSchema). */
  content: jsonb('content').notNull(),
  sources: jsonb('sources').notNull().default([]),
  provenance: jsonb('provenance').notNull(),
  validation: jsonb('validation'),
  contentHash: text('content_hash').notNull().unique(),
  lastUsedOn: date('last_used_on'),
  timesUsed: integer('times_used').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
});

export const itemReviews = pgTable('item_reviews', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  itemId: text('item_id').notNull(),
  itemVersion: integer('item_version').notNull(),
  reviewerId: text('reviewer_id').notNull(),
  decision: text('decision').notNull(),
  checklist: jsonb('checklist').notNull(),
  notes: text('notes'),
  difficultyRating: smallint('difficulty_rating'),
  createdAt: ts('created_at'),
});

export const puzzles = pgTable(
  'puzzles',
  {
    id: text('id').primaryKey(),
    track: trackId('track').notNull(),
    gameId: text('game_id').notNull(),
    engine: engineId('engine').notNull(),
    date: date('date').notNull(),
    number: integer('number').notNull(),
    itemIds: text('item_ids').array().notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    status: puzzleStatus('status').notNull().default('scheduled'),
    difficulty: smallint('difficulty').notNull(),
    locked: boolean('locked').notNull().default(false),
    createdAt: ts('created_at'),
  },
  (t) => [unique('puzzles_slot').on(t.track, t.gameId, t.date)],
);

export const puzzleVersions = pgTable(
  'puzzle_versions',
  {
    puzzleId: text('puzzle_id').notNull(),
    version: integer('version').notNull(),
    public: jsonb('public').notNull(),
    secret: jsonb('secret').notNull(),
    voided: boolean('voided').notNull().default(false),
    reason: text('reason'),
    createdBy: text('created_by'),
    createdAt: ts('created_at'),
  },
  (t) => [primaryKey({ columns: [t.puzzleId, t.version] })],
);

export const results = pgTable(
  'results',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    puzzleId: text('puzzle_id').notNull(),
    version: integer('version').notNull(),
    deviceHash: bytea('device_hash').notNull(),
    passed: boolean('passed').notNull(),
    bucket: text('bucket').notNull(),
    outcome: jsonb('outcome').notNull(),
    transcript: jsonb('transcript'),
    durationMs: integer('duration_ms'),
    hardMode: boolean('hard_mode').notNull().default(false),
    timed: boolean('timed').notNull().default(false),
    tz: text('tz'),
    appVersion: text('app_version'),
    createdAt: ts('created_at'),
  },
  (t) => [unique('results_puzzle_device').on(t.puzzleId, t.deviceHash)],
);

export const resultAggregates = pgTable(
  'result_aggregates',
  { puzzleId: text('puzzle_id').notNull(), bucket: text('bucket').notNull(), count: integer('count').notNull().default(0) },
  (t) => [primaryKey({ columns: [t.puzzleId, t.bucket] })],
);

export const guessAggregates = pgTable(
  'guess_aggregates',
  { puzzleId: text('puzzle_id').notNull(), guessKey: text('guess_key').notNull(), count: integer('count').notNull().default(0) },
  (t) => [primaryKey({ columns: [t.puzzleId, t.guessKey] })],
);

export const itemResponses = pgTable(
  'item_responses',
  {
    itemId: text('item_id').notNull(),
    puzzleId: text('puzzle_id').notNull(),
    deviceHash: bytea('device_hash').notNull(),
    optionId: text('option_id'),
    correct: boolean('correct').notNull(),
    confidence: smallint('confidence'),
    ms: integer('ms'),
    totalCorrect: smallint('total_correct'),
    createdAt: ts('created_at'),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.puzzleId, t.deviceHash] })],
);

export const reports = pgTable('reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  puzzleId: text('puzzle_id').notNull(),
  itemId: text('item_id'),
  version: integer('version'),
  deviceHash: bytea('device_hash').notNull(),
  category: text('category').notNull(),
  message: text('message'),
  context: jsonb('context'),
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  resolvedBy: text('resolved_by'),
  createdAt: ts('created_at'),
});

export const transferCodes = pgTable('transfer_codes', {
  codeHash: bytea('code_hash').primaryKey(),
  deviceHash: bytea('device_hash').notNull(),
  didCiphertext: bytea('did_ciphertext').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
});

export const pipelineRuns = pgTable('pipeline_runs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  params: jsonb('params').notNull(),
  status: text('status').notNull(),
  stats: jsonb('stats'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }),
  startedAt: ts('started_at'),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  diff: jsonb('diff'),
  createdAt: ts('created_at'),
});

export const kb = pgSchema('kb');
export const kbSources = kb.table('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url'),
  license: text('license'),
  attribution: text('attribution'),
  termsUrl: text('terms_url'),
  verifiedOn: date('verified_on'),
  notes: text('notes'),
});
export const kbDocuments = kb.table('documents', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  track: trackId('track'),
  locator: text('locator').notNull(),
  url: text('url'),
  title: text('title'),
  text: text('text').notNull(),
  textHash: text('text_hash').notNull().unique(),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
  blueprintCodes: text('blueprint_codes').array().notNull().default([]),
});
export const kbFacts = kb.table(
  'facts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceId: text('source_id').notNull(),
    subject: text('subject').notNull(),
    predicate: text('predicate').notNull(),
    object: text('object').notNull(),
    qualifiers: jsonb('qualifiers'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
  },
  (t) => [unique('kb_facts_triple').on(t.sourceId, t.subject, t.predicate, t.object)],
);
