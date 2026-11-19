import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import type { Provider } from 'next-auth/providers';
import type { TrackId } from '@prepdle/core';

declare module 'next-auth' {
  interface Session {
    user: { role: 'admin' | 'editor' | 'reviewer'; tracks: TrackId[]; staffId: string } & DefaultSession['user'];
  }
}

const IS_PROD = process.env.VERCEL_ENV === 'production' || process.env.EXAMDLE_PRODUCTION === '1';
const bootstrapAdmins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const providers: Provider[] = [];
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
// Development-only sign-in (never enabled on production deploys).
if (!IS_PROD && (process.env.NODE_ENV !== 'production' || process.env.ADMIN_DEV_LOGIN === '1')) {
  providers.push(
    Credentials({
      id: 'dev',
      name: 'Dev login',
      credentials: { email: { label: 'Email', type: 'email' } },
      authorize: async (c) => {
        const email = String(c?.email ?? '').toLowerCase();
        return email.includes('@') ? { id: email, email, name: email.split('@')[0] } : null;
      },
    }),
  );
}

async function staffFor(email: string) {
  const { getRepo } = await import('@/server/db');
  const repo = await getRepo();
  let s = await repo.staffByEmail(email);
  const devAuto = !IS_PROD && process.env.NODE_ENV !== 'production' && !bootstrapAdmins.length;
  if (!s && (bootstrapAdmins.includes(email) || devAuto)) {
    await repo.upsertStaff({ id: email, email, name: email.split('@')[0], role: 'admin', tracks: ['mcat', 'lsat', 'boards', 'bar'] });
    s = await repo.staffByEmail(email);
  }
  return s;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt', maxAge: 8 * 3600 },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? (IS_PROD ? undefined : 'dev-auth-secret-not-secret'),
  pages: { signIn: '/admin/login' },
  cookies: { sessionToken: { name: 'pd_admin_session', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: IS_PROD } } },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return !!(await staffFor(user.email.toLowerCase()));
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const s = await staffFor(user.email.toLowerCase());
        if (s) Object.assign(token, { role: s.role, tracks: s.tracks, staffId: s.id });
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role as 'admin' | 'editor' | 'reviewer';
      session.user.tracks = (token.tracks as TrackId[]) ?? [];
      session.user.staffId = token.staffId as string;
      return session;
    },
  },
});

export const authProviders = providers.map((p) => {
  const conf = (typeof p === 'function' ? p() : p) as { id: string; name: string; options?: { id?: string; name?: string } };
  return { id: conf.options?.id ?? conf.id, name: conf.options?.name ?? conf.name };
});
