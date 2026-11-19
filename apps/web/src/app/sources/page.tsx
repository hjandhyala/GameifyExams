import { SOURCES } from '@prepdle/content/sources-data';
import type { Metadata } from 'next';
import { PageShell } from '@/components/shell/PageShell';

export const metadata: Metadata = { title: 'Sources & attributions' };

export default function SourcesPage() {
  return (
    <PageShell title="Sources & attributions">
      <p className="text-muted">Examdle content is original. These open data sources ground our questions and vocabularies (§11 of our design).</p>
      <ul className="mt-5 space-y-3">
        {SOURCES.map((s) => (
          <li key={s.id} className="card p-4">
            <a href={s.url} className="font-bold underline" target="_blank" rel="noreferrer noopener">
              {s.name}
            </a>
            <p className="mt-1 text-sm">
              <b>License:</b> {s.license}
            </p>
            <p className="text-sm">
              <b>Used for:</b> {s.usedFor} ({s.tracks.join(', ')})
            </p>
            <p className="mt-1 text-sm text-muted">{s.attribution}</p>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
