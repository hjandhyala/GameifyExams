'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastCtx {
  toast: (msg: string, ms?: number) => void;
}
const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const id = useRef(0);
  const toast = useCallback((msg: string, ms = 2000) => {
    const n = ++id.current;
    setItems((xs) => [...xs.slice(-2), { id: n, msg }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== n)), ms);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="anim-fade-in rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg shadow-lg">
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
