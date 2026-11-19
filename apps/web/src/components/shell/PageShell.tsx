import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

export function PageShell({ title, children, backHref = '/' }: { title: string; children: ReactNode; backHref?: string }) {
  return (
    <>
      <AppHeader title={title} backHref={backHref} />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        {children}
      </main>
    </>
  );
}
