import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireStaff } from '@/server/admin';
import { logout } from '../actions';

export const metadata = { title: 'Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const NAV = [
  ['/admin', 'Dashboard'],
  ['/admin/review', 'Review queue'],
  ['/admin/schedule', 'Schedule'],
  ['/admin/reports', 'Reports'],
  ['/admin/psychometrics', 'Psychometrics'],
  ['/admin/vocab', 'Vocabularies'],
  ['/admin/runs', 'Pipeline runs'],
  ['/admin/staff', 'Staff'],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff('reviewer');
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <Link href="/admin" className="font-extrabold">
            Examdle admin
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-muted hover:text-fg">
                {label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted">
              {user.email} · {user.role}
            </span>
            <button className="underline">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
