import { TRACKS, type GameId, type TrackId } from '@prepdle/core';
import Link from 'next/link';
import { getRepo } from '@/server/db';

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ track?: TrackId; game?: GameId; status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? 'in_review';
  const items = await (await getRepo()).listItems({ track: sp.track, gameId: sp.game, status: status === 'all' ? undefined : [status], limit: 300 });
  const score = (v: unknown) => (v as { score?: number } | null)?.score;
  items.sort((a, b) => (score(a.validation) ?? 50) - (score(b.validation) ?? 50));
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Review queue</h1>
      <form className="mt-3 flex flex-wrap gap-2 text-sm">
        <select name="track" defaultValue={sp.track ?? ''} className="rounded border border-border bg-surface px-2 py-1">
          <option value="">All tracks</option>
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="game" defaultValue={sp.game ?? ''} className="rounded border border-border bg-surface px-2 py-1">
          <option value="">All games</option>
          {['quartet', 'jargon', 'workup', 'gauntlet', 'anatomy', 'verdict'].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="rounded border border-border bg-surface px-2 py-1">
          {['in_review', 'changes_requested', 'approved', 'reserve', 'published', 'auto_rejected', 'retired', 'draft', 'all'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn min-h-8">Filter</button>
      </form>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th>Item</th>
            <th>Track/game</th>
            <th>D</th>
            <th>Blueprint</th>
            <th>Validator</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const v = i.validation as { passed?: boolean; score?: number; checks?: { status: string }[] } | null;
            const warns = v?.checks?.filter((c) => c.status !== 'pass').length ?? 0;
            return (
              <tr key={i.id} className="border-t border-border">
                <td>
                  <Link href={`/admin/review/${encodeURIComponent(i.id)}`} className="underline">
                    {i.id}
                  </Link>
                </td>
                <td>
                  {i.track}/{i.gameId}
                </td>
                <td>{i.difficulty}</td>
                <td className="max-w-48 truncate">{i.blueprintCodes.join(', ')}</td>
                <td>{v ? `${v.score ?? '?'}${warns ? ` · ⚠ ${warns}` : ''}` : '—'}</td>
                <td>{i.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!items.length && <p className="mt-4 text-muted">Nothing here.</p>}
    </div>
  );
}
