// ScreenMaterialesResolverRejected.jsx — Admin resuelve settlement rechazado
// ───────────────────────────────────────────────────────────────────────────
// POST /api/production/materials/settlement/resolve_rejected
//   body: { settlement_id | (shift_id, line_id, material_id),
//           qty_returned, qty_damaged, qty_consumed, employee_id, notes? }
//
// Backend valida:
//   qty_returned + qty_damaged + qty_consumed === qty_issued
// y genera los moves correspondientes, transicionando a `force_closed`.
// Frontend SOLO capta inputs y previsualiza la suma.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  resolveRejectedSettlement, getPendingSettlements,
  stateLabel, lineOf,
} from '../almacen-pt/materialsService'
import { fmtNum, DEFAULT_WAREHOUSE_ID } from '../almacen-pt/ptService'
import { logScreenError } from '../shared/logScreenError'

// Resolver rechazo de materiales es flujo dependiente de "validar materiales".
// Alineado con ScreenMaterialesValidate: solo gerente / dirección.
// auxiliar_admin queda excluido (segregación de funciones — 2026-04-18).
const ALLOWED_ROLES = ['gerente_sucursal', 'direccion_general']

export default function ScreenMaterialesResolverRejected() {
  const { session } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const plantId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  const [settlement, setSettlement] = useState(location.state?.settlement || null)
  const [loading, setLoading] = useState(!settlement)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [qtyReturned, setQtyReturned] = useState('')
  const [qtyDamaged,  setQtyDamaged]  = useState('')
  const [qtyConsumed, setQtyConsumed] = useState('')
  const [notes, setNotes] = useState('')

  const role = session?.role || ''
  const allowed = ALLOWED_ROLES.includes(role)

  useEffect(() => {
    if (!allowed) { setLoading(false); return }
    if (!settlement) fallbackFind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  async function fallbackFind() {
    // No entró por navigate con state → toma el primer rechazado pendiente de la planta.
    setLoading(true)
    setError('')
    try {
      const res = await getPendingSettlements({ plantId, states: ['rejected'] })
      const first = (res.items || [])[0]
      if (!first) {
        setError('No hay settlements rechazados pendientes.')
      } else {
        setSettlement(first)
      }
    } catch (e) {
      logScreenError('ScreenMaterialesResolverRejected', 'fallbackFind', e)
      setError(e?.message || 'Error buscando settlement rechazado.')
    }
    setLoading(false)
  }

  const qtyIssued = Number(settlement?.qty_issued || 0)
  const n = (s) => (s === '' ? 0 : Number(s) || 0)
  const sumParts = n(qtyReturned) + n(qtyDamaged) + n(qtyConsumed)
  const diff = +(qtyIssued - sumParts).toFixed(6)
  const cuadra = qtyIssued > 0 && Math.abs(diff) < 1e-6
  const anyNeg =
    (qtyReturned !== '' && Number(qtyReturned) < 0) ||
    (qtyDamaged  !== '' && Number(qtyDamaged)  < 0) ||
    (qtyConsumed !== '' && Number(qtyConsumed) < 0)
  const allFilled = qtyReturned !== '' && qtyDamaged !== '' && qtyConsumed !== ''
  const canSave = !!settlement && allFilled && !anyNeg && cuadra && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await resolveRejectedSettlement({
        settlementId: settlement.settlement_id || settlement.id || null,
        shiftId:     settlement.shift_id     || null,
        lineId:      settlement.line_id      || null,
        materialId:  settlement.material_id  || null,
        qtyReturned: n(qtyReturned),
        qtyDamaged:  n(qtyDamaged),
        qtyConsumed: n(qtyConsumed),
        employeeId:  session?.employee_id || 0,
        notes: notes.trim(),
      })
      setSuccess('Resuelto. Settlement cerrado con desglose.')
      setTimeout(() => navigate('/admin/materiales/validar'), 900)
    } catch (e) {
      logScreenError('ScreenMaterialesResolverRejected', 'handleSave', e)
      setError(e?.message || 'No se pudo resolver el settlement.')
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) {
    return (
      <div style={pageStyle}>
        <GlobalStyles />
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
          <p style={{ ...typo.title, color: TOKENS.colors.error }}>Sin permiso</p>
          <button onClick={() => navigate('/admin')} style={{
            marginTop: 16, padding: '10px 20px', borderRadius: TOKENS.radius.pill,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text, fontSize: 13, fontWeight: 600,
          }}>Volver</button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <GlobalStyles />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin/materiales/validar')} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Resolver rechazado</span>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
              Desglose: devuelto + dañado + consumido = entregado
            </p>
          </div>
        </div>

        {error && <div style={errorBox}><p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p></div>}
        {success && <div style={successBox}><p style={{ ...typo.body, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>{success}</p></div>}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !settlement ? (
          <div style={{ padding: 24, textAlign: 'center', color: TOKENS.colors.textMuted, ...typo.body }}>
            Sin settlement seleccionado.
          </div>
        ) : (
          <>
            {/* Contexto */}
            <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}` }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>
                {lineOf(settlement)} · {stateLabel(settlement.settlement_state || settlement.state)}
                {settlement.shift_id ? ` · Turno #${settlement.shift_id}` : ''}
              </p>
              <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, marginTop: 4 }}>
                {settlement.product_name || settlement.material_name || '—'}
              </p>
              <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, marginTop: 6 }}>
                Entregado: <b>{fmtNum(qtyIssued)}</b> {settlement.uom || ''}
              </p>
              {(settlement.qty_remaining != null || settlement.qty_used != null) && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  Reportó: sobrante {fmtNum(settlement.qty_remaining)} · usado {fmtNum(settlement.qty_used)}
                </p>
              )}
              {settlement.notes && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0', fontStyle: 'italic' }}>
                  "{settlement.notes}"
                </p>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle(typo)}>Devuelto (al almacén)</label>
              <input type="number" inputMode="decimal" value={qtyReturned}
                onChange={e => setQtyReturned(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle(typo)}>Dañado (merma)</label>
              <input type="number" inputMode="decimal" value={qtyDamaged}
                onChange={e => setQtyDamaged(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle(typo)}>Consumido (producción)</label>
              <input type="number" inputMode="decimal" value={qtyConsumed}
                onChange={e => setQtyConsumed(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
              />
            </div>

            {/* Preview de suma */}
            <div style={{
              marginTop: 14, padding: 12, borderRadius: TOKENS.radius.lg,
              background: cuadra ? TOKENS.colors.successSoft : 'rgba(239,68,68,0.08)',
              border: `1px solid ${cuadra ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Suma</span>
                <b style={{ ...typo.body, color: cuadra ? TOKENS.colors.success : TOKENS.colors.error, fontWeight: 700 }}>
                  {fmtNum(sumParts)} / {fmtNum(qtyIssued)}
                </b>
              </div>
              <p style={{
                ...typo.caption,
                color: cuadra ? TOKENS.colors.success : TOKENS.colors.error,
                margin: '6px 0 0', fontWeight: 600,
              }}>
                {anyNeg ? 'No se permiten valores negativos.'
                  : cuadra ? 'Cuadra: listo para cerrar.'
                  : !allFilled ? 'Completa los tres campos.'
                  : diff > 0 ? `Faltan ${fmtNum(diff)} para cuadrar.`
                  : `Excede por ${fmtNum(-diff)}.`}
              </p>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle(typo, true)}>Notas (opcional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones de la resolución..." rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              />
            </div>

            <button onClick={handleSave} disabled={!canSave}
              style={{
                width: '100%', marginTop: 16, padding: '16px', borderRadius: TOKENS.radius.lg,
                background: canSave ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canSave ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 700, opacity: saving ? 0.6 : 1,
                boxShadow: canSave ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}>
              {saving ? 'Resolviendo...' : 'CERRAR SETTLEMENT'}
            </button>
            <button onClick={() => navigate('/admin/materiales/validar')} style={{
              width: '100%', padding: '10px', color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
            }}>Cancelar</button>
          </>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function labelStyle(typo, muted = false) {
  return {
    ...typo.caption,
    color: muted ? TOKENS.colors.textMuted : TOKENS.colors.text,
    display: 'block', marginBottom: 6, fontWeight: muted ? 500 : 700,
  }
}

const pageStyle = {
  minHeight: '100dvh',
  background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
}
const errorBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
}
const successBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)',
  textAlign: 'center',
}
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
}
const iconBtn = {
  width: 38, height: 38, borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
      * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
      button { border: none; background: none; cursor: pointer; }
      input, textarea { font-family: 'DM Sans', sans-serif; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
