import { engineFor, gameById, uniqueIdFactory, seededRng, type GameId, type TrackId } from '@prepdle/core';
import { dictionary, dictHashes, FIXTURES, vocabHash, vocabMap } from '@prepdle/content';
import { notFound } from 'next/navigation';
import { Preview } from '@/components/admin/Preview';
import { getRepo } from '@/server/db';
import { reviewItem } from '../../../actions';

const CHECKS: [string, string][] = [
  ['accurate', 'Factually correct as of today (I checked the cited sources)'],
  ['single_answer', 'Single unambiguous answer / partition / labeling'],
  ['blueprint_fit', 'Appropriate for the exam and the blueprint code'],
  ['difficulty', 'Difficulty rating matches the rubric'],
  ['explanations', 'Explanations are correct, concise and teach the key point'],
  ['fair_language', 'Fair language: no unnecessary demographic cues or stereotypes'],
  ['original', 'Not similar to copyrighted or official questions I recognize'],
];

export default async function ReviewItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const item = await repo.getItem(decodeURIComponent(id));
  if (!item) notFound();
  const track = item.track as TrackId;
  const gameId = item.gameId as GameId;
  const engine = engineFor(gameId);
  const game = gameById(track, gameId)!;
  const ctx = {
    ...(engine.id === 'jargon' ? { dictionary: dictionary(track) } : {}),
    ...(game.workup ? { vocab: vocabMap(game.workup.vocabId) } : {}),
  };
  const issues = engine.checkInvariants(engine.authoredSchema.parse(item.content), ctx);
  // Compile a preview. Gauntlet previews this question plus four other bank questions from the track.
  let preview: { pub: unknown; secret: unknown } | null = null;
  try {
    let authored = [item.content];
    if (engine.id === 'gauntlet') {
      const others = FIXTURES.filter((f) => f.track === track && f.gameId === 'gauntlet' && f.key !== item.id).slice(0, 4).map((f) => f.authored);
      authored = [item.content, ...others];
    }
    const c = engine.compile(authored.map((a) => engine.authoredSchema.parse(a)), {
      track,
      rng: seededRng(item.id),
      newId: uniqueIdFactory(),
      dictHashes: engine.id === 'jargon' ? dictHashes(track) : undefined,
      vocabRef: game.workup ? { id: game.workup.vocabId, hash: vocabHash(game.workup.vocabId) } : undefined,
      attributes: game.workup?.attributes,
      prompt: game.workup?.prompt,
      paceSeconds: 90,
    });
    preview = { pub: c.public, secret: c.secret };
  } catch (e) {
    issues.push({ level: 'error', code: 'COMPILE', message: (e as Error).message });
  }
  const validation = item.validation as { checks?: { id: string; status: string; details: string }[]; solver?: { runs: { model: string; answer: string; confidence: number; agreesWithKey: boolean }[] } } | null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h1 className="text-xl font-extrabold">{item.id}</h1>
        <p className="text-sm text-muted">
          {track}/{gameId} · D{item.difficulty} · status {item.status} · v{item.version} · {item.blueprintCodes.join(', ')}
        </p>
        <div className="mt-4">{preview ? <Preview track={track} gameId={gameId} pub={preview.pub} secret={preview.secret} vocabUrl={game.workup ? `/vocab/${game.workup.vocabId}.${vocabHash(game.workup.vocabId)}.json` : undefined} /> : <p className="text-wrong">Preview unavailable</p>}</div>
      </section>
      <section className="space-y-4">
        <div>
          <h2 className="font-bold">Invariants</h2>
          {issues.length ? (
            <ul className="text-sm">
              {issues.map((i, k) => (
                <li key={k} className={i.level === 'error' ? 'text-wrong' : 'text-[color:var(--fb-present)]'}>
                  {i.level.toUpperCase()} {i.code}: {i.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-correct">All invariants pass.</p>
          )}
        </div>
        {validation?.checks && (
          <div>
            <h2 className="font-bold">Validator report</h2>
            <ul className="text-sm">
              {validation.checks.map((c) => (
                <li key={c.id}>
                  <b>{c.id}</b> {c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'} {c.details}
                </li>
              ))}
            </ul>
            {validation.solver?.runs.map((r, k) => (
              <p key={k} className="text-sm">
                Solver {r.model}: {r.answer} ({Math.round(r.confidence * 100)}%) {r.agreesWithKey ? '✅' : '❌'}
              </p>
            ))}
          </div>
        )}
        <div>
          <h2 className="font-bold">Sources</h2>
          <ul className="text-sm">
            {(item.sources as { id: string; locator: string; url?: string }[]).map((s) => (
              <li key={s.id}>
                [{s.id}] {s.url ? <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.locator}</a> : s.locator}
              </li>
            ))}
          </ul>
        </div>
        <form action={reviewItem} className="space-y-3 rounded-2xl border border-border p-4">
          <input type="hidden" name="itemId" value={item.id} />
          <fieldset className="space-y-1 text-sm">
            <legend className="font-bold">Checklist (all required to approve)</legend>
            {CHECKS.map(([k, l]) => (
              <label key={k} className="flex gap-2">
                <input type="checkbox" name={`check_${k}`} /> {l}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-semibold">
            Difficulty rating
            <select name="difficulty" defaultValue={item.difficulty} className="ml-2 rounded border border-border bg-surface px-2 py-1">
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Content (authored JSON; edits are validated)
            <textarea name="content" defaultValue={JSON.stringify(item.content, null, 2)} rows={18} className="mt-1 w-full rounded-lg border border-border bg-surface p-2 font-mono text-xs" />
          </label>
          <label className="block text-sm font-semibold">
            Notes
            <textarea name="notes" rows={2} className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-sm" />
          </label>
          <div className="flex gap-2">
            <button name="decision" value="approve" className="btn btn-primary">
              Approve
            </button>
            <button name="decision" value="request_changes" className="btn">
              Request changes
            </button>
            <button name="decision" value="reject" className="btn text-wrong">
              Reject
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
