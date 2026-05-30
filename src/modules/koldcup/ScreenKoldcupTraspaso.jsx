import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { buildKoldcupTransferPayload, getKoldcupDaySummary, transferKoldcupToEntregas } from './koldcupService'
import { normalizeKoldcupSummary } from './koldcupState'
import { todayLocal } from '../../lib/api'

function todayIso() {
  return todayLocal()
}

export default function ScreenKoldcupTraspaso() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const warehouseId = session?.warehouse_id || session?.plant_warehouse_id || 0
  const employeeId = session?.employee_id || 0

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSummary(normalizeKoldcupSummary(await getKoldcupDaySummary({ warehouseId, employeeId, date: todayIso() })))
    } catch (err) {
      setError(err.message || 'No se pudo cargar traspaso KOLDCUP')
      setSummary(normalizeKoldcupSummary(null))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, employeeId])

  useEffect(() => { loadData() }, [loadData])

  async function handleTransfer() {
    const safeSummary = summary || normalizeKoldcupSummary(null)
    if (!safeSummary.transfer.productId) {
      setError('No se puede crear traspaso: falta producto KOLDCUP en el resumen del backend.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await transferKoldcupToEntregas(buildKoldcupTransferPayload({
        warehouseId,
        employeeId,
        date: safeSummary.date || todayIso(),
        productId: safeSummary.transfer.productId,
        qty: safeSummary.inventory.finishedAvailableQty,
      }))
      setMessage('Traspaso KOLDCUP enviado a Entregas')
      await loadData()
    } catch (err) {
      setError(err.message ? `Configuracion o validacion: ${err.message}` : 'No se pudo crear traspaso KOLDCUP')
    } finally {
      setSaving(false)
    }
  }

  const safeSummary = summary || normalizeKoldcupSummary(null)
  const transferDone = ['done', 'completed', 'validated'].includes(safeSummary.transfer.state)

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 14 }}>
          <button onClick={() => navigate('/koldcup')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          </button>
          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Traspaso KOLDCUP</p>
        </div>

        {error ? <Message tone="error" text={error} typo={typo} /> : null}
        {message ? <Message tone="success" text={message} typo={typo} /> : null}

        <div style={{ padding: 16, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, boxShadow: TOKENS.shadow.md, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>DESTINO ENTREGAS GLACIEM</p>
          {loading ? <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Cargando traspaso...</p> : null}
          <Detail label="Estado" value={safeSummary.transfer.state} typo={typo} />
          <Detail label="Origen" value={safeSummary.transfer.originName || 'Configurado en backend'} typo={typo} />
          <Detail label="Destino" value={safeSummary.transfer.destinationName || 'Entregas Glaciem'} typo={typo} />
          <Detail label="Cantidad" value={`${safeSummary.inventory.finishedAvailableQty} vasos`} typo={typo} />
          {safeSummary.transfer.pickingName ? <Detail label="Folio" value={safeSummary.transfer.pickingName} typo={typo} /> : null}

          <button onClick={handleTransfer} disabled={saving || loading || transferDone} style={{ minHeight: 46, borderRadius: TOKENS.radius.pill, background: 'linear-gradient(90deg,#15499B,#2B8FE0)', color: '#fff', fontSize: 14, fontWeight: 800, opacity: saving || loading || transferDone ? 0.55 : 1 }}>
            {transferDone ? 'Traspaso completado' : saving ? 'Enviando...' : 'Enviar a Entregas'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, typo }) {
  return <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}` }}><p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{label}</p><p style={{ ...typo.body, color: TOKENS.colors.text, margin: '4px 0 0', fontWeight: 700 }}>{value || '-'}</p></div>
}

function Message({ tone, text, typo }) {
  const color = tone === 'success' ? TOKENS.colors.success : TOKENS.colors.error
  return <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: `${color}18`, border: `1px solid ${color}44`, marginBottom: 12 }}><p style={{ ...typo.caption, color, margin: 0, fontWeight: 700 }}>{text}</p></div>
}
