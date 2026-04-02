import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { findTicket, dispatchTicket, getPendingTickets } from './api'

export default function ScreenValidarTicket() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [folio, setFolio] = useState('')
  const [ticket, setTicket] = useState(null)
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const inputRef = useRef(null)

  const warehouseId = session?.warehouse_id || 89

  useEffect(() => {
    loadPending()
    inputRef.current?.focus()
  }, [])

  async function loadPending() {
    try {
      const p = await getPendingTickets(warehouseId).catch(() => [])
      setPending(p || [])
    } catch { /* empty */ }
  }

  async function handleSearch() {
    if (!folio.trim()) return
    setError('')
    setTicket(null)
    setLoading(true)
    try {
      const t = await findTicket(folio.trim())
      if (!t) { setError('Ticket no encontrado'); return }
      setTicket(t)
    } catch (e) {
      setError(e.message || 'Error buscando ticket')
    } finally { setLoading(false) }
  }

  async function handleDispatch() {
    if (!ticket?.id) return
    setDispatching(true)
    setError('')
    try {
      await dispatchTicket(ticket.id)
      setSuccess(`Ticket ${ticket.name} despachado correctamente`)
      setTicket(null)
      setFolio('')
      loadPending()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setError(e.message || 'Error al despachar')
    } finally { setDispatching(false) }
  }

  function handleSelectPending(t) {
    setTicket(t)
    setFolio(t.name || '')
    setError('')
    setSuccess('')
  }

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } input { font-family: 'DM Sans', sans-serif; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/entregas')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Validar Ticket</span>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            ref={inputRef}
            type="text"
            value={folio}
            onChange={e => setFolio(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Folio o escanear QR..."
            style={{ flex: 1, padding: '12px 14px', borderRadius: TOKENS.radius.md, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 16, fontWeight: 600, outline: 'none', letterSpacing: '0.05em' }}
          />
          <button onClick={handleSearch} disabled={loading} style={{
            padding: '0 18px', borderRadius: TOKENS.radius.md,
            background: 'linear-gradient(90deg, #15499B, #2B8FE0)', color: 'white', fontSize: 14, fontWeight: 600,
          }}>
            {loading ? '...' : 'Buscar'}
          </button>
        </div>

        {/* Messages */}
        {error && <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{success}</div>}

        {/* Ticket detail */}
        {ticket && (
          <div style={{ padding: 18, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`, boxShadow: TOKENS.shadow.md, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{ticket.name}</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>{ticket.date} &middot; {ticket.customer}</p>
              </div>
              <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: ticket.dispatched ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${ticket.dispatched ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ticket.dispatched ? TOKENS.colors.success : TOKENS.colors.warning }}>{ticket.dispatched ? 'DESPACHADO' : 'PENDIENTE'}</span>
              </div>
            </div>

            {/* Lines */}
            <div style={{ borderRadius: TOKENS.radius.md, overflow: 'hidden', border: `1px solid ${TOKENS.colors.border}`, marginBottom: 14 }}>
              {(ticket.lines || []).map((line, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent', borderBottom: i < ticket.lines.length - 1 ? `1px solid ${TOKENS.colors.border}` : 'none' }}>
                  <div>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>{line.product}</span>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginLeft: 8 }}>×{line.qty}</span>
                  </div>
                  <span style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 700 }}>${line.total?.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ ...typo.body, color: TOKENS.colors.textMuted }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.text }}>${ticket.total?.toFixed(2)}</span>
            </div>

            {/* Dispatch button */}
            {!ticket.dispatched && (
              <button onClick={handleDispatch} disabled={dispatching} style={{
                width: '100%', padding: '14px', marginTop: 10, borderRadius: TOKENS.radius.lg,
                background: 'linear-gradient(90deg, #22c55e, #16a34a)', color: 'white',
                fontSize: 15, fontWeight: 600, opacity: dispatching ? 0.6 : 1,
                boxShadow: '0 10px 24px rgba(34,197,94,0.30)',
              }}>
                {dispatching ? 'Despachando...' : 'Confirmar Despacho'}
              </button>
            )}
          </div>
        )}

        {/* Pending tickets */}
        {!ticket && pending.length > 0 && (
          <>
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>TICKETS PENDIENTES</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map((t, i) => (
                <button key={t.id || i} onClick={() => handleSelectPending(t)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                  width: '100%', textAlign: 'left',
                }}>
                  <div>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{t.name}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{t.customer} &middot; {t.date}</p>
                  </div>
                  <span style={{ ...typo.body, color: TOKENS.colors.warning, fontWeight: 700 }}>${t.total?.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {!ticket && pending.length === 0 && !loading && (
          <div style={{ marginTop: 30, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin tickets pendientes</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Ingresa un folio o escanea un QR para validar.</p>
          </div>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
