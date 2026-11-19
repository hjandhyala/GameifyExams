import { engineFor, parsePuzzleId } from '@prepdle/core';
import { notFound } from 'next/navigation';
import { getRepo } from '@/server/db';
import { patchPuzzle, pullPuzzle } from '../../../actions';

export default async function PuzzleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slot = parsePuzzleId(id);
  if (!slot) notFound();
  const repo = await getRepo();
  const p = await repo.getPuzzleById(id);
  if (!p) notFound();
  const [versions, agg, reports, top] = await Promise.all([repo.listVersions(id), repo.aggregates(id), repo.listReports(undefined, 500), repo.topGuesses(id, 10)]);
  const cur = versions.find((v) => v.version === p.currentVersion)!;
  const engine = engineFor(slot.gameId);
  const players = Object.values(agg).reduce((a, b) => a + b, 0);
  const mine = reports.filter((r) => r.puzzleId === id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">{id}</h1>
        <p className="text-sm text-muted">
          #{p.number} · D{p.difficulty} · status {p.status} · current v{p.currentVersion} · {p.locked ? 'locked' : 'unlocked'} · items {p.itemIds.join(', ')}
        </p>
      </div>
      <section>
        <h2 className="font-bold">Live stats ({players} players)</h2>
        <p className="text-sm">
          {engine.bucketOrder.map((b) => `${b}: ${agg[b] ?? 0}`).join(' · ')}
        </p>
        {top.length > 0 && <p className="mt-1 text-sm text-muted">Top guesses: {top.map((t) => `${t.guessKey} (${t.count})`).join(', ')}</p>}
      </section>
      <section>
        <h2 className="font-bold">Versions</h2>
        <ul className="text-sm">
          {versions.map((v) => (
            <li key={v.version}>
              v{v.version} · {v.voided ? 'VOIDED' : 'active'} · {v.reason ?? ''} · {v.createdBy ?? ''} · {new Date(v.createdAt).toISOString()}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-bold">Reports ({mine.length})</h2>
        <ul className="text-sm">
          {mine.map((r) => (
            <li key={r.id}>
              [{r.status}] {r.category}: {r.message ?? ''}
            </li>
          ))}
        </ul>
      </section>
      <form action={patchPuzzle} className="space-y-2 rounded-2xl border border-border p-4">
        <h2 className="font-bold">Patch (creates v{p.currentVersion + 1})</h2>
        <input type="hidden" name="puzzleId" value={id} />
        <label className="block text-sm font-semibold">
          Public payload
          <textarea name="public" rows={10} defaultValue={JSON.stringify(cur.public, null, 2)} className="mt-1 w-full rounded border border-border bg-surface p-2 font-mono text-xs" />
        </label>
        <label className="block text-sm font-semibold">
          Secret payload
          <textarea name="secret" rows={14} defaultValue={JSON.stringify(cur.secret, null, 2)} className="mt-1 w-full rounded border border-border bg-surface p-2 font-mono text-xs" />
        </label>
        <input name="reason" required placeholder="Reason (required)" className="h-10 w-full rounded border border-border bg-surface px-3 text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="voidPrevious" /> Breaking fix: void v{p.currentVersion} (players get the corrected puzzle; streaks protected)
        </label>
        <button className="btn btn-primary">Save new version</button>
      </form>
      <form action={pullPuzzle} className="flex gap-2 rounded-2xl border border-wrong/40 p-4">
        <input type="hidden" name="puzzleId" value={id} />
        <input name="reason" required placeholder="Reason for pulling" className="h-10 flex-1 rounded border border-border bg-surface px-3 text-sm" />
        <button className="btn text-wrong">Pull puzzle (admin)</button>
      </form>
    </div>
  );
}
