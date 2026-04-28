import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { useSession } from '../../App'
import { logScreenError } from '../shared/logScreenError'
import { getShiftOverview } from './rolitoService'
import {
  buildBagReturnDeclarationSummary,
  buildRolitoBagDeclarationItems,
  computeRolitoBagDeclarationTotals,
  normalizeBagCount,
  saveBagReturnDeclaration,
} from './bagReturnDeclarationStore'

export default function ScreenDeclaracionBolsas() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useSession()
  const backTo = location.state?.backTo || '/produccion/cierre'
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const employeeId = Number(session?.employee_id || 0) || 0

  const [shift, setShift] = useState(null)
  const [items, setItems] = useState([])
  const [manualSummary, setManualSummary] = useState({
    bagsReceived: normalizeBagCount(location.state?.bagsReceived),
    bagsUsed: normalizeBagCount(location.state?.bagsUsed),
    bagsRemaining: normalizeBagCount(location.state?.bagsRemaining),
  })
  const [damagedByKey, setDamagedByKey] = useState({})
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successSummary, setSuccessSummary] = useState(null)

  useEffect(() => {
    if (!employeeId) {
      setError('Sin empleado en sesión')
      setLoading(false)
      return
    }

    let alive = true
    async function load() {
      try {
        setError('')
        const overview = await getShiftOverview()
        if (!alive) return
        if (!overview?.shift?.id) {
          setError('Sin turno activo para declarar bolsas')
          setLoading(false)
          return
        }

        const declarationItems = buildRolitoBagDeclarationItems(overview.bagMaterials || [])
        setShift(overview.shift)
        setItems(declarationItems)

        const totalReceived = declarationItems.reduce((sum, item) => sum + normalizeBagCount(item.issued), 0)
        const totalUsed = normalizeBagCount(
          manualSummary.bagsUsed
          || (overview.packing || []).reduce((sum, entry) => sum + (Number(entry.qty_bags) || 0), 0)
        )
        const systemRemaining = declarationItems.reduce((sum, item) => sum + normalizeBagCount(item.remaining), 0)
        const nextReceived = normalizeBagCount(manualSummary.bagsReceived || totalReceived)
        const nextRemaining = normalizeBagCount(manualSummary.bagsRemaining || systemRemaining)

        setManualSummary({
          bagsReceived: nextReceived,
          bagsUsed: totalUsed,
          bagsRemaining: nextRemaining,
        })
      } catch (e) {
        logScreenError('ScreenDeclaracionBolsas', 'load', e)
        if (alive) setError(e?.message || 'Error cargando devolución de bolsas')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => { alive = false }
  }, [employeeId])

  const totals = useMemo(
    () => computeRolitoBagDeclarationTotals(items, damagedByKey),
    [items, damagedByKey]
  )

  const declaredSobrantes = normalizeBagCount(manualSummary.bagsRemaining)
  const systemRemaining = totals.totalRemaining
  const totalDamaged = totals.totalDamaged
  const totalReturned = totals.totalReturned
  const mismatchManualVsSystem = declaredSobrantes > 0 && declaredSobrantes !== systemRemaining
  const canSubmit = Boolean(
    shift?.id
    && employeeId
    && items.length > 0
    && !submitting
    && totalDamaged <= systemRemaining
  )

  function updateDamaged(key, value) {
    setDamagedByKey((prev) => ({
      ...prev,
      [key]: normalizeBagCount(value),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError('')

    try {
      const summary = buildBagReturnDeclarationSummary({
        shiftId: shift.id,
        bagsReceived: manualSummary.bagsReceived,
        bagsUsed: manualSummary.bagsUsed,
        bagsRemaining: manualSummary.bagsRemaining,
        totalDamaged,
        totalReturned,
        notes,
        lines: totals.lines.map((line) => ({
          key: line.key,
          name: line.name,
          issued: line.issued,
          consumed: line.qty_consumed,
          remaining: line.remaining,
          damaged: line.damaged,
          returned: line.returned,
          material_id: line.material_id,
          settlement_id: line.settlement_id,
          issue_id: line.issue_id,
          product_id: line.product_id,
        })),
      })
      saveBagReturnDeclaration(shift, summary)
      setSuccessSummary(summary)
    } catch (e) {
      logScreenError('ScreenDeclaracionBolsas', 'handleSubmit', e)
      setError(e?.message || 'Error al declarar devolución de bolsas')
    } finally {
      setSubmitting(false)
    }
  }

  if (successSummary) {
    return (
      <PageShell typo={typo} title="Declaración de Bolsas" navigate={navigate}>
        <SuccessState
          typo={typo}
          label="Devolución declarada"
          sub={`Regresan ${successSummary.total_returned} bolsas útiles y ${successSummary.total_damaged} quedan como merma`}
          onBack={() => navigate(backTo, {
            replace: true,
            state: { bagDeclarationUpdatedAt: Date.now() },
          })}
        />
      </PageShell>
    )
  }

  return (
    <PageShell typo={typo} title="Declaración de Bolsas" navigate={navigate}>
      {loading && <Spinner />}

      {!loading && error && (
        <ErrorBanner message={error} typo={typo} />
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          typo={typo}
          title="Sin materiales de bolsas pendientes"
          body="No encontramos bolsas MP activas para este turno. Si ya se consumieron o devolvieron, puedes volver al cierre."
        />
      )}

      {!loading && !error && items.length > 0 && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SummaryCard
            typo={typo}
            bagsReceived={manualSummary.bagsReceived}
            bagsUsed={manualSummary.bagsUsed}
            bagsRemaining={manualSummary.bagsRemaining}
            totalDamaged={totalDamaged}
            totalReturned={totalReturned}
          />

          {mismatchManualVsSystem && (
            <WarningBanner
              typo={typo}
              title="El conteo del cierre no coincide con el saldo del sistema"
              body={`En cierre capturaste ${declaredSobrantes} sobrantes, pero los materiales activos del turno suman ${systemRemaining}. La devolución real se calculará con el saldo del sistema para no romper inventario.`}
            />
          )}

          <div>
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>DECLARACIÓN POR PRODUCTO MP</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {totals.lines.map((item) => (
                <div
                  key={item.key}
                  style={{
                    padding: '14px 16px',
                    borderRadius: TOKENS.radius.lg,
                    background: TOKENS.glass.panel,
                    border: `1px solid ${TOKENS.colors.border}`,
                  }}
                >
                  <p style={{ ...typo.body, color: TOKENS.colors.text, margin: '0 0 6px', fontWeight: 700 }}>
                    {item.name}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 10px' }}>
                    Entregadas {item.issued} · Usadas {item.qty_consumed} · Sobrantes {item.remaining}
                  </p>

                  <label style={{ ...typo.caption, color: TOKENS.colors.textLow, display: 'block', marginBottom: 6 }}>
                    Bolsas rotas / merma
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={item.remaining}
                    inputMode="numeric"
                    value={damagedByKey[item.key] ?? ''}
                    onChange={(event) => updateDamaged(item.key, event.target.value)}
                    placeholder="0"
                    style={numberInputStyle}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Regresa al gerente</span>
                    <span style={{ ...typo.caption, color: TOKENS.colors.success, fontWeight: 700 }}>
                      {item.returned} bolsas
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
              Notas (opcional)
            </label>
            <textarea
              placeholder="Observaciones sobre bolsas dañadas o devolución..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              style={textAreaStyle}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: TOKENS.radius.lg,
              background: canSubmit ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
              color: canSubmit ? 'white' : TOKENS.colors.textLow,
              fontSize: 16,
              fontWeight: 700,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Declarando...' : 'CONFIRMAR DEVOLUCIÓN Y MERMA'}
          </button>
        </form>
      )}
    </PageShell>
  )
}

function PageShell({ typo, title, navigate, children }) {
  return (
    <div style={pageStyle}>
      <style>{globalCss}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate(-1)} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>{title}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function SummaryCard({ typo, bagsReceived, bagsUsed, bagsRemaining, totalDamaged, totalReturned }) {
  return (
    <div style={{
      padding: '16px',
      borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.hero,
      border: `1px solid ${TOKENS.colors.borderBlue}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>RESUMEN DE CIERRE</p>
      <Row label="Bolsas recibidas" value={bagsReceived} typo={typo} />
      <Row label="Bolsas usadas" value={bagsUsed} typo={typo} />
      <Row label="Bolsas sobrantes" value={bagsRemaining} typo={typo} />
      <Row label="Merma declarada" value={totalDamaged} typo={typo} accent={TOKENS.colors.warning} />
      <Row label="Devolución real" value={totalReturned} typo={typo} accent={TOKENS.colors.success} />
    </div>
  )
}

function Row({ label, value, typo, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{label}</span>
      <span style={{ ...typo.caption, color: accent || TOKENS.colors.textSoft, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

function ErrorBanner({ message, typo }) {
  return (
    <div style={{
      padding: '16px', borderRadius: TOKENS.radius.lg,
      background: `${TOKENS.colors.error}14`, border: `1px solid ${TOKENS.colors.error}30`,
    }}>
      <p style={{ ...typo.body, color: TOKENS.colors.error, margin: 0 }}>{message}</p>
    </div>
  )
}

function WarningBanner({ title, body, typo }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: TOKENS.radius.lg,
      background: `${TOKENS.colors.warning}14`,
      border: `1px solid ${TOKENS.colors.warning}30`,
    }}>
      <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: '0 0 6px', fontWeight: 700 }}>{title}</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{body}</p>
    </div>
  )
}

function EmptyState({ typo, title, body }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 56 }}>
      <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: '0 0 8px' }}>{title}</p>
      <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>{body}</p>
    </div>
  )
}

function SuccessState({ typo, label, sub, onBack }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 48 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: `${TOKENS.colors.success}20`, border: `1px solid ${TOKENS.colors.success}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 6px' }}>{label}</p>
      <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: '0 0 24px' }}>{sub}</p>
      <button
        onClick={onBack}
        style={{
          width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          ...typo.title, color: TOKENS.colors.text, cursor: 'pointer',
        }}
      >
        Volver al cierre
      </button>
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
  paddingTop: 'env(safe-area-inset-top)',
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const numberInputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface,
  border: `1px solid ${TOKENS.colors.border}`,
  color: TOKENS.colors.text,
  fontSize: 18,
  fontWeight: 600,
}

const textAreaStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface,
  border: `1px solid ${TOKENS.colors.border}`,
  color: TOKENS.colors.text,
  fontSize: 14,
  resize: 'none',
}

const iconBtn = {
  width: 38,
  height: 38,
  borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface,
  border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
  button { border: none; background: none; cursor: pointer; }
  input, textarea { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
  @keyframes spin { to { transform: rotate(360deg); } }
`
