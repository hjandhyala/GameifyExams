import type { Metadata } from 'next';
import { SettingsClient } from '@/components/settings/SettingsClient';
import { PageShell } from '@/components/shell/PageShell';
import { APP_VERSION } from '@/server/env';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <PageShell title="Settings">
      <SettingsClient version={APP_VERSION} />
    </PageShell>
  );
}
