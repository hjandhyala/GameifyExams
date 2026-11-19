'use client';
import { CONSTANTS, LAB_VALUES, PERIODIC_TABLE } from '@prepdle/content/reference-data';
import { useState } from 'react';
import { Sheet } from '@/components/shell/Sheet';

export function LabDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn min-h-9 text-sm" onClick={() => setOpen(true)}>
        🧪 Lab values
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Normal lab values" wide>
        <p className="mb-3 text-xs text-muted">{LAB_VALUES.note}</p>
        <div className="space-y-4">
          {LAB_VALUES.sections.map((s) => (
            <section key={s.name}>
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{s.name}</h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>{k}</dt>
                    <dd className="tabular text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export function PeriodicDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn min-h-9 text-sm" onClick={() => setOpen(true)}>
        ⚛️ Periodic table
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Periodic table & constants" wide>
        <div className="overflow-x-auto">
          <div className="grid min-w-[620px] gap-0.5" style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}>
            {PERIODIC_TABLE.filter((e) => e.group > 0).map((e) => (
              <div key={e.z} className="rounded bg-surface-2 p-0.5 text-center leading-tight" style={{ gridColumn: e.group, gridRow: e.period }} title={`${e.name} (${e.z})`}>
                <div className="text-[8px] text-muted">{e.z}</div>
                <div className="text-[13px] font-bold">{e.symbol}</div>
                <div className="tabular text-[8px]">{e.mass}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Abbreviated: elements 1–56 and selected heavy elements.</p>
        <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-muted">Constants</h3>
        <dl className="mt-1 space-y-0.5 text-sm">
          {CONSTANTS.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt>{k}</dt>
              <dd className="tabular text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </>
  );
}
