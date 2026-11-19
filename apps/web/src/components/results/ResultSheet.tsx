'use client';
import {
  CATALOG,
  displayStreak,
  engineFor,
  TIER_GLYPH,
  type GameConfig,
  type GauntletPublic,
  type GauntletStepFb,
  type JargonReveal,
  type JargonStepFb,
  type ClassifyReveal,
  type ClassifyStepFb,
  type QuartetPublic,
  type QuartetReveal,
  type TrackId,
  type WorkupReveal,
} from '@prepdle/core';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { shareText } from '@/client/share';
import { saveKey, useStore } from '@/client/store';
import type { DailyGame } from '@/client/useDailyGame';
import { Icons } from '@/components/shell/AppHeader';
import { Countdown } from '@/components/shell/Countdown';
import { Md } from '@/components/shell/Markdown';
import { useToast } from '@/components/shell/Toast';
import { BonusQuestion } from './BonusQuestion';
import { Distribution } from './Distribution';
import { ReportButton } from './ReportDialog';

const ROLL_EMOJI_LABELS: Record<string, string> = { X: '✗' };

function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 1300);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      {Array.from({ length: 36 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 h-2 w-1.5 rounded-sm"
          style={{
            left: `${(i * 97) % 100}%`,
            background: `var(--tier-${(i % 4) + 1})`,
            animation: `pd-confetti ${0.9 + (i % 5) * 0.08}s ease-out ${(i % 7) * 0.03}s forwards`,
          }}
        />
      ))}
      <style>{`@keyframes pd-confetti{from{transform:translateY(-10px) rotate(0)}to{transform:translateY(150px) rotate(540deg);opacity:0}}`}</style>
    </div>
  );
}

function QuartetReview({ pub, reveal }: { pub: QuartetPublic; reveal: QuartetReveal }) {
  const label = new Map(pub.tiles.map((t) => [t.id, t.label]));
  return (
    <div className="space-y-3">
      {reveal.groups.map((g) => (
        <div key={g.id} className="rounded-xl border border-border p-3">
          <p className="font-bold" style={{ color: `var(--tier-${g.tier})` }}>
            {TIER_GLYPH[g.tier]} {g.label}
          </p>
          <p className="text-sm">{g.tileIds.map((id) => label.get(id)).join(' · ')}</p>
          <p className="mt-1 text-sm text-muted">{g.explanation}</p>
        </div>
      ))}
      {reveal.redHerrings.length > 0 && (
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Traps in today’s board</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {reveal.redHerrings.map((r) => (
              <li key={r.tileId}>
                <b>{label.get(r.tileId)}</b>: {r.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function WorkupReview({ reveal, topWrong }: { reveal: WorkupReveal; topWrong?: { name: string; pct: number }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-lg font-extrabold">{reveal.answerName}</p>
      <Md text={reveal.explanation} className="text-[15px]" />
      <details className="rounded-xl border border-border p-3" open>
        <summary className="cursor-pointer font-bold">Key discriminators</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {reveal.discriminators.map((d) => (
            <li key={d.vsEntityId}>
              <b>vs {d.vsName}:</b> {d.point}
            </li>
          ))}
        </ul>
      </details>
      {topWrong && topWrong.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer font-bold">Most common wrong answers</summary>
          <ul className="mt-2 text-sm">
            {topWrong.map((t) => (
              <li key={t.name}>
                {t.name} <span className="text-muted">({t.pct}%)</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer font-bold">All clues</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {reveal.clues.map((c, i) => (
            <li key={i}>
              <b>{c.stage}:</b> {c.text}
            </li>
          ))}
        </ol>
      </details>
      {reveal.sources.length > 0 && <p className="text-xs text-muted">Sources: {reveal.sources.map((s) => s.locator).join('; ')}</p>}
    </div>
  );
}

function GauntletReview({ pub, steps }: { pub: GauntletPublic; steps: GauntletStepFb[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.questionId} className="rounded-xl border border-border p-3 text-sm">
          <p className="font-bold">
            {s.correct ? '🟢' : '🔴'} Q{i + 1} · {pub.questions[i]?.displayTag} · {s.points > 0 ? '+' : ''}
            {s.points}
          </p>
          <p className="mt-1 text-muted">{s.takeaway}</p>
        </li>
      ))}
    </ol>
  );
}

export function ResultSheet({ g, track, config, showGlobalStats, bonusEnabled }: { g: DailyGame; track: TrackId; config: GameConfig; showGlobalStats: boolean; bonusEnabled: boolean }) {
  const save = g.save!;
  const puzzle = g.puzzle!;
  const engine = engineFor(config.gameId);
  const outcome = save.outcome!;
  const streaks = useStore((s) => s.streaks);
  const day = useStore((s) => (g.date ? s.days[g.date] : undefined));
  const { toast } = useToast();
  const passed = engine.passed(outcome);
  const bucket = engine.bucket(outcome);
  const perfect = bucket === engine.bucketOrder[0];
  const streak = g.date ? displayStreak(streaks.global, g.date) : 0;

  const nextGame = useMemo(() => {
    const t = CATALOG[track];
    const idx = t.games.findIndex((x) => x.gameId === config.gameId);
    for (let k = 1; k < t.games.length; k++) {
      const cand = t.games[(idx + k) % t.games.length]!;
      const s = day?.[saveKey(track, cand.gameId)];
      if (!s || s.status === 'in_progress') return cand;
    }
    return null;
  }, [day, track, config.gameId]);

  const onShare = async () => {
    if (!g.shareText) return;
    const m = await shareText(g.shareText, 'game');
    if (m === 'clipboard') toast('Copied to clipboard');
    if (m === 'manual') window.prompt('Copy your result:', g.shareText);
  };

  const bonusReveal = (save.reveal as { bonus?: Parameters<typeof BonusQuestion>[0]['bonus'] } | undefined)?.bonus;
  const bonusStep = (save.steps as { kind?: string }[]).find((s) => s.kind === 'bonus') as
    | { correct: boolean; correctOptionId: string; rationale: string }
    | undefined;
  const bonusChosen = ((save.transcript as { type: string; optionId?: string }[]).find((m) => m.type === 'bonus') ?? {}).optionId;
  const gauntletItemId = undefined;

  const stats = g.globalStats;

  return (
    <div className="relative">
      {perfect && passed && <Confetti />}
      <div className="text-center">
        <p className="text-4xl" aria-hidden="true">
          {passed ? (perfect ? '🏆' : '🎉') : '📚'}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold">{save.voided ? 'Puzzle withdrawn' : engine.headline(outcome)}</h2>
        <p className="mt-1 text-sm text-muted">
          {CATALOG[track].name} {config.name} #{puzzle.number} · {engine.scoreLabel(outcome)} · 🔥 {streak}-day streak
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => void onShare()} disabled={!g.shareText}>
          {Icons.share} Share
        </button>
        {nextGame ? (
          <Link className="btn" href={`/${track}/${nextGame.slug}`}>
            Next: {nextGame.name} →
          </Link>
        ) : (
          <Link className="btn" href={`/${track}`}>
            Share today’s card →
          </Link>
        )}
      </div>

      {bonusEnabled && bonusReveal && (
        <div className="mt-5">
          <BonusQuestion
            bonus={bonusReveal}
            result={bonusStep ? { ...bonusStep, chosen: bonusChosen } : undefined}
            onAnswer={(optionId) => g.dispatchMove({ type: 'bonus', optionId })}
          />
        </div>
      )}

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Review</h3>
        {engine.id === 'quartet' && save.reveal ? <QuartetReview pub={puzzle.payload as QuartetPublic} reveal={save.reveal as QuartetReveal} /> : null}
        {engine.id === 'workup' && save.reveal ? <WorkupReview reveal={save.reveal as WorkupReveal} topWrong={stats?.topWrongGuesses} /> : null}
        {engine.id === 'jargon' && save.reveal ? (
          <div className="space-y-2 text-[15px]">
            <p className="text-2xl font-extrabold tracking-widest">{(save.reveal as JargonReveal).answer}</p>
            <p className="text-sm text-muted">{(save.reveal as JargonReveal).category}</p>
            <Md text={(save.reveal as JargonReveal).definition} />
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <b>Why it matters:</b> {(save.reveal as JargonReveal).whyItMatters}
            </p>
            <p className="text-xs text-muted">Hints used: {(save.steps as JargonStepFb[]).filter((s) => s.kind === 'hint').length}</p>
          </div>
        ) : null}
        {engine.id === 'gauntlet' ? <GauntletReview pub={puzzle.payload as GauntletPublic} steps={save.steps as GauntletStepFb[]} /> : null}
        {engine.id === 'classify' && save.reveal ? (
          <p className="text-sm text-muted">
            {(save.steps as ClassifyStepFb[]).filter((s) => s.kind === 'check').length} check(s) used. The full key and explanations are shown on the board.{' '}
            {Object.keys((save.reveal as ClassifyReveal).key).length} items.
          </p>
        ) : null}
      </section>

      {showGlobalStats && (
        <section className="mt-5">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">How everyone did</h3>
          {stats && stats.players > 0 ? (
            <>
              <Distribution distribution={stats.distribution} order={engine.bucketOrder} highlight={bucket} labels={ROLL_EMOJI_LABELS} />
              <p className="mt-2 text-sm">
                {stats.players} player{stats.players === 1 ? '' : 's'}
                {stats.percentile !== undefined && stats.players > 1 ? <> · You did better than <b>{stats.percentile}%</b> of players</> : null}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{save.submitted ? 'Stats are on their way…' : 'Stats will appear once your result syncs.'}</p>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        <Countdown />
        <ReportButton puzzleId={puzzle.puzzleId} version={save.version} itemId={gauntletItemId} />
        {(track === 'boards' || track === 'bar') && <p className="text-center text-xs text-muted">Educational use only. Not {track === 'boards' ? 'medical' : 'legal'} advice.</p>}
      </div>
    </div>
  );
}
