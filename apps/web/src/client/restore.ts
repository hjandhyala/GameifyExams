'use client';
import { api } from './api';
import { useStore } from './store';

/** Restores history from the server when local history is empty but the device cookie has results (§8.8). */
export async function maybeRestore(): Promise<number> {
  const st = useStore.getState();
  if (st.history.length > 0) return 0;
  try {
    const s = await api.meSummary();
    if (!s.resultsCount) return 0;
    const { history } = await api.meHistory();
    return useStore.getState().mergeServerHistory(history);
  } catch {
    return 0;
  }
}
