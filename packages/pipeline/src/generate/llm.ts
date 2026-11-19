import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

/** Pipeline LLM defaults (§12.5). The model id is pinned; change it deliberately with a golden-set run. */
export const MODEL = process.env.EXAMDLE_MODEL ?? 'claude-opus-5-5';
export const SECOND_SOLVER_MODEL = process.env.EXAMDLE_SOLVER_MODEL ?? 'claude-sonnet-5-5';

/** $ per million tokens (standard API); batch is 50% of these. */
const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costUsd(model: string, u: Usage, batch = false): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']!;
  const f = batch ? 0.5 : 1;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return f * ((u.input_tokens * p.in + cacheWrite * p.in * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.out) / 1_000_000);
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CallSpec<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
}

export type CallResult<T> =
  | { kind: 'ok'; data: T; usage: Usage; model: string }
  | { kind: 'refused'; details: unknown; usage?: Usage }
  | { kind: 'unparseable'; error: string; usage?: Usage };

/** Builds Messages API params: adaptive thinking, explicit effort, cached system prefix, structured output. */
export function buildParams<S extends z.ZodType>(spec: CallSpec<S>) {
  return {
    model: spec.model ?? MODEL,
    max_tokens: spec.maxTokens ?? 16000,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: spec.effort ?? ('high' as const), format: zodOutputFormat(spec.schema) },
    system: [{ type: 'text' as const, text: spec.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: spec.user }],
  };
}

/** Synchronous structured call (small runs, validators, refusal retries). */
export async function callStructured<S extends z.ZodType>(spec: CallSpec<S>, opts: { fallback?: boolean } = {}): Promise<CallResult<z.infer<S>>> {
  const params = buildParams(spec);
  try {
    const response = opts.fallback
      ? await anthropic().beta.messages.parse({
          ...(params as object),
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as never)
      : await anthropic().messages.parse(params as never);
    const r = response as unknown as {
      stop_reason: string;
      stop_details?: unknown;
      parsed_output: z.infer<S> | null;
      usage: Usage;
      model: string;
    };
    if (r.stop_reason === 'refusal') return { kind: 'refused', details: r.stop_details, usage: r.usage };
    if (!r.parsed_output) return { kind: 'unparseable', error: 'empty parsed_output', usage: r.usage };
    return { kind: 'ok', data: r.parsed_output, usage: r.usage, model: r.model ?? params.model };
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw e;
    return { kind: 'unparseable', error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- Message Batches (50% cost)
export interface BatchRequest {
  customId: string;
  spec: CallSpec<z.ZodType>;
}

export async function submitBatch(requests: BatchRequest[]): Promise<string> {
  const batch = await anthropic().messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: buildParams(r.spec) as never })),
  });
  return batch.id;
}

export async function waitForBatch(id: string, log: (m: string) => void = console.log, pollMs = 60_000): Promise<void> {
  for (;;) {
    const b = await anthropic().messages.batches.retrieve(id);
    if (b.processing_status === 'ended') return;
    log(`batch ${id}: ${b.processing_status} (processing ${b.request_counts.processing}, succeeded ${b.request_counts.succeeded})`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Streams results keyed by custom_id (results arrive in any order). */
export async function* batchResults(id: string): AsyncGenerator<{ customId: string; result: { kind: 'ok'; text: string; usage: Usage; model: string } | { kind: 'refused' | 'errored' | 'expired' | 'canceled'; detail?: unknown } }> {
  for await (const r of await anthropic().messages.batches.results(id)) {
    const res = r.result;
    if (res.type === 'succeeded') {
      const msg = res.message;
      if (msg.stop_reason === 'refusal') {
        yield { customId: r.custom_id, result: { kind: 'refused', detail: (msg as unknown as { stop_details?: unknown }).stop_details } };
        continue;
      }
      const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      yield { customId: r.custom_id, result: { kind: 'ok', text, usage: msg.usage as Usage, model: msg.model } };
    } else {
      yield { customId: r.custom_id, result: { kind: res.type, detail: res.type === 'errored' ? res.error : undefined } };
    }
  }
}
