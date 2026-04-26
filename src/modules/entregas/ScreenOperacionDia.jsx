import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { findTicket, dispatchTicket, getPendingTickets, getCedisInventory } from './entregasService'
import { ScreenShell, ConfirmDialog } from './components'
import { logScreenError } from '../shared/logScreenError'

/* ============================================================================
   ScreenOperacionDia — Fusion of Tickets + Inventario in a tabbed view
============================================================================ */

const TABS = { TICKETS: 'tickets', INVENTARIO: 'inventario' }

export default function ScreenOperacionDia() {
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = Number(session?.warehouse_id || 0) || null

  // ── Shared state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(TABS.TICKETS)
  const [loadingInit, setLoadingInit] = useState(true)

  // ── Tickets state ─────────────────────────────────────────────────────────
  const [folio, setFolio] = useState('')
  const [ticket, setTicket] = useState(null)
  const [pending, setPending] = useState([])
  const [searching, setSearching] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [ticketSuccess, setTicketSuccess] = useState('')
  const inputRef = useRef(null)

  // ── Inventario state ──────────────────────────────────────────────────────
  const [inventory, setInventory] = useState([])
  const [invFilter, setInvFilter] = useState('')

  // ── Load data on mount (parallel) ─────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoadingInit(true)
    try {
      const [p, inv] = await Promise.allSettled([
        getPendingTickets(warehouseId),
        getCedisInventory(warehouseId),
      ])
      if (p.status === 'fulfilled' && Array.isArray(p.value)) {
        setPending(p.value)
      } else {
        if (p.status === 'rejected') logScreenError('ScreenOperacionDia', 'getPendingTickets', p.reason)
        setPending([])
      }
      if (inv.status === 'fulfilled' && Array.isArray(inv.value)) {
        setInventory(inv.value)
      } else {
        if (inv.status === 'rejected') logScreenError('ScreenOperacionDia', 'getCedisInventory', inv.reason)
        setInventory([])
      }
    } catch (e) { logScreenError('ScreenOperacionDia', 'loadAll', e) }
    finally { setLoadingInit(false) }
  }, [warehouseId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (activeTab === TABS.TICKETS) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeTab])

  // ── Ticket handlers ───────────────────────────────────────────────────────
  async function handleSearch() {
    if (!folio.trim()) return
    setTicketError('')
    setTicketSuccess('')
    setTicket(null)
    setSearching(true)
    try {
      const t = await findTicket(folio.trim())
      if (!t) { setTicketError('Ticket no encontrado'); return }
      setTicket(t)
    } catch (e) {
      setTicketError(e.message || 'Error buscando ticket')
    } finally { setSearching(false) }
  }

  // BLD-20260426-P0-2: el endpoint legacy /public_api/sale_order/validate_deliveries
  // devuelve {success: bool, message|error} — shape DISTINTA al resto del
  // stack gf_logistics_ops ({ok, message, data}). Antes el cliente solo
  // chequeaba try/catch y un response {success:false, error} pasaba como
  // éxito (toast verde, ticket "despachado") sin que la entrega ocurriera.
  // Además: bloqueamos despacho si el ticket pertenece a otro warehouse,
  // porque el backend NO valida scope (auditado runtime 2026-04-26 — desde
  // sesión Iguala se despacharon 3 órdenes ajenas con success:true).
  function getTicketWarehouseId(t) {
    if (!t) return 0
    const w = t.warehouse_id
    if (typeof w === 'number') return w
    if (Array.isArray(w) && typeof w[0] === 'number') return w[0]
    return 0
  }
  function isTicketFromMyWarehouse(t) {
    const tw = getTicketWarehouseId(t)
    if (!warehouseId) return false
    if (!tw) return true // backend no devolvió warehouse → permitir y dejar que server decida
    return tw === warehouseId
  }

  async function handleDispatch() {
    if (!ticket?.id) return
    if (!isTicketFromMyWarehouse(ticket)) {
      const tw = getTicketWarehouseId(ticket)
      setTicketError(`Este ticket pertenece a otro almacén (warehouse ${tw}). No puedes despacharlo desde aquí.`)
      setConfirmOpen(false)
      return
    }
    setDispatching(true)
    setTicketError('')
    try {
      const result = await dispatchTicket(ticket.id)
      // Defensa runtime: el endpoint puede devolver {success:false, error}
      // con HTTP 200 sin lanzar excepción. ANTES mostrábamos éxito igual.
      if (result && result.success === false) {
        setTicketError(result.error || result.message || 'Backend rechazó el despacho')
        setConfirmOpen(false)
        return
      }
      // También cubrimos shape ambigua (null, {}) que tampoco probaría éxito.
      if (!result || (typeof result === 'object' && !result.success && !result.ok)) {
        setTicketError('Respuesta del servidor no confirmó el despacho. Verifica en Odoo antes de reintentar.')
        setConfirmOpen(false)
        return
      }
      setTicketSuccess(`Ticket ${ticket.name} despachado correctamente`)
      setTicket(null)
      setFolio('')
      setConfirmOpen(false)
      // Refresh pending
      const p = await getPendingTickets(warehouseId).catch(() => [])
      setPending(p || [])
      setTimeout(() => setTicketSuccess(''), 4000)
    } catch (e) {
      setTicketError(e.message || 'Error al despachar')
      setConfirmOpen(false)
    } finally { setDispatching(false) }
  }

  function handleSelectPending(t) {
    setTicket(t)
    setFolio(t.name || '')
    setTicketError('')
    setTicketSuccess('')
  }

  // ── Inventario computed ───────────────────────────────────────────────────
  const filteredInv = invFilter
    ? inventory.filter(i => i.product?.toLowerCase().includes(invFilter.toLowerCase()))
    : inventory
  const totalKg = filteredInv.reduce((s, i) => s + (i.total_kg || i.quantity * (i.weight || 1)), 0)

  // ── Spinner helper ────────────────────────────────────────────────────────
  const Spinner = () => (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
      <div style={{
        width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
        borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
        animation: 'entregasOpSpin 0.8s linear infinite',
      }} />
    </div>
  )

  return (
    <ScreenShell title="Operacion del dia" backTo="/entregas">
      <style>{`
        @keyframes entregasOpSpin { to { transform: rotate(360deg); } }
        input { font-family: 'DM Sans', sans-serif; }
      `}</style>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: TOKENS.radius.md, overflow: 'hidden', border: `1px solid ${TOKENS.colors.border}` }}>
        {[
          { key: TABS.TICKETS, label: 'Tickets' },
          { key: TABS.INVENTARIO, label: 'Inventario' },
        ].map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: '12px 0',
                fontSize: 14,
                fontWeight: 600,
                color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                background: active ? 'rgba(43,143,224,0.12)' : TOKENS.colors.surfaceSoft,
                borderBottom: active ? `2px solid ${TOKENS.colors.blue2}` : '2px solid transparent',
                transition: `all ${TOKENS.motion.fast}`,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {loadingInit ? <Spinner /> : (
        <>
          {/* ════════════════════════════════════════════════════════════════
              TAB: TICKETS
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === TABS.TICKETS && (
            <>
              {/* Search bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={folio}
                  onChange={e => setFolio(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Folio o escanear QR..."
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 16, fontWeight: 600, outline: 'none', letterSpacing: '0.05em',
                  }}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  style={{
                    padding: '0 18px', borderRadius: TOKENS.radius.md,
                    background: 'linear-gradient(90deg, #15499B, #2B8FE0)', color: 'white',
                    fontSize: 14, fontWeight: 600, opacity: searching ? 0.6 : 1,
                  }}
                >
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>

              {/* Messages */}
              {ticketError && (
                <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                  {ticketError}
                </div>
              )}
              {ticketSuccess && (
                <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                  {ticketSuccess}
                </div>
              )}

              {/* Ticket detail card */}
              {ticket && (
                <div style={{ padding: 18, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`, boxShadow: TOKENS.shadow.md, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{ticket.name}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>{ticket.date} &middot; {ticket.customer}</p>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                      background: ticket.dispatched ? TOKENS.colors.successSoft : TOKENS.colors.warningSoft,
                      border: `1px solid ${ticket.dispatched ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
                      fontSize: 11, fontWeight: 700, color: ticket.dispatched ? TOKENS.colors.success : TOKENS.colors.warning,
                    }}>
                      {ticket.dispatched ? 'DESPACHADO' : 'PENDIENTE'}
                    </span>
                  </div>

                  {/* Lines table */}
                  <div style={{ borderRadius: TOKENS.radius.md, overflow: 'hidden', border: `1px solid ${TOKENS.colors.border}`, marginBottom: 14 }}>
                    {(ticket.lines || []).map((line, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent', borderBottom: i < (ticket.lines || []).length - 1 ? `1px solid ${TOKENS.colors.border}` : 'none' }}>
                        <div>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>{line.product}</span>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginLeft: 8 }}>&times;{line.qty}</span>
                        </div>
                        <span style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 700 }}>${line.total?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ ...typo.body, color: TOKENS.colors.textMuted }}>Total</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.text }}>${ticket.total?.toFixed(2)}</span>
                  </div>

                  {/* BLD-20260426-P0-2: aviso si el ticket es de OTRO warehouse.
                      Backend no valida scope; el cliente bloquea defensivamente. */}
                  {!isTicketFromMyWarehouse(ticket) && (
                    <div style={{
                      padding: 12, marginTop: 8, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                      color: TOKENS.colors.error, fontSize: 13, textAlign: 'center',
                    }}>
                      ⚠️ Este ticket pertenece a otro almacén
                      {getTicketWarehouseId(ticket) ? ` (ID ${getTicketWarehouseId(ticket)})` : ''}.
                      No puedes despacharlo desde tu sesión.
                    </div>
                  )}

                  {/* Dispatch button */}
                  {!ticket.dispatched && (
                    <button
                      onClick={() => setConfirmOpen(true)}
                      disabled={dispatching || !isTicketFromMyWarehouse(ticket)}
                      style={{
                        width: '100%', padding: 14, marginTop: 10, borderRadius: TOKENS.radius.lg,
                        background: isTicketFromMyWarehouse(ticket)
                          ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                          : TOKENS.colors.surface,
                        color: isTicketFromMyWarehouse(ticket) ? 'white' : TOKENS.colors.textMuted,
                        fontSize: 15, fontWeight: 600, opacity: dispatching ? 0.6 : 1,
                        boxShadow: isTicketFromMyWarehouse(ticket)
                          ? '0 10px 24px rgba(34,197,94,0.30)' : 'none',
                      }}
                    >
                      {dispatching
                        ? 'Despachando...'
                        : isTicketFromMyWarehouse(ticket)
                          ? 'Confirmar Despacho'
                          : 'Bloqueado: ticket de otro almacén'}
                    </button>
                  )}
                </div>
              )}

              {/* Pending tickets list */}
              {!ticket && pending.length > 0 && (
                <>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, marginBottom: 10 }}>TICKETS PENDIENTES</p>
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

              {!ticket && pending.length === 0 && !searching && (
                <div style={{ marginTop: 30, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
                  <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin tickets pendientes</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Ingresa un folio o escanea un QR para validar.</p>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB: INVENTARIO
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === TABS.INVENTARIO && (
            <>
              {/* Filter */}
              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  value={invFilter}
                  onChange={e => setInvFilter(e.target.value)}
                  placeholder="Buscar producto..."
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 14, outline: 'none',
                  }}
                />
              </div>

              {/* Summary pills */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Productos</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{filteredInv.length}</p>
                </div>
                <div style={{ flex: 1, padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Total Kg</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: TOKENS.colors.success, margin: 0 }}>{totalKg.toFixed(0)}</p>
                </div>
              </div>

              {/* Product list */}
              {filteredInv.length === 0 ? (
                <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                  <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>{invFilter ? 'Sin resultados' : 'Sin inventario'}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredInv.map((item, i) => (
                    <div key={item.product_id || i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: TOKENS.radius.md,
                      background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent',
                      border: `1px solid ${TOKENS.colors.border}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.product}
                        </p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                          {item.quantity} unidades &middot; Disp: {item.available ?? item.quantity}
                        </p>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.colors.blue2, flexShrink: 0, marginLeft: 8 }}>
                        {(item.total_kg || item.quantity * (item.weight || 1)).toFixed(0)} kg
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Confirm dispatch dialog ────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar despacho"
        message={`Confirmar despacho de ${ticket?.name || ''} por $${ticket?.total?.toFixed(2) || '0.00'}?`}
        confirmLabel="Despachar"
        onConfirm={handleDispatch}
        onCancel={() => setConfirmOpen(false)}
        loading={dispatching}
      />
    </ScreenShell>
  )
}
