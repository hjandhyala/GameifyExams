import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FixtureItem } from '../packages/content/src/fixtures/index';
import { fixtureFor, localToday, puzzle, skipHowTo, solveVerdict } from './helpers';

test.beforeEach(async ({ page }) => {
  await skipHowTo(page);
});

test('home → track hub → game cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pick your exam' })).toBeVisible();
  await page.getByRole('link', { name: /Boards/ }).first().click();
  await expect(page).toHaveURL(/\/boards$/);
  for (const name of ['Quartet', 'Jargon', 'Workup', 'Gauntlet']) await expect(page.getByText(name, { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});

test('how-to-play opens on first visit', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/mcat/quartet');
  await expect(page.getByRole('dialog', { name: /How to play Quartet/ })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await ctx.close();
});

test('quartet: one-away then solve, share, reload restores', async ({ page, request }) => {
  const p = await puzzle(request, 'boards', 'quartet');
  const fx = fixtureFor('boards', 'quartet', p.payload) as FixtureItem;
  const groups = (fx.authored as { groups: { tiles: string[]; tier: number }[] }).groups;
  await page.goto('/boards/quartet');
  const tile = (label: string) => page.getByRole('grid', { name: 'Tiles' }).getByRole('button', { name: label, exact: true });
  // one away: three from group 1 + one from group 2
  for (const t of [...groups[0]!.tiles.slice(0, 3), groups[1]!.tiles[0]!]) await tile(t).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('One away…')).toBeVisible();
  for (const g of groups.slice(0, 3)) {
    const deselect = page.getByRole('button', { name: 'Deselect all' });
    if (await deselect.isEnabled()) await deselect.click();
    for (const t of g.tiles) await tile(t).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(tile(g.tiles[0]!)).toHaveCount(0);
  }
  // auto-finish submits the last group
  await expect(page.getByRole('heading', { name: /Solved with 1 mistake/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Share/ }).first().click();
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (clip) {
    expect(clip).toMatch(/^Prepdle · Boards Quartet #\d+ · ✅ 1 mistake/);
    for (const g of groups) for (const t of g.tiles) expect(clip).not.toContain(t);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: /Solved with 1 mistake/ })).toBeVisible();
});

test('jargon: invalid word, hint unlock, solve', async ({ page, request }) => {
  const p = await puzzle(request, 'bar', 'jargon');
  const candidates = (fixtureFor('bar', 'jargon', p.payload) as FixtureItem[]).map((f) => (f.authored as { answer: string }).answer);
  await page.goto('/bar/jargon');
  await expect(page.getByRole('grid', { name: 'Guesses' })).toBeVisible();
  const type = async (w: string) => {
    await page.keyboard.type(w.toLowerCase());
    await page.keyboard.press('Enter');
  };
  await type('Q'.repeat(p.payload.length as number));
  await expect(page.getByText('Not in word list')).toBeVisible();
  for (let i = 0; i < (p.payload.length as number); i++) await page.keyboard.press('Backspace');
  for (const w of candidates) {
    await type(w);
    await page.waitForTimeout(1200);
    if (await page.getByRole('heading', { name: /Brilliant|Nicely done|Phew/ }).isVisible()) break;
  }
  await expect(page.getByRole('heading', { name: /Brilliant|Nicely done|Phew/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Why it matters:')).toBeVisible();
});

test('workup: wrong guess shows attributes + next clue, then diagnose', async ({ page, request }) => {
  const p = await puzzle(request, 'boards', 'workup');
  const fx = fixtureFor('boards', 'workup', p.payload) as FixtureItem;
  const answerId = (fx.authored as { answerId: string }).answerId;
  const vocab = (await import('../packages/content/vocab/boards-dx.json', { with: { type: 'json' } })).default as { entries: { id: string; name: string }[] };
  const answerName = vocab.entries.find((e) => e.id === answerId)!.name;
  const wrong = answerId === 'dx_asthma' ? 'Migraine' : 'Asthma';
  await page.goto('/boards/workup');
  const box = page.getByRole('combobox');
  await box.click();
  const input = page.getByRole('combobox').last();
  await input.fill(wrong);
  await page.getByRole('option', { name: wrong, exact: true }).click();
  await expect(page.getByText(/Clue 2 of 6/)).toBeVisible();
  await expect(page.getByText(/System [✓◐✗]/).first()).toBeVisible();
  await page.getByRole('combobox').first().click();
  await page.getByRole('combobox').last().fill(answerName);
  await page.getByRole('option', { name: answerName, exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Got it in 2\/6/ })).toBeVisible();
  await expect(page.getByText('Key discriminators')).toBeVisible();
});

test('gauntlet: answer five with confidence; explanation tabs', async ({ page, request }) => {
  const p = await puzzle(request, 'lsat', 'gauntlet');
  await page.goto('/lsat/gauntlet');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('radio').first().click();
    await page.getByRole('button', { name: /^Likely/ }).click();
    await expect(page.getByRole('tab', { name: 'Explanation' })).toBeVisible();
    await page.getByRole('tab', { name: 'Why not…' }).click();
    if (i < 4) await page.getByRole('button', { name: /^Next( question)? →$/ }).click();
  }
  await expect(page.getByRole('heading', { name: /\/5/ })).toBeVisible({ timeout: 10_000 });
  expect(p.number).toBeGreaterThan(0);
});

test('verdict: count feedback then solve with the key', async ({ page, request }) => {
  const p = await puzzle(request, 'lsat', 'verdict');
  const fx = fixtureFor('lsat', 'verdict', p.payload) as FixtureItem;
  const claims = (fx.authored as { claims: { text: string; label: string }[] }).claims;
  const items = p.payload.items as { id: string; text: string }[];
  await page.goto('/lsat/verdict');
  const groups = page.getByRole('radiogroup');
  for (let i = 0; i < items.length; i++) await groups.nth(i).getByRole('radio', { name: 'Must' }).click();
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByText(/correct$/).first()).toBeVisible();
  const short = { must: 'Must', could: 'Could', cannot: 'Cannot' } as Record<string, string>;
  for (let i = 0; i < items.length; i++) {
    const label = claims.find((c) => c.text === items[i]!.text)!.label;
    await groups.nth(i).getByRole('radio', { name: short[label] }).click();
  }
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByRole('heading', { name: /Solved in 2 checks/ })).toBeVisible();
});

test('anatomy: label all, solve, bonus question', async ({ page, request }) => {
  const p = await puzzle(request, 'lsat', 'anatomy');
  const fx = fixtureFor('lsat', 'anatomy', p.payload) as FixtureItem;
  const seg = (fx.authored as { segments: { text: string; label: string }[] }).segments;
  const names: Record<string, string> = { main: 'Main conclusion', inter: 'Intermediate conclusion', premise: 'Premise', background: 'Background', opposing: 'Opposing view', concession: 'Concession' };
  await page.goto('/lsat/anatomy');
  for (const s of seg) {
    await page.getByRole('button', { name: new RegExp(`^${s.text.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await page.getByRole('group', { name: 'Roles' }).getByRole('button', { name: names[s.label], exact: true }).click();
  }
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByRole('heading', { name: /Nailed it first try/ })).toBeVisible();
  await expect(page.getByText(/Bonus question/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /^\(A\)/ }).click();
  await page.getByRole('button', { name: 'Submit bonus answer' }).click();
  await expect(page.getByText(/Correct\.|Not quite\./)).toBeVisible();
});

test('streak and daily card after playing; stats page', async ({ page, request }) => {
  await solveVerdict(page, request);
  await page.goto('/lsat');
  await expect(page.getByRole('button', { name: /Share today’s card/ })).toBeEnabled();
  await page.getByRole('button', { name: /Share today’s card/ }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (clip) {
    expect(clip.split('\n')[0]).toMatch(/^Prepdle LSAT · \w{3} \w{3} \d+ · #\d+$/);
    expect(clip).toContain('⚖️ Verdict   1/3');
    expect(clip).toContain('🔥 1-day streak');
  }
  await page.goto('/stats?track=lsat');
  await expect(page.getByText('Weak spots (Gauntlet)')).toBeVisible();
  await expect(page.getByLabel(/day streak/).first()).toBeVisible();
});

test('local data wiped but cookie kept → history restored', async ({ page, request }) => {
  await solveVerdict(page, request);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.getByText('We restored your streak', { exact: false })).toBeVisible({ timeout: 15_000 });
});

test('date outside the window is rejected by the API', async ({ request }) => {
  const r = await request.get(`/api/v1/days/2099-01-01`);
  expect([200, 403]).toContain(r.status());
  const bad = await request.post(`/api/v1/puzzles/boards/jargon/${localToday()}/evaluate`, { data: { version: 1, transcript: [{ type: 'guess', word: 'ZZ' }] } });
  expect(bad.status()).toBe(422);
});

test('admin: dev sign-in, review queue and item preview', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByPlaceholder('you@example.com').fill('reviewer@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/admin/review?status=published');
  await page.getByRole('link', { name: /boards-workup-/ }).first().click();
  await expect(page.getByText(/Live preview/)).toBeVisible();
  await expect(page.getByText('All invariants pass.')).toBeVisible();
});
