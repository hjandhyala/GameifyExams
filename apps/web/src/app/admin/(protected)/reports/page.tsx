import Link from 'next/link';
import { getRepo } from '@/server/db';
import { updateReport } from '../../actions';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'open' } = await searchParams;
  const reports = await (await getRepo()).listReports(status === 'all' ? undefined : status, 300);
  const grouped = new Map<string, typeof reports>();
  for (const r of reports) grouped.set(r.puzzleId, [...(grouped.get(r.puzzleId) ?? []), r]);
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Reports</h1>
      <nav className="mt-2 flex gap-3 text-sm">
        {['open', 'triaged', 'actioned', 'dismissed', 'all'].map((s) => (
          <Link key={s} href={`?status=${s}`} className={s === status ? 'font-bold underline' : 'text-muted'}>
            {s}
          </Link>
        ))}
      </nav>
      <div className="mt-4 space-y-4">
        {[...grouped.entries()].map(([pid, rs]) => (
          <section key={pid} className="rounded-xl border border-border p-3">
            <h2 className="font-bold">
              <Link href={`/admin/puzzles/${pid}`} className="underline">
                {pid}
              </Link>{' '}
              <span className="text-sm text-muted">({rs.length})</span>
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              {rs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-2">
                  <span className="font-semibold">{r.category}</span>
                  <span className="flex-1">{r.message ?? <i className="text-muted">no message</i>}</span>
                  <form action={updateReport} className="flex gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="resolution" placeholder="resolution" className="h-8 rounded border border-border bg-surface px-2" />
                    {['triaged', 'actioned', 'dismissed'].map((s) => (
                      <button key={s} name="status" value={s} className="rounded border border-border px-2">
                        {s}
                      </button>
                    ))}
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!reports.length && <p className="text-muted">No reports.</p>}
      </div>
    </div>
  );
}
