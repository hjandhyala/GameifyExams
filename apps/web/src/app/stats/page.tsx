import { isTrackId } from '@prepdle/core';
import type { Metadata } from 'next';
import { Insights } from '@/components/stats/Insights';
import { PageShell } from '@/components/shell/PageShell';

export const metadata: Metadata = { title: 'Stats & insights' };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const { track } = await searchParams;
  return (
    <PageShell title="Stats & insights">
      <Insights initialTrack={track && isTrackId(track) ? track : undefined} />
    </PageShell>
  );
}
