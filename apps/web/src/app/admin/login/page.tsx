import { authProviders } from '@/auth';
import { devLogin, oauthLogin } from '../actions';

export const metadata = { title: 'Staff sign-in', robots: { index: false } };

export default function LoginPage() {
  const oauth = authProviders.filter((p) => p.id !== 'dev');
  const dev = authProviders.some((p) => p.id === 'dev');
  return (
    <main className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-2xl font-extrabold">Examdle staff</h1>
      <p className="mt-1 text-sm text-muted">Reviewers, editors and admins only. Players never need an account.</p>
      <div className="mt-6 space-y-2">
        {oauth.map((p) => (
          <form key={p.id} action={oauthLogin.bind(null, p.id)}>
            <button className="btn w-full">Continue with {p.name}</button>
          </form>
        ))}
        {dev && (
          <form action={devLogin} className="space-y-2 rounded-xl border border-dashed border-border p-3">
            <p className="text-xs font-bold uppercase text-muted">Development sign-in</p>
            <input name="email" type="email" required placeholder="you@example.com" className="h-11 w-full rounded-full border border-border bg-surface px-4" />
            <button className="btn btn-primary w-full">Sign in</button>
          </form>
        )}
        {!oauth.length && !dev && <p className="text-sm text-wrong">No sign-in providers configured. Set AUTH_GITHUB_ID or AUTH_GOOGLE_ID.</p>}
      </div>
    </main>
  );
}
