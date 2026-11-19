import type { APIRequestContext, Page } from '@playwright/test';
import { FIXTURES, type FixtureItem } from '../packages/content/src/fixtures/index';

export const localToday = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function puzzle(request: APIRequestContext, track: string, gameId: string, date = localToday()) {
  const r = await request.get(`/api/v1/puzzles/${track}/${gameId}/${date}`);
  if (!r.ok()) throw new Error(`puzzle ${track}/${gameId} ${r.status()} ${await r.text()}`);
  return (await r.json()) as { puzzleId: string; payload: Record<string, unknown>; number: number };
}

/** Identifies which fixture was scheduled for a puzzle from its public payload. */
export function fixtureFor(track: string, gameId: string, payload: Record<string, unknown>): FixtureItem | FixtureItem[] {
  const pool = FIXTURES.filter((f) => f.track === track && f.gameId === gameId);
  if (gameId === 'quartet') {
    const labels = new Set((payload.tiles as { label: string }[]).map((t) => t.label));
    return pool.find((f) => (f.authored as { groups: { tiles: string[] }[] }).groups.every((g) => g.tiles.every((t) => labels.has(t))))!;
  }
  if (gameId === 'workup') return pool.find((f) => (f.authored as { clues: { text: string }[] }).clues[0]!.text === (payload.firstClue as { text: string }).text)!;
  if (gameId === 'verdict') return pool.find((f) => JSON.stringify((f.authored as { premises: string[] }).premises) === JSON.stringify(payload.premises))!;
  if (gameId === 'anatomy') {
    const texts = (payload.items as { text: string }[]).map((i) => i.text);
    return pool.find((f) => (f.authored as { segments: { text: string }[] }).segments[0]!.text === texts[0])!;
  }
  if (gameId === 'jargon') return pool.filter((f) => (f.authored as { answer: string }).answer.length === payload.length);
  return pool;
}

/** Marks every How-to-Play as seen so it doesn't auto-open (except where a test wants it). */
export async function skipHowTo(page: Page) {
  await page.addInitScript(() => {
    const keys = ['mcat', 'lsat', 'boards', 'bar'].flatMap((t) => ['quartet', 'jargon', 'workup', 'gauntlet', 'anatomy', 'verdict'].map((g) => `${t}:${g}`));
    const s = JSON.parse(localStorage.getItem('pd:v1:settings') ?? '{}');
    if (!s.__e2e) {
      s.seenHowTo = Object.fromEntries(keys.map((k) => [k, true]));
      s.__e2e = true;
      localStorage.setItem('pd:v1:settings', JSON.stringify(s));
    }
  });
}

/** Solves today's LSAT Verdict with the fixture key (fast way to create a completed game). */
export async function solveVerdict(page: Page, request: APIRequestContext) {
  const p = await puzzle(request, 'lsat', 'verdict');
  const fx = fixtureFor('lsat', 'verdict', p.payload) as FixtureItem;
  const claims = (fx.authored as { claims: { text: string; label: string }[] }).claims;
  const items = p.payload.items as { id: string; text: string }[];
  await page.goto('/lsat/verdict');
  const short: Record<string, string> = { must: 'Must', could: 'Could', cannot: 'Cannot' };
  const groups = page.getByRole('radiogroup');
  await groups.first().waitFor();
  for (let i = 0; i < items.length; i++) await groups.nth(i).getByRole('radio', { name: short[claims.find((c) => c.text === items[i]!.text)!.label] }).click();
  await page.getByRole('button', { name: /Check/ }).click();
  await page.getByRole('heading', { name: /Nailed it first try/ }).waitFor();
  await page.waitForFunction(() => (localStorage.getItem('pd:v1:outbox') ?? '[]') === '[]', undefined, { timeout: 15_000 });
}
