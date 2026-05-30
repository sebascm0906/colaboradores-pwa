import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSession } from '../../App'
import { todayLocal } from '../../lib/api'
import { softWarehouse } from '../../lib/sessionGuards'
import { TOKENS, getTypo } from '../../tokens'
import SessionErrorState from '../../components/SessionErrorState'
import { getVanLoadHistory } from './entregasService'
import { buildVanLoadHistorySummary, groupVanLoadHistoryByVan } from './vanLoadHistory'
import { ScreenShell, EmptyState } from './components'
import { AdminProvider } from '../admin/AdminContext'
import AdminShell from '../admin/components/AdminShell'

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
      <div style={{
        width: 32,
        height: 32,
        border: '2px solid rgba(255,255,255,0.12)',
        borderTop: `2px solid ${TOKENS.colors.blue2}`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

function formatDateLabel(value) {
  if (!value) return ''
  const [year, month, day] = String(value).split('-')
  if (!year || !month || !day) return value
  return new Date(`${year}-${month}-${day}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function SummaryTile({ label, value, typo }) {
  return (
    <div style={{
      padding: 12,
      borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surfaceSoft,
      border: `1px solid ${TOKENS.colors.border}`,
      minWidth: 0,
    }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{label}</p>
      <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: '4px 0 0' }}>{value}</p>
    </div>
  )
}

function LoadStateBadge({ item }) {
  const done = item.state === 'done'
  const refill = item.loadKind === 'refill'
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <span style={{
        padding: '3px 8px',
        borderRadius: TOKENS.radius.pill,
        fontSize: 11,
        fontWeight: 700,
        color: refill ? TOKENS.colors.warning : TOKENS.colors.blue2,
        background: refill ? TOKENS.colors.warningSoft : 'rgba(43,143,224,0.12)',
        border: `1px solid ${refill ? 'rgba(245,158,11,0.24)' : 'rgba(43,143,224,0.24)'}`,
      }}>
        {item.loadKindLabel}
      </span>
      <span style={{
        padding: '3px 8px',
        borderRadius: TOKENS.radius.pill,
        fontSize: 11,
        fontWeight: 700,
        color: done ? TOKENS.colors.success : TOKENS.colors.textMuted,
        background: done ? TOKENS.colors.successSoft : TOKENS.colors.surface,
        border: `1px solid ${done ? 'rgba(34,197,94,0.25)' : TOKENS.colors.border}`,
      }}>
        {item.stateLabel}
      </span>
    </div>
  )
}

function HistoryView({ backTo, isAdmin = false, shell = true }) {
  const { session } = useSession()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 390)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [date, setDate] = useState(todayLocal())
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const warehouseId = softWarehouse(session)
  const summary = useMemo(() => buildVanLoadHistorySummary(items), [items])
  const groups = useMemo(() => groupVanLoadHistoryByVan(items), [items])

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadData = useCallback(async () => {
    if (!warehouseId || !date) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const history = await getVanLoadHistory({ warehouseId, date })
      setItems(history)
    } catch (e) {
      if (e.message !== 'no_session') setError('No se pudo cargar el historial de cargas.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [warehouseId, date])

  useEffect(() => { loadData() }, [loadData])

  if (!warehouseId) {
    return (
      <SessionErrorState
        error={{ missing: 'warehouse_id', userMessage: 'Tu usuario no tiene almacén asignado.' }}
        backTo={backTo}
      />
    )
  }

  const content = (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input { color-scheme: dark; }
      `}</style>

      <div style={{
        display: 'grid',
        gridTemplateColumns: sw >= 720 ? '1fr auto auto' : '1fr',
        gap: 10,
        alignItems: 'end',
        marginBottom: 14,
      }}>
        <div>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 6px' }}>
            DIA DE REGISTRO
          </p>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '10px 12px',
              borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.text,
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => setDate(todayLocal())}
          style={{
            minHeight: 44,
            padding: '0 14px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surfaceSoft,
            border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.textSoft,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Hoy
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            minHeight: 44,
            padding: '0 16px',
            borderRadius: TOKENS.radius.md,
            background: 'linear-gradient(90deg, #15499B, #2B8FE0)',
            color: 'white',
            fontSize: 13,
            fontWeight: 700,
            opacity: loading ? 0.65 : 1,
          }}
        >
          Actualizar
        </button>
      </div>

      <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: '0 0 14px', textTransform: 'capitalize' }}>
        {formatDateLabel(date)}
      </p>

      {error && (
        <div style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.errorSoft,
          border: '1px solid rgba(239,68,68,0.22)',
          color: TOKENS.colors.error,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {!loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: sw >= 720 ? 'repeat(3, 1fr)' : 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}>
          <SummaryTile label="Movimientos" value={summary.totalLoads} typo={typo} />
          <SummaryTile label="Camionetas" value={summary.totalVans} typo={typo} />
          <SummaryTile label="Piezas" value={summary.totalQty} typo={typo} />
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState icon="🚚" title="Sin cargas registradas ese día" subtitle={isAdmin ? 'El admin verá aquí lo registrado por almacén de entregas.' : 'Cuando registres cargas o recargas aparecerán aquí.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((group) => (
            <section key={group.key} style={{
              borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel,
              border: `1px solid ${TOKENS.colors.border}`,
              boxShadow: TOKENS.shadow.soft,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: 14,
                borderBottom: `1px solid ${TOKENS.colors.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'flex-start',
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0, fontSize: 15 }}>
                    {group.label}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    {group.totalLoads} movimiento{group.totalLoads !== 1 ? 's' : ''} · {group.totalQty} piezas
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.items.map((item, index) => (
                  <div key={item.id || index} style={{
                    padding: 14,
                    borderBottom: index < group.items.length - 1 ? `1px solid ${TOKENS.colors.border}` : 'none',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'flex-start',
                      marginBottom: 10,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>
                          {item.time || '--:--'} {item.name ? `· ${item.name}` : ''}
                        </p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                          {item.mobileLocationName || 'Unidad sin ubicación'}
                          {item.registeredByName ? ` · Registro: ${item.registeredByName}` : ''}
                        </p>
                      </div>
                      <LoadStateBadge item={item} />
                    </div>

                    <div style={{
                      borderRadius: TOKENS.radius.md,
                      border: `1px solid ${TOKENS.colors.border}`,
                      overflow: 'hidden',
                    }}>
                      {item.lines.map((line, lineIndex) => (
                        <div key={`${item.id}-${line.productId}-${lineIndex}`} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '9px 11px',
                          background: lineIndex % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent',
                          borderBottom: lineIndex < item.lines.length - 1 ? `1px solid ${TOKENS.colors.border}` : 'none',
                        }}>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>
                            {line.productName}
                          </span>
                          <span style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 800 }}>
                            {line.qty}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )

  if (!shell) return content
  return (
    <ScreenShell title="Historial de cargas" backTo={backTo}>
      {content}
    </ScreenShell>
  )
}

export default function ScreenHistorialCargas() {
  const location = useLocation()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const isAdmin = location.pathname.startsWith('/admin')

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (isAdmin && sw >= 1024) {
    return (
      <AdminProvider>
        <AdminShell activeBlock="historial-cargas" title="Historial de cargas" hideActivityFeed>
          <HistoryView backTo="/admin" isAdmin shell={false} />
        </AdminShell>
      </AdminProvider>
    )
  }

  return <HistoryView backTo={isAdmin ? '/admin' : '/entregas'} isAdmin={isAdmin} />
}
