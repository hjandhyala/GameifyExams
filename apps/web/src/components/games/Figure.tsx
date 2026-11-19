'use client';
import type { Figure as FigureT } from '@prepdle/core';
import { useEffect, useRef, useState } from 'react';

const COLORS = ['var(--tier-2)', 'var(--tier-3)', 'var(--tier-1)', 'var(--tier-4)'];

function Chart({ f }: { f: Extract<FigureT, { type: 'chart' }> }) {
  const [asTable, setAsTable] = useState(false);
  const W = 340;
  const H = 220;
  const P = { l: 44, r: 12, t: 12, b: 40 };
  const pts = f.series.flatMap((s) => s.points);
  const xMax = Math.max(...pts.map((p) => p[0]));
  const yMax = Math.max(...pts.map((p) => p[1]));
  const niceMax = (v: number) => {
    const m = 10 ** Math.floor(Math.log10(v));
    return Math.ceil(v / m) * m;
  };
  const xm = niceMax(xMax);
  const ym = niceMax(yMax);
  const sx = (x: number) => P.l + (x / xm) * (W - P.l - P.r);
  const sy = (y: number) => H - P.b - (y / ym) * (H - P.t - P.b);
  const ticks = (m: number) => [0, 0.25, 0.5, 0.75, 1].map((t) => +(t * m).toPrecision(3));
  return (
    <figure className="my-3">
      {asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">{f.x.label}</th>
              {f.series.map((s) => (
                <th key={s.name} className="text-right">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.series[0]!.points.map((p, i) => (
              <tr key={i}>
                <td>{p[0]}</td>
                {f.series.map((s) => (
                  <td key={s.name} className="tabular text-right">
                    {s.points[i]?.[1]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-labelledby="fig-title fig-desc">
          <title id="fig-title">{f.caption ?? 'Chart'}</title>
          <desc id="fig-desc">{f.series.map((s) => `${s.name}: ${s.points.map((p) => `(${p[0]}, ${p[1]})`).join(' ')}`).join('; ')}</desc>
          {ticks(ym).map((t) => (
            <g key={`y${t}`}>
              <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={P.l - 6} y={sy(t) + 4} fontSize="10" textAnchor="end" fill="var(--text-muted)">
                {t}
              </text>
            </g>
          ))}
          {ticks(xm).map((t) => (
            <text key={`x${t}`} x={sx(t)} y={H - P.b + 14} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
              {t}
            </text>
          ))}
          <text x={(W + P.l) / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--text)">
            {f.x.label}
            {f.x.unit ? ` (${f.x.unit})` : ''}
          </text>
          <text x={12} y={(H - P.b) / 2} fontSize="11" textAnchor="middle" fill="var(--text)" transform={`rotate(-90 12 ${(H - P.b) / 2})`}>
            {f.y.label}
            {f.y.unit ? ` (${f.y.unit})` : ''}
          </text>
          {f.series.map((s, si) =>
            f.kind === 'bar' ? (
              s.points.map((p, i) => <rect key={`${si}-${i}`} x={sx(p[0]) - 6 + si * 6} y={sy(p[1])} width={6} height={H - P.b - sy(p[1])} fill={COLORS[si]} />)
            ) : (
              <g key={s.name}>
                {f.kind === 'line' && <polyline fill="none" stroke={COLORS[si]} strokeWidth="2.5" points={s.points.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} />}
                {s.points.map((p, i) => (
                  <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r="3.2" fill={COLORS[si]} />
                ))}
              </g>
            ),
          )}
        </svg>
      )}
      <figcaption className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
        {f.series.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded" style={{ background: COLORS[i] }} /> {s.name}
          </span>
        ))}
        <button className="underline" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </figcaption>
    </figure>
  );
}

function Structure({ f }: { f: Extract<FigureT, { type: 'structure' }> }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const SD = (await import('smiles-drawer')).default as unknown as {
          SvgDrawer: new (o: object) => { draw: (tree: unknown, target: Element, theme?: string) => void };
          parse: (s: string, ok: (t: unknown) => void, err: (e: unknown) => void) => void;
        };
        const drawer = new SD.SvgDrawer({ width: 260, height: 180, bondThickness: 1.2 });
        const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        SD.parse(
          f.smiles,
          (tree) => !cancelled && ref.current && drawer.draw(tree, ref.current, theme),
          () => setFailed(true),
        );
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [f.smiles]);
  return (
    <figure className="my-3">
      {failed ? <p className="text-sm text-muted">[Structure: {f.name}]</p> : <svg ref={ref} role="img" aria-label={`Structure of ${f.name}`} className="h-[180px] w-[260px]" />}
      {f.caption && <figcaption className="text-xs text-muted">{f.caption}</figcaption>}
    </figure>
  );
}

export function Figure({ figure }: { figure: FigureT }) {
  if (figure.type === 'chart') return <Chart f={figure} />;
  if (figure.type === 'structure') return <Structure f={figure} />;
  return (
    <figure className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            {figure.columns.map((c) => (
              <th key={c} className="border-b border-border px-2 py-1 text-left font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {figure.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="tabular border-b border-border px-2 py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {figure.caption && <figcaption className="mt-1 text-xs text-muted">{figure.caption}</figcaption>}
    </figure>
  );
}
