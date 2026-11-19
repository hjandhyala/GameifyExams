import type { Metadata } from 'next';
import { TransferClient } from '@/components/settings/TransferClient';
import { PageShell } from '@/components/shell/PageShell';

export const metadata: Metadata = { title: 'Link this device' };

export default function TransferPage() {
  return (
    <PageShell title="Link this device">
      <TransferClient />
    </PageShell>
  );
}
