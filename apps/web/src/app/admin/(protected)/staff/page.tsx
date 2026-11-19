import { getRepo } from '@/server/db';
import { requireStaff } from '@/server/admin';
import { upsertStaff } from '../../actions';

export default async function StaffPage() {
  const me = await requireStaff('reviewer');
  const staff = await (await getRepo()).listStaff();
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Staff</h1>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Tracks</th>
            <th>Qualifications</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td>{s.email}</td>
              <td>{s.role}</td>
              <td>{s.tracks.join(', ')}</td>
              <td>{s.qualifications.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {me.role === 'admin' && (
        <form action={upsertStaff} className="mt-6 grid max-w-xl gap-2 rounded-2xl border border-border p-4 text-sm">
          <h2 className="font-bold">Invite / update staff</h2>
          <input name="email" type="email" required placeholder="email" className="h-10 rounded border border-border bg-surface px-3" />
          <input name="name" placeholder="name" className="h-10 rounded border border-border bg-surface px-3" />
          <select name="role" className="h-10 rounded border border-border bg-surface px-3">
            <option>reviewer</option>
            <option>editor</option>
            <option>admin</option>
          </select>
          <div className="flex gap-3">
            {['mcat', 'lsat', 'boards', 'bar'].map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input type="checkbox" name={`track_${t}`} /> {t}
              </label>
            ))}
          </div>
          <input name="qualifications" placeholder="qualifications (comma-separated, e.g. MD, JD, LSAT-170+)" className="h-10 rounded border border-border bg-surface px-3" />
          <button className="btn btn-primary">Save</button>
        </form>
      )}
    </div>
  );
}
