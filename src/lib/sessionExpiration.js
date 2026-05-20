export function handleExpiredSession({
  clearLocalState,
  setSession,
  location = typeof window !== 'undefined' ? window.location : null,
} = {}) {
  try { clearLocalState?.() } catch { /* ignore */ }
  try { setSession?.(null) } catch { /* ignore */ }
  try { location?.replace?.('/login') } catch { /* ignore */ }
}
