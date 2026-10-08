export const STALE_AFTER_MS = 5 * 60_000

/** A browser-owned request cannot be assumed alive after the SPA is gone. */
export function classifyProcessing(row, activeJobId, nowMs = Date.now()) {
  if (row?.status !== 'processing') return 'terminal'
  if (row.id && row.id === activeJobId) return 'live'
  const updated = Date.parse(row.updated_at ?? '')
  if (!Number.isFinite(updated) || !Number.isFinite(nowMs)) return 'unconfirmed'
  return nowMs - updated >= STALE_AFTER_MS ? 'stale' : 'unconfirmed'
}
