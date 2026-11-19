import { addDays, allSlots, utcISO, TRACKS, type TrackId } from '@prepdle/core';
import Link from 'next/link';
import { getRepo } from '@/server/db';
import { lockUpcoming, refillSlot, runScheduler } from '../../actions';

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ track?: TrackId; from?: string }> }) {
  const sp = await searchParams;
  const track = sp.track ?? 'boards';
  const from = sp.from ?? utcISO(Date.now());
  const repo = await getRepo();
  const to = addDays(from, 27);
  const puzzles = await repo.puzzlesInRange(from, to, track);
  const items = await repo.getItems([...new Set(puzzles.flatMap((p) => p.itemIds))]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const slots = allSlots().filter((s) => s.track === track);
  const dates = Array.from({ length: 28 }, (_, i) => addDays(from, i));
  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="text-2xl font-extrabold">Schedule</h1>
        <nav className="flex gap-2 text-sm">
          {TRACKS.map((t) => (
            <Link key={t.id} href={`?track=${t.id}&from=${from}`} className={t.id === track ? 'font-bold underline' : 'text-muted'}>
              {t.name}
            </Link>
          ))}
        </nav>
        <form action={runScheduler} className="ml-auto flex items-center gap-2 text-sm">
          <input type="date" name="from" defaultValue={from} className="rounded border border-border bg-surface px-2 py-1" />
          <input type="number" name="days" defaultValue={28} min={1} max={60} className="w-16 rounded border border-border bg-surface px-2 py-1" />
          <button className="btn min-h-8">Fill gaps</button>
        </form>
        <form action={lockUpcoming}>
          <button className="btn min-h-8 text-sm">Lock next 7 days</button>
        </form>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg text-left">Date</th>
              {slots.map((s) => (
                <th key={s.game.gameId} className="px-2 text-left">
                  {s.game.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((d) => (
              <tr key={d} className="border-t border-border align-top">
                <td className="sticky left-0 bg-bg py-1 pr-2 font-semibold tabular">{d}</td>
                {slots.map((s) => {
                  const p = puzzles.find((x) => x.date === d && x.gameId === s.game.gameId);
                  if (!p) return <td key={s.game.gameId} className="bg-wrong/10 px-2 py-1 text-wrong">empty</td>;
                  const its = p.itemIds.map((id) => byId.get(id));
                  return (
                    <td key={s.game.gameId} className="px-2 py-1">
                      <Link href={`/admin/puzzles/${p.id}`} className="font-semibold underline">
                        {p.locked ? '🔒 ' : ''}D{p.difficulty} v{p.currentVersion}
                        {p.status === 'voided' ? ' (voided)' : ''}
                      </Link>
                      <div className="max-w-52 truncate text-muted">{its.map((i) => i?.blueprintCodes[0]).join(', ')}</div>
                      <form action={refillSlot}>
                        <input type="hidden" name="puzzleId" value={p.id} />
                        <button className="text-muted underline">swap</button>
                      </form>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
