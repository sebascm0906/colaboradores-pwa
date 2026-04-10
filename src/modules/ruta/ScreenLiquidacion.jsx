// ScreenLiquidacion.jsx — V2 Cuadre de dinero
// Backend: GET /pwa-ruta/liquidation (agrega payments de stops por bucket)
// Si backend no disponible, el vendedor captura manualmente como fallback.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan } from './api'
import { logScreenError } from '../shared/logScreenError'
import {
  fetchLiquidacion,
  saveLiquidacionLocal,
  getLiquidacionLocal,
  saveCierreState,
  getCierreState,
  fmtMoney,
} from './routeControlService'

export default function ScreenLiquidacion() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [cashCollected, setCashCollected] = useState('')
  const [creditCollected, setCreditCollected] = useState('')
  const [transferCollected, setTransferCollected] = useState('')
  const [cashExpected, setCashExpected] = useState('')
  const [creditExpected, setCreditExpected] = useState('')
  const [transferExpected, setTransferExpected] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [backendSource, setBackendSource] = useState(false) // true if data from backend

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const p = await getMyRoutePlan(session?.employee_id)
      setPlan(p)
      if (p?.id) {
        const cierreState = getCierreState(p.id, p)
        if (cierreState.liquidacionDone) setConfirmed(true)

        // Try backend liquidation first
        const liq = await fetchLiquidacion(p.id)
        if (liq.source === 'backend' && liq.data) {
          setBackendSource(true)
          const d = liq.data
          const payments = d.payments || {}
          // Backend: {cash: {count, total}, credit: {count, total}, transfer: {count, total}}
          setCashExpected((payments.cash?.total || 0).toString())
          setCashCollected((payments.cash?.total || 0).toString())
          setCreditExpected((payments.credit?.total || 0).toString())
          setCreditCollected((payments.credit?.total || 0).toString())
          setTransferExpected((payments.transfer?.total || 0).toString())
          setTransferCollected((payments.transfer?.total || 0).toString())
        } else {
          // Fallback: localStorage
          const saved = getLiquidacionLocal(p.id)
          if (saved) {
            setCashExpected(saved.cashExpected?.toString() || '')
            setCashCollected(saved.cashCollected?.toString() || '')
            setCreditExpected(saved.creditExpected?.toString() || '')
            setCreditCollected(saved.creditCollected?.toString() || '')
            setTransferExpected(saved.transferExpected?.toString() || '')
            setTransferCollected(saved.transferCollected?.toString() || '')
            setNotes(saved.notes || '')
          }
        }
      }
    } catch (e) { logScreenError('ScreenLiquidacion', 'loadData', e) }
    setLoading(false)
  }

  const cashExp = parseFloat(cashExpected) || 0
  const cashCol = parseFloat(cashCollected) || 0
  const creditExp = parseFloat(creditExpected) || 0
  const creditCol = parseFloat(creditCollected) || 0
  const transferExp = parseFloat(transferExpected) || 0
  const transferCol = parseFloat(transferCollected) || 0
  const cashDiff = cashCol - cashExp
  const creditDiff = creditCol - creditExp
  const transferDiff = transferCol - transferExp
  const totalExpected = cashExp + creditExp + transferExp
  const totalCollected = cashCol + creditCol + transferCol
  const totalDiff = totalCollected - totalExpected

  const hasDifference = Math.abs(totalDiff) > 0.01
  const canConfirm = (cashExp > 0 || creditExp > 0 || cashCol > 0 || creditCol > 0)

  function handleConfirm() {
    if (!plan?.id) return
    const data = {
      cashExpected: cashExp,
      cashCollected: cashCol,
      creditExpected: creditExp,
      creditCollected: creditCol,
      transferExpected: transferExp,
      transferCollected: transferCol,
      cashDiff,
      creditDiff,
      transferDiff,
      totalDiff,
      notes,
    }
    saveLiquidacionLocal(plan.id, data)
    saveCierreState(plan.id, { liquidacionDone: true, liquidacionAt: new Date().toISOString() })
    setConfirmed(true)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        input, textarea { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Liquidacion</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !plan ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin ruta activa</p>
          </div>
        ) : confirmed ? (
          /* Confirmed state */
          <div style={{ marginTop: 20 }}>
            <div style={{
              padding: 20, borderRadius: TOKENS.radius.xl,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              textAlign: 'center', marginBottom: 16,
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>&#x2705;</div>
              <p style={{ ...typo.title, color: '#22c55e', margin: 0 }}>Liquidacion Confirmada</p>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SummaryRow label="Efectivo esperado" value={fmtMoney(cashExp)} typo={typo} />
              <SummaryRow label="Efectivo cobrado" value={fmtMoney(cashCol)} typo={typo} />
              {Math.abs(cashDiff) > 0.01 && (
                <SummaryRow label="Diferencia efectivo" value={fmtMoney(cashDiff)} typo={typo}
                  color={cashDiff > 0 ? '#22c55e' : '#ef4444'} />
              )}
              <SummaryRow label="Credito esperado" value={fmtMoney(creditExp)} typo={typo} />
              <SummaryRow label="Credito cobrado" value={fmtMoney(creditCol)} typo={typo} />
              {Math.abs(creditDiff) > 0.01 && (
                <SummaryRow label="Diferencia credito" value={fmtMoney(creditDiff)} typo={typo}
                  color={creditDiff > 0 ? '#22c55e' : '#ef4444'} />
              )}
              {(transferExp > 0 || transferCol > 0) && (
                <>
                  <SummaryRow label="Transferencia esperado" value={fmtMoney(transferExp)} typo={typo} />
                  <SummaryRow label="Transferencia cobrado" value={fmtMoney(transferCol)} typo={typo} />
                  {Math.abs(transferDiff) > 0.01 && (
                    <SummaryRow label="Diferencia transferencia" value={fmtMoney(transferDiff)} typo={typo}
                      color={transferDiff > 0 ? '#22c55e' : '#ef4444'} />
                  )}
                </>
              )}
              <div style={{ height: 4, borderTop: `1px solid ${TOKENS.colors.border}` }} />
              <SummaryRow label="Total esperado" value={fmtMoney(totalExpected)} typo={typo} bold />
              <SummaryRow label="Total cobrado" value={fmtMoney(totalCollected)} typo={typo} bold />
              {Math.abs(totalDiff) > 0.01 && (
                <SummaryRow label="DIFERENCIA TOTAL" value={fmtMoney(totalDiff)} typo={typo} bold
                  color={totalDiff > 0 ? '#22c55e' : '#ef4444'} />
              )}
            </div>

            <button onClick={() => navigate('/ruta')} style={{
              width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.lg, marginTop: 20,
              background: 'linear-gradient(135deg, #15499B, #2B8FE0)', color: 'white',
              fontWeight: 700, fontSize: 15,
            }}>
              Volver al flujo
            </button>
          </div>
        ) : (
          <>
            {/* Source indicator */}
            {backendSource && (
              <div style={{
                padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <p style={{ ...typo.caption, color: '#22c55e', margin: 0 }}>
                  Montos calculados desde los cobros registrados en Kold Field.
                </p>
              </div>
            )}

            {/* Cash section */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>EFECTIVO</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <MoneyInput label="Esperado" value={cashExpected} onChange={setCashExpected} typo={typo} />
              <MoneyInput label="Cobrado" value={cashCollected} onChange={setCashCollected} typo={typo} />
            </div>
            {Math.abs(cashDiff) > 0.01 && (
              <DiffBadge label="Diferencia efectivo" value={cashDiff} typo={typo} />
            )}

            {/* Credit section */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8, marginTop: 16 }}>CREDITO</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <MoneyInput label="Esperado" value={creditExpected} onChange={setCreditExpected} typo={typo} />
              <MoneyInput label="Cobrado" value={creditCollected} onChange={setCreditCollected} typo={typo} />
            </div>
            {Math.abs(creditDiff) > 0.01 && (
              <DiffBadge label="Diferencia credito" value={creditDiff} typo={typo} />
            )}

            {/* Transfer section — only show if there's transfer data */}
            {(transferExp > 0 || transferCol > 0) && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8, marginTop: 16 }}>TRANSFERENCIA</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <MoneyInput label="Esperado" value={transferExpected} onChange={setTransferExpected} typo={typo} />
                  <MoneyInput label="Cobrado" value={transferCollected} onChange={setTransferCollected} typo={typo} />
                </div>
                {Math.abs(transferDiff) > 0.01 && (
                  <DiffBadge label="Diferencia transferencia" value={transferDiff} typo={typo} />
                )}
              </>
            )}

            {/* Total */}
            <div style={{
              padding: 14, borderRadius: TOKENS.radius.lg, marginTop: 16, marginBottom: 12,
              background: hasDifference ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
              border: `1px solid ${hasDifference ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
              textAlign: 'center',
            }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 2 }}>TOTAL</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Esperado</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.colors.text }}>{fmtMoney(totalExpected)}</p>
                </div>
                <div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Cobrado</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.colors.text }}>{fmtMoney(totalCollected)}</p>
                </div>
              </div>
              {hasDifference && (
                <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 700, color: totalDiff > 0 ? '#22c55e' : '#ef4444' }}>
                  Diferencia: {totalDiff > 0 ? '+' : ''}{fmtMoney(totalDiff)}
                </p>
              )}
            </div>

            {/* Notes — required if difference */}
            {hasDifference && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ ...typo.caption, color: '#f59e0b', margin: '0 0 6px', fontWeight: 600 }}>
                  Hay diferencia. Explica el motivo:
                </p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Motivo de la diferencia..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 13, outline: 'none', resize: 'vertical',
                  }}
                />
              </div>
            )}

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || (hasDifference && !notes.trim())}
              style={{
                width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.lg,
                background: canConfirm && (!hasDifference || notes.trim())
                  ? 'linear-gradient(135deg, #15499B, #2B8FE0)'
                  : TOKENS.colors.surface,
                color: canConfirm ? 'white' : TOKENS.colors.textMuted,
                fontWeight: 700, fontSize: 15,
                opacity: canConfirm && (!hasDifference || notes.trim()) ? 1 : 0.5,
              }}
            >
              {hasDifference ? 'Confirmar con diferencia' : 'Confirmar Liquidacion'}
            </button>

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function MoneyInput({ label, value, onChange, typo }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px', fontSize: 10 }}>{label}</p>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TOKENS.colors.textMuted, fontSize: 14 }}>$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0.00"
          style={{
            width: '100%', padding: '10px 10px 10px 24px', borderRadius: TOKENS.radius.md,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
            color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
          }}
        />
      </div>
    </div>
  )
}

function DiffBadge({ label, value, typo }) {
  const color = value > 0 ? '#22c55e' : '#ef4444'
  return (
    <div style={{
      padding: '6px 12px', borderRadius: TOKENS.radius.md,
      background: `${color}08`, border: `1px solid ${color}20`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>
        {value > 0 ? '+' : ''}{fmtMoney(value)}
      </span>
    </div>
  )
}

function SummaryRow({ label, value, typo, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 600, color: color || TOKENS.colors.text }}>{value}</span>
    </div>
  )
}
