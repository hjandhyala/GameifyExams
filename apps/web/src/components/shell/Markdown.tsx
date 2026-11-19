import { Fragment, type ReactNode } from 'react';

/**
 * Restricted markdown renderer (§14.1): **bold**, _italic_, ^sup^, ~sub~ and paragraphs only.
 * Never renders raw HTML; all text goes through React escaping.
 */
export function Md({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i} className={i ? 'mt-3' : undefined}>
          {inline(p)}
        </p>
      ))}
    </div>
  );
}

export function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_|\^(.+?)\^|~(.+?)~|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(<Fragment key={k++}>{s.slice(last, m.index)}</Fragment>);
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={k++}>{m[2]}</em>);
    else if (m[3]) out.push(<sup key={k++}>{m[3]}</sup>);
    else if (m[4]) out.push(<sub key={k++}>{m[4]}</sub>);
    else out.push(<br key={k++} />);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(<Fragment key={k++}>{s.slice(last)}</Fragment>);
  return out;
}
