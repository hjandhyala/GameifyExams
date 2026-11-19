/** Ordered SQL migrations (kept in TS so they bundle into serverless functions). */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '0001_init',
    sql: `-- Examdle initial schema (LLD §10.2, §11.5)
CREATE TYPE track_id AS ENUM ('mcat','lsat','boards','bar');
CREATE TYPE engine_id AS ENUM ('quartet','jargon','workup','gauntlet','classify');
CREATE TYPE item_status AS ENUM ('draft','auto_rejected','in_review','changes_requested','approved','reserve','scheduled','published','retired');
CREATE TYPE puzzle_status AS ENUM ('scheduled','live','voided');
CREATE TYPE staff_role AS ENUM ('admin','editor','reviewer');

CREATE TABLE staff_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  role staff_role NOT NULL,
  qualifications text[] NOT NULL DEFAULT '{}',
  tracks track_id[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE items (
  id text PRIMARY KEY,
  track track_id NOT NULL,
  engine engine_id NOT NULL,
  game_id text NOT NULL,
  kind text NOT NULL,
  status item_status NOT NULL DEFAULT 'draft',
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  difficulty_observed real,
  blueprint_codes text[] NOT NULL,
  concept_ids text[] NOT NULL DEFAULT '{}',
  answer_key text,
  content jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  provenance jsonb NOT NULL,
  validation jsonb,
  content_hash text NOT NULL UNIQUE,
  last_used_on date,
  times_used int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_pick_idx ON items (track, game_id, status, difficulty);
CREATE INDEX items_blueprint_gin ON items USING gin (blueprint_codes);
CREATE INDEX items_concepts_gin ON items USING gin (concept_ids);
CREATE INDEX items_answer_idx ON items (track, game_id, answer_key);

CREATE TABLE item_reviews (
  id bigserial PRIMARY KEY,
  item_id text NOT NULL REFERENCES items(id),
  item_version int NOT NULL,
  reviewer_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','reject','request_changes')),
  checklist jsonb NOT NULL,
  notes text,
  difficulty_rating smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE puzzles (
  id text PRIMARY KEY,
  track track_id NOT NULL,
  game_id text NOT NULL,
  engine engine_id NOT NULL,
  date date NOT NULL,
  number int NOT NULL,
  item_ids text[] NOT NULL,
  current_version int NOT NULL DEFAULT 1,
  status puzzle_status NOT NULL DEFAULT 'scheduled',
  difficulty smallint NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT puzzles_slot UNIQUE (track, game_id, date)
);
CREATE INDEX puzzles_date_idx ON puzzles (date);

CREATE TABLE puzzle_versions (
  puzzle_id text NOT NULL REFERENCES puzzles(id),
  version int NOT NULL,
  public jsonb NOT NULL,
  secret jsonb NOT NULL,
  voided boolean NOT NULL DEFAULT false,
  reason text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_id, version)
);

CREATE TABLE results (
  id bigserial PRIMARY KEY,
  puzzle_id text NOT NULL REFERENCES puzzles(id),
  version int NOT NULL,
  device_hash bytea NOT NULL,
  passed boolean NOT NULL,
  bucket text NOT NULL,
  outcome jsonb NOT NULL,
  transcript jsonb,
  duration_ms int,
  hard_mode boolean NOT NULL DEFAULT false,
  timed boolean NOT NULL DEFAULT false,
  tz text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT results_puzzle_device UNIQUE (puzzle_id, device_hash)
);
CREATE INDEX results_device_idx ON results (device_hash, created_at DESC);

CREATE TABLE result_aggregates (
  puzzle_id text NOT NULL, bucket text NOT NULL, count int NOT NULL DEFAULT 0,
  PRIMARY KEY (puzzle_id, bucket)
);
CREATE TABLE guess_aggregates (
  puzzle_id text NOT NULL, guess_key text NOT NULL, count int NOT NULL DEFAULT 0,
  PRIMARY KEY (puzzle_id, guess_key)
);
CREATE TABLE item_responses (
  item_id text NOT NULL,
  puzzle_id text NOT NULL,
  device_hash bytea NOT NULL,
  option_id text,
  correct boolean NOT NULL,
  confidence smallint,
  ms int,
  total_correct smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, puzzle_id, device_hash)
);

CREATE TABLE reports (
  id bigserial PRIMARY KEY,
  puzzle_id text NOT NULL,
  item_id text,
  version int,
  device_hash bytea NOT NULL,
  category text NOT NULL,
  message text,
  context jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','actioned','dismissed')),
  resolution text,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_open_idx ON reports (status, created_at);

CREATE TABLE transfer_codes (
  code_hash bytea PRIMARY KEY,
  device_hash bytea NOT NULL,
  did_ciphertext bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz
);

CREATE TABLE pipeline_runs (
  id text PRIMARY KEY,
  kind text NOT NULL,
  params jsonb NOT NULL,
  status text NOT NULL,
  stats jsonb,
  cost_usd numeric(10,4),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE SCHEMA kb;
CREATE TABLE kb.sources (
  id text PRIMARY KEY, name text NOT NULL, url text, license text, attribution text,
  terms_url text, verified_on date, notes text
);
CREATE TABLE kb.documents (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  track track_id,
  locator text NOT NULL,
  url text,
  title text,
  text text NOT NULL,
  text_hash text NOT NULL UNIQUE,
  retrieved_at timestamptz,
  blueprint_codes text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX kb_documents_fts ON kb.documents USING gin (to_tsvector('english', text));
CREATE TABLE kb.facts (
  id bigserial PRIMARY KEY,
  source_id text NOT NULL,
  subject text NOT NULL,
  predicate text NOT NULL,
  object text NOT NULL,
  qualifiers jsonb,
  retrieved_at timestamptz,
  CONSTRAINT kb_facts_triple UNIQUE (source_id, subject, predicate, object)
);
`,
  },
];
