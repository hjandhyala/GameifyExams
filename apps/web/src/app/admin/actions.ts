'use server';
import { addDays, engineFor, parsePuzzleId, utcISO, type GameId, type TrackId } from '@prepdle/core';
import { vocabMap, dictionary } from '@prepdle/content';
import { assertNoLeak, contentHash, schedule } from '@prepdle/pipeline/publish';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signIn, signOut } from '@/auth';
import { requireStaff } from '@/server/admin';
import { getRepo } from '@/server/db';
import { LAUNCH_DATE } from '@/server/env';
import { invalidateCached } from '@/server/puzzles';

const CHECKLIST = ['accurate', 'single_answer', 'blueprint_fit', 'difficulty', 'explanations', 'fair_language', 'original'] as const;

export async function devLogin(formData: FormData) {
  await signIn('dev', { email: String(formData.get('email') ?? ''), redirectTo: '/admin' });
}
export async function oauthLogin(provider: string) {
  await signIn(provider, { redirectTo: '/admin' });
}
export async function logout() {
  await signOut({ redirectTo: '/admin/login' });
}

function ctxFor(track: TrackId, gameId: GameId) {
  const engine = engineFor(gameId);
  const g = engine.id === 'workup' ? { vocab: vocabMap(track === 'boards' ? 'boards-dx' : track === 'mcat' ? 'mcat-entities' : 'bar-doctrines') } : {};
  return { ...g, ...(engine.id === 'jargon' ? { dictionary: dictionary(track) } : {}) };
}

export async function reviewItem(formData: FormData) {
  const itemId = String(formData.get('itemId'));
  const repo = await getRepo();
  const item = await repo.getItem(itemId);
  if (!item) throw new Error('Item not found');
  const user = await requireStaff('reviewer', item.track as TrackId);
  const decision = z.enum(['approve', 'reject', 'request_changes']).parse(formData.get('decision'));
  const checklist = Object.fromEntries(CHECKLIST.map((k) => [k, formData.get(`check_${k}`) === 'on']));
  if (decision === 'approve' && !CHECKLIST.every((k) => checklist[k])) throw new Error('All checklist items must be ticked to approve');
  const rating = Number(formData.get('difficulty') ?? item.difficulty);
  const notes = String(formData.get('notes') ?? '') || null;
  const edited = String(formData.get('content') ?? '').trim();
  const patch: Record<string, unknown> = {};
  if (edited && edited !== JSON.stringify(item.content, null, 2)) {
    const engine = engineFor(item.gameId as GameId);
    const parsed = engine.authoredSchema.parse(JSON.parse(edited));
    const errors = engine.checkInvariants(parsed, ctxFor(item.track as TrackId, item.gameId as GameId)).filter((i) => i.level === 'error');
    if (errors.length) throw new Error(`Invariants failed: ${errors.map((e) => e.message).join('; ')}`);
    Object.assign(patch, { content: parsed, contentHash: contentHash(parsed), version: item.version + 1 });
  }
  const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'retired' : 'changes_requested';
  await repo.updateItem(itemId, { ...patch, status, difficulty: Math.min(5, Math.max(1, rating)) }, user.email, `review:${decision}`);
  await repo.insertReview({ itemId, itemVersion: (patch.version as number | undefined) ?? item.version, reviewerId: user.staffId, decision, checklist, notes, difficultyRating: rating });
  revalidatePath('/admin/review');
  redirect('/admin/review');
}

export async function patchPuzzle(formData: FormData) {
  const puzzleId = String(formData.get('puzzleId'));
  const slot = parsePuzzleId(puzzleId);
  if (!slot) throw new Error('Bad puzzle id');
  const user = await requireStaff('editor', slot.track);
  const repo = await getRepo();
  const engine = engineFor(slot.gameId);
  const pub = engine.publicSchema.parse(JSON.parse(String(formData.get('public'))));
  const sec = engine.secretSchema.parse(JSON.parse(String(formData.get('secret'))));
  assertNoLeak(engine.secretStrings(sec as never), pub, puzzleId);
  const voidPrevious = formData.get('voidPrevious') === 'on';
  if (voidPrevious && user.role === 'reviewer') throw new Error('Editors only');
  await repo.addVersion(puzzleId, pub, sec, { voidPrevious, reason: String(formData.get('reason') ?? 'edit'), actor: user.email });
  invalidateCached(puzzleId);
  revalidatePath(`/admin/puzzles/${puzzleId}`);
}

export async function pullPuzzle(formData: FormData) {
  const puzzleId = String(formData.get('puzzleId'));
  const slot = parsePuzzleId(puzzleId);
  if (!slot) throw new Error('Bad puzzle id');
  const user = await requireStaff('admin');
  await (await getRepo()).pullPuzzle(puzzleId, user.email, String(formData.get('reason') ?? 'pulled'));
  invalidateCached(puzzleId);
  revalidatePath(`/admin/puzzles/${puzzleId}`);
}

export async function refillSlot(formData: FormData) {
  const puzzleId = String(formData.get('puzzleId'));
  const slot = parsePuzzleId(puzzleId);
  if (!slot) throw new Error('Bad puzzle id');
  const user = await requireStaff('editor', slot.track);
  const repo = await getRepo();
  const p = await repo.getPuzzleById(puzzleId);
  if (!p) throw new Error('Not found');
  if (p.locked && user.role !== 'admin') throw new Error('Locked slot: admin swap required');
  const agg = await repo.aggregates(puzzleId);
  if (Object.keys(agg).length) throw new Error('Puzzle already has results; use patch/void instead');
  await repo.deletePuzzle(puzzleId);
  // Return its items to the bank so they can be scheduled again.
  for (const id of p.itemIds) await repo.updateItem(id, { status: 'approved', timesUsed: 0, lastUsedOn: null }, user.email, 'unschedule');
  await schedule(repo, { from: slot.date, days: 1, launchDate: LAUNCH_DATE, slots: [{ track: slot.track, gameId: slot.gameId }] });
  await repo.audit(user.email, 'swap', 'puzzle', puzzleId, {});
  invalidateCached(puzzleId);
  revalidatePath('/admin/schedule');
}

export async function runScheduler(formData: FormData) {
  const user = await requireStaff('editor');
  const from = String(formData.get('from') || utcISO(Date.now()));
  const days = Math.min(60, Math.max(1, Number(formData.get('days') ?? 28)));
  const r = await schedule(await getRepo(), { from, days, launchDate: LAUNCH_DATE });
  await (await getRepo()).audit(user.email, 'schedule', 'range', `${from}+${days}`, { filled: r.filled.length, unfilled: r.unfilled.length });
  revalidatePath('/admin/schedule');
  revalidatePath('/admin');
}

export async function updateReport(formData: FormData) {
  const user = await requireStaff('editor');
  await (await getRepo()).updateReport(Number(formData.get('id')), z.enum(['open', 'triaged', 'actioned', 'dismissed']).parse(formData.get('status')), String(formData.get('resolution') ?? '') || null, user.email);
  revalidatePath('/admin/reports');
}

export async function upsertStaff(formData: FormData) {
  await requireStaff('admin');
  const email = z.string().email().parse(String(formData.get('email')).trim().toLowerCase());
  const role = z.enum(['admin', 'editor', 'reviewer']).parse(formData.get('role'));
  const tracks = (['mcat', 'lsat', 'boards', 'bar'] as const).filter((t) => formData.get(`track_${t}`) === 'on');
  const qualifications = String(formData.get('qualifications') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  await (await getRepo()).upsertStaff({ id: email, email, name: String(formData.get('name') ?? '') || email.split('@')[0], role, tracks: [...tracks], qualifications });
  revalidatePath('/admin/staff');
}

export async function lockUpcoming() {
  await requireStaff('editor');
  await (await getRepo()).lockWindow(addDays(utcISO(Date.now()), 7));
  revalidatePath('/admin/schedule');
}
