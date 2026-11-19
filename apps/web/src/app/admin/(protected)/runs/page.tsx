import { getRepo } from '@/server/db';

export default async function RunsPage() {
  const repo = await getRepo();
  const [runs, audit] = await Promise.all([repo.listRuns(100), repo.recentAudit(50)]);
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-extrabold">Pipeline runs</h1>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th>Run</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Stats</th>
              <th>Cost</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="font-mono text-xs">{r.id}</td>
                <td>{r.kind}</td>
                <td>{r.status}</td>
                <td className="max-w-md truncate font-mono text-xs">{JSON.stringify(r.stats)}</td>
                <td className="tabular">{r.costUsd ? `$${r.costUsd}` : '—'}</td>
                <td>{new Date(r.startedAt).toISOString().slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!runs.length && <p className="text-muted">No runs yet. Use <code>npm run pipeline generate</code>.</p>}
      </section>
      <section>
        <h2 className="text-xl font-bold">Audit log</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {audit.map((a) => (
            <li key={a.id}>
              <span className="text-muted">{new Date(a.createdAt).toISOString().slice(0, 16)}</span> {a.actor} · {a.action} · {a.entity} {a.entityId}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
