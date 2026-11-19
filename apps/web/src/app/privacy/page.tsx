import type { Metadata } from 'next';
import { PageShell } from '@/components/shell/PageShell';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy">
      <div className="prose-game space-y-4 text-[16px]">
        <p>Prepdle has no accounts. We don’t collect names, emails or advertising identifiers.</p>
        <h2 className="text-xl font-bold">What we store</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>A random device cookie</b> (<code>pd_did</code>, HttpOnly, up to 400 days). It keeps each puzzle to one play per day and lets us restore your
            streak if your browser storage is cleared. We store only a keyed hash of it.
          </li>
          <li>
            <b>Your results</b> (score, moves, time taken, time zone, app version), linked to that hash. They power everyone’s score distributions and help
            us find flawed questions. Move details are deleted after 180 days, and everything after 400 days of inactivity.
          </li>
          <li>
            <b>Reports</b> you send about content (kept up to 2 years).
          </li>
          <li>
            <b>Local data</b> on your device (settings, history, in-progress games) in your browser’s storage.
          </li>
          <li>
            <b>IP addresses are never stored.</b> A daily-rotating hash is used briefly for rate limiting.
          </li>
          <li>
            <b>Analytics</b> are cookieless and aggregated (no device id, no IP).
          </li>
        </ul>
        <h2 className="text-xl font-bold">Your choices</h2>
        <p>
          Settings → “Delete all my data” removes local data and all server data for this device. Prepdle is not directed to children under 13.
        </p>
      </div>
    </PageShell>
  );
}
