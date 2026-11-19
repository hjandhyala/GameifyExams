import { VOCABULARIES } from '@prepdle/content';

export default async function VocabPage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const { id = 'boards-dx', q = '' } = await searchParams;
  const v = VOCABULARIES[id] ?? VOCABULARIES['boards-dx']!;
  const needle = q.toLowerCase();
  const entries = v.entries.filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.id.includes(needle) || (e.syn ?? []).some((s) => s.toLowerCase().includes(needle)));
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Vocabularies</h1>
      <p className="text-sm text-muted">
        Source of truth: <code>packages/content/vocab/*.json</code>. Edit there (or via <code>npm run pipeline build-vocab</code>), then run <code>npm run pipeline build-assets</code> and deploy to publish a new content hash.
      </p>
      <form className="mt-3 flex gap-2 text-sm">
        <select name="id" defaultValue={id} className="rounded border border-border bg-surface px-2 py-1">
          {Object.keys(VOCABULARIES).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="Search" className="rounded border border-border bg-surface px-2 py-1" />
        <button className="btn min-h-8">Search</button>
      </form>
      <p className="mt-2 text-sm">
        {entries.length} / {v.entries.length} entries · attributes: {v.attributes.map((a) => a.label).join(', ')}
      </p>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th>Id</th>
            <th>Name</th>
            <th>Synonyms / abbr.</th>
            <th>Attributes</th>
            <th>Parent</th>
          </tr>
        </thead>
        <tbody>
          {entries.slice(0, 500).map((e) => (
            <tr key={e.id} className="border-t border-border">
              <td className="font-mono text-xs">{e.id}</td>
              <td>{e.name}</td>
              <td className="text-muted">{[...(e.syn ?? []), ...(e.abbr ?? [])].join(', ')}</td>
              <td>{Object.entries(e.attrs).map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join('/') : val}`).join(' · ')}</td>
              <td className="font-mono text-xs">{e.parent ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
