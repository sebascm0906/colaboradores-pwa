import { useEffect, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import { getTodayExpenses, getTodayMpTransfers, getTodaySales } from '../api'
import { buildModuleActivityFeed, resolveActivityFeedScope } from '../activityFeedModel'

const POLL_MS = 30_000

function normalizeList(payload) {
  const data = payload?.data ?? payload
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.transfers)) return data.transfers
  return []
}

export default function ActivityFeed({ moduleId = 'hub' }) {
  const { warehouseId, companyId } = useAdmin()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const scope = resolveActivityFeedScope(moduleId)
        const [salesRaw, expensesRaw, transfersRaw] = await Promise.all([
          scope.sales ? getTodaySales({ warehouseId, companyId }).catch(() => []) : Promise.resolve([]),
          scope.expenses ? getTodayExpenses({ companyId, warehouseId }).catch(() => []) : Promise.resolve([]),
          scope.transfers ? getTodayMpTransfers({ companyId, warehouseId }).catch(() => []) : Promise.resolve([]),
        ])
        if (!alive) return
        setEvents(buildModuleActivityFeed(moduleId, {
          sales: normalizeList(salesRaw),
          expenses: normalizeList(expensesRaw),
          transfers: normalizeList(transfersRaw),
        }))
        setLastFetch(new Date())
      } catch {
        // silent - el feed es secundario
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [warehouseId, companyId, moduleId])

  const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return (
    <aside style={{
      position: 'sticky', top: 0, height: '100dvh',
      padding: '20px 16px', overflowY: 'auto',
      background: TOKENS.glass.panelSoft,
      borderLeft: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          ACTIVIDAD HOY
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: loading ? TOKENS.colors.warning : TOKENS.colors.success,
          }} />
          <span style={{ fontSize: 9, color: TOKENS.colors.textLow }}>
            {loading ? 'sync' : 'live'}
          </span>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <div style={{
            width: 22, height: 22, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: '2px solid #2B8FE0', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : events.length === 0 ? (
        <div style={{
          padding: '20px 14px', borderRadius: TOKENS.radius.md, textAlign: 'center',
          background: TOKENS.colors.surfaceSoft, border: `1px dashed ${TOKENS.colors.border}`,
        }}>
          <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0 }}>
            Sin actividad aun
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((ev) => {
            const color = ev.type === 'sale'
              ? TOKENS.colors.success
              : ev.type === 'transfer'
                ? TOKENS.colors.blue3
                : TOKENS.colors.warning
            return (
              <div key={ev.id} style={{
                padding: '10px 12px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surface,
                border: `1px solid ${TOKENS.colors.border}`,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: color, marginTop: 6, flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 11, fontWeight: 600, color: TOKENS.colors.text,
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ev.label}
                  </p>
                  {ev.meta && (
                    <p style={{
                      fontSize: 10, color: TOKENS.colors.textLow, margin: 0, marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ev.meta}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>
                  {ev.valueLabel || `${ev.type === 'expense' ? '-' : ''}${fmt(ev.amount)}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {lastFetch && (
        <p style={{
          fontSize: 9, color: TOKENS.colors.textLow, marginTop: 14, textAlign: 'center',
        }}>
          Actualizado {lastFetch.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </aside>
  )
}
