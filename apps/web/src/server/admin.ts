import 'server-only';
import type { TrackId } from '@prepdle/core';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppError } from './errors';

export type Role = 'admin' | 'editor' | 'reviewer';
const RANK: Record<Role, number> = { reviewer: 1, editor: 2, admin: 3 };

export async function requireStaff(min: Role = 'reviewer', track?: TrackId) {
  const session = await auth();
  if (!session?.user?.email) redirect('/admin/login');
  const role = session.user.role;
  if (!role || RANK[role] < RANK[min]) throw new AppError('FORBIDDEN', 'Insufficient role');
  if (track && role !== 'admin' && !session.user.tracks.includes(track)) throw new AppError('FORBIDDEN', 'Not permitted for this track');
  return session.user as { email: string; role: Role; tracks: TrackId[]; staffId: string; name?: string | null };
}
