import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { safeNumber } from '../../lib/safeNumber'
import { getCedisInventory, createScrap, getScrapHistory, getScrapReasons } from './entregasService'
import { sendVoiceFeedback } from '../shared/voice/voiceFeedback'
import VoiceInputButton from '../shared/voice/VoiceInputButton'
import { ScreenShell, ConfirmDialog } from './components'
import { logScreenError } from '../shared/logScreenError'
import { matchByKeyword } from '../shared/voice/voiceMatchers'

/* ============================================================================
   ScreenMerma — Register shrinkage / damaged products
   Catalogo de motivos viene de Odoo (gf.production.scrap.reason) via getScrapReasons()
   Voice-to-form (PoC Fase 0): VoiceInputButton -> W120 /voice-intake ->
   envelope.data hidrata el form. Al confirmar, sendVoiceFeedback -> W122.
============================================================================ */

// Mapea el enum `motivo` del LLM (W120 json_schema) al catalogo real de Odoo
// via substring case-insensitive sobre `reason.name`. Si no matchea, devuelve null
// y el usuario selecciona manualmente (el catalogo Odoo no cubre todos los enums).
const LLM_MOTIVO_KEYWORD = {
  derretimiento: 'derret',      // -> "Derretido"
  contaminacion: 'contamina',   // -> "Contaminado"
  golpe:         'roto',        // -> "Roto / dañado"
  // 'robo' y 'otro' no tienen match fiable en el catalogo actual
}

export default function ScreenMerma() {
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = Number(session?.warehouse_id || 0) || null
  const employeeId = Number(session?.employee_id || 0) || null

  // ── Inventory for product selector ────────────────────────────────────────
  const [inventory, setInventory] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)
  const [loadingInit, setLoadingInit] = useState(true)

  // ── Catalogo de motivos (dinamico desde Odoo) ─────────────────────────────
  const [reasons, setReasons] = useState([])

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [qty, setQty] = useState(1)
  // selectedReason guarda el objeto completo {id, name} para acceso al name en confirmacion
  const [selectedReason, setSelectedReason] = useState(null)
  const [notes, setNotes] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ── Validation ────────────────────────────────────────────────────────────
  const [validationErrors, setValidationErrors] = useState({})

  // ── History ───────────────────────────────────────────────────────────────
  const [history, setHistory] = useState([])

  // ── Success / error messages ──────────────────────────────────────────────
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ── Voice context (PoC Fase 0): captura el ultimo envelope de W120 ─────────
  // Se usa luego al confirmar para enviar diff AI vs humano a W122.
  const [voiceContext, setVoiceContext] = useState(null) // {trace_id, ai_output} | null
  const [voiceNote, setVoiceNote] = useState('')         // banner informativo

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoadingInit(true)
    try {
      const [inv, hist, reas] = await Promise.allSettled([
        getCedisInventory(warehouseId),
        getScrapHistory(warehouseId),
        getScrapReasons(),
      ])
      if (inv.status === 'fulfilled' && Array.isArray(inv.value)) {
        setInventory(inv.value)
      } else {
        if (inv.status === 'rejected') logScreenError('ScreenMerma', 'getCedisInventory', inv.reason)
        setInventory([])
      }
      if (hist.status === 'fulfilled' && Array.isArray(hist.value)) {
        setHistory(hist.value)
      } else {
        if (hist.status === 'rejected') logScreenError('ScreenMerma', 'getScrapHistory', hist.reason)
        setHistory([])
      }
      if (reas.status === 'fulfilled' && Array.isArray(reas.value)) {
        setReasons(reas.value)
      } else {
        if (reas.status === 'rejected') logScreenError('ScreenMerma', 'getScrapReasons', reas.reason)
        setReasons([])
      }
    } catch (e) { logScreenError('ScreenMerma', 'loadData', e) }
    finally { setLoadingInit(false) }
  }

  // ── Filtered product list ─────────────────────────────────────────────────
  const filteredProducts = productSearch
    ? inventory.filter(i => i.product?.toLowerCase().includes(productSearch.toLowerCase()))
    : inventory

  // ── Validation ────────────────────────────────────────────────────────────
  function validate() {
    const errs = {}
    if (!selectedProduct) errs.product = 'Selecciona un producto'
    if (!qty || qty <= 0) errs.qty = 'Cantidad debe ser mayor a 0'
    if (!selectedReason?.id) errs.reason = 'Selecciona un motivo'
    setValidationErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleOpenConfirm() {
    if (!validate()) return
    setConfirmOpen(true)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      // BLD-20260426-P0-MERMA: defensa contra falso éxito.
      // Backend (gf_logistics_ops /warehouse_scrap/create) responde con
      // HTTP 200 + {ok:false, message} ante errores de negocio (sin stock,
      // producto inválido, motivo inválido, etc.). Antes el code solo
      // manejaba try/catch, así que un response ok:false pasaba como éxito
      // y se mostraba "Merma registrada correctamente" en verde sin que
      // stock.scrap se hubiera creado en Odoo. Mismo patrón que ya
      // arreglamos en mostrador (PR #21) y devoluciones (PR #22).
      const result = await createScrap(
        warehouseId,
        employeeId,
        selectedProduct.product_id,
        qty,
        selectedReason.id,
        notes.trim() || undefined
      )

      if (result && result.ok === false) {
        // Log estructurado con contexto mínimo para diagnóstico en campo.
        logScreenError('ScreenMerma', 'scrap_create_rejected', {
          warehouse_id: warehouseId,
          employee_id: employeeId,
          product_id: selectedProduct.product_id,
          qty,
          reason_id: selectedReason.id,
          message: result.message || null,
        })
        setError(result.message || 'Backend rechazó la merma')
        setConfirmOpen(false)
        // NO success, NO clearForm, NO refresh history — el operador debe
        // corregir (típicamente bajar la qty o elegir otro producto) y
        // reintentar. Mantenemos el formulario tal cual lo dejó.
        return
      }

      // Voice feedback best-effort: dispara fire-and-forget a W122 si hubo voz previa.
      if (voiceContext?.trace_id) {
        sendVoiceFeedback({
          trace_id: voiceContext.trace_id,
          ai_output: voiceContext.ai_output || {},
          final_output: {
            product_id: selectedProduct.product_id,
            cantidad: qty,
            reason_id: selectedReason.id,
            reason_name: selectedReason.name,
            notes: notes.trim() || '',
          },
          metadata: {
            context_id: 'form_merma',
            plaza_id: session?.plaza_id || null,
            user_id: employeeId || null,
          },
        })
      }

      setSuccess('Merma registrada correctamente')
      clearForm()
      setConfirmOpen(false)
      // Refresh history
      const hist = await getScrapHistory(warehouseId).catch(() => [])
      setHistory(hist || [])
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setConfirmOpen(false)
      setError(e.message || 'Error al registrar merma')
    } finally { setSubmitting(false) }
  }

  // ── Voice-to-form handlers ────────────────────────────────────────────────
  function handleVoiceResult(envelope) {
    const d = envelope?.data || {}
    setError('')

    // Producto: matchea por product_id contra inventory; si no, usa raw_product_name
    // como search (el usuario elige manualmente). Nunca auto-selecciona un producto
    // que la IA no identifico con id valido.
    if (d.product_id) {
      const match = inventory.find((i) => i.product_id === d.product_id)
      if (match) {
        setSelectedProduct(match)
        setProductSearch(match.product || '')
        setShowProductList(false)
      } else {
        setSelectedProduct(null)
        setProductSearch(d.raw_product_name || '')
        setShowProductList(false)
      }
    } else if (d.raw_product_name) {
      setSelectedProduct(null)
      setProductSearch(d.raw_product_name)
      setShowProductList(false)
    }

    // Cantidad
    if (typeof d.cantidad === 'number' && d.cantidad > 0) {
      setQty(d.cantidad)
    }

    // Motivo: fuzzy-match enum LLM -> catalogo Odoo; si no matchea, deja null.
    const matchedReason = matchByKeyword(d.motivo, reasons, LLM_MOTIVO_KEYWORD)
    if (matchedReason) setSelectedReason(matchedReason)

    setValidationErrors({})

    // Guardar contexto para feedback al confirmar
    setVoiceContext({ trace_id: envelope.trace_id, ai_output: d })

    // Banner de revision (pregunta al humano)
    const confidence = envelope?.meta?.stt_confidence
    const transcript = envelope?.meta?.transcript
    const bits = []
    const confirmationText = envelope?.meta?.confirmation_text
    if (confirmationText) bits.push(confirmationText)
    else if (transcript) bits.push(`"${transcript}"`)
    if (typeof confidence === 'number') bits.push(`confianza ${(confidence * 100).toFixed(0)}%`)
    if (!matchedReason && d.motivo) bits.push(`motivo IA "${d.motivo}" sin match — selecciona manual`)
    if (!d.product_id && d.raw_product_name) bits.push('producto sin match — selecciona manual')
    setVoiceNote(bits.length ? `IA: ${bits.join(' · ')}` : 'IA proceso la voz — revisa y confirma')
  }

  function handleVoiceError(error_code, msg) {
    setError(`${error_code}: ${msg}`)
    setVoiceNote('')
    setTimeout(() => setError(''), 3500)
  }

  function clearForm() {
    setSelectedProduct(null)
    setProductSearch('')
    setQty(1)
    setSelectedReason(null)
    setNotes('')
    setValidationErrors({})
    setVoiceContext(null)
    setVoiceNote('')
  }

  function selectProduct(item) {
    setSelectedProduct(item)
    setProductSearch(item.product || '')
    setShowProductList(false)
    setValidationErrors(prev => ({ ...prev, product: undefined }))
  }

  const confirmMessage = selectedProduct
    ? `Registrar ${qty} kg de merma de ${selectedProduct.product} por ${selectedReason?.name || ''}?`
    : ''

  return (
    <ScreenShell title="Registrar Merma" backTo="/entregas">
      <style>{`
        @keyframes entregasMermaSpin { to { transform: rotate(360deg); } }
        input, textarea { font-family: 'DM Sans', sans-serif; }
      `}</style>

      {loadingInit ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'entregasMermaSpin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <>
          {/* Messages */}
          {error && (
            <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {success}
            </div>
          )}

          {/* ── Voice input (PoC Fase 0) ─────────────────────────────────── */}
          <div style={{ marginBottom: 12 }}>
            <VoiceInputButton
              context_id="form_merma"
              label="Manten presionado para dictar la merma"
              metadata={{
                plaza_id: session?.plaza_id || null,
                user_id: employeeId || null,
                canal: 'pwa_colaboradores',
              }}
              disabled={loadingInit || submitting}
              onResult={handleVoiceResult}
              onError={handleVoiceError}
            />
            {voiceNote && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.warningSoft, border: '1px solid rgba(245,158,11,0.25)',
              }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0 }}>
                  {voiceNote}
                </p>
              </div>
            )}
          </div>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <div style={{ padding: 18, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, marginBottom: 20 }}>

            {/* Product selector */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>Producto</p>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductList(true); setSelectedProduct(null) }}
                  onFocus={() => setShowProductList(true)}
                  placeholder="Buscar producto..."
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${validationErrors.product ? TOKENS.colors.error : TOKENS.colors.border}`,
                    color: 'white', fontSize: 14, outline: 'none',
                  }}
                />
                {showProductList && filteredProducts.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    maxHeight: 200, overflowY: 'auto',
                    borderRadius: TOKENS.radius.md, background: TOKENS.colors.bg1,
                    border: `1px solid ${TOKENS.colors.border}`, boxShadow: TOKENS.shadow.md,
                    marginTop: 4,
                  }}>
                    {filteredProducts.slice(0, 20).map((item, i) => (
                      <button
                        key={item.product_id || i}
                        onClick={() => selectProduct(item)}
                        style={{
                          width: '100%', padding: '10px 14px', textAlign: 'left',
                          background: 'transparent',
                          borderBottom: i < Math.min(filteredProducts.length, 20) - 1 ? `1px solid ${TOKENS.colors.border}` : 'none',
                        }}
                      >
                        <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{item.product}</p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                          Stock: {item.quantity} &middot; {(item.total_kg || item.quantity * (item.weight || 1)).toFixed(0)} kg
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedProduct && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: TOKENS.radius.sm, background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.15)' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.blue3, margin: 0, fontWeight: 600 }}>{selectedProduct.product}</p>
                </div>
              )}
              {validationErrors.product && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.product}</p>}
            </div>

            {/* Quantity input with +/- */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>Cantidad (kg)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button
                  onClick={() => setQty(prev => Math.max(0.5, (prev || 1) - 0.5))}
                  style={{
                    width: 48, height: 48, borderRadius: `${TOKENS.radius.md}px 0 0 ${TOKENS.radius.md}px`,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 20, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  -
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={qty}
                  onChange={e => setQty(safeNumber(e.target.value, { min: 0 }))}
                  style={{
                    flex: 1, height: 48, padding: '0 12px', textAlign: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${validationErrors.qty ? TOKENS.colors.error : TOKENS.colors.border}`,
                    borderLeft: 'none', borderRight: 'none',
                    color: 'white', fontSize: 18, fontWeight: 700, outline: 'none',
                  }}
                />
                <button
                  onClick={() => setQty(prev => (prev || 0) + 0.5)}
                  style={{
                    width: 48, height: 48, borderRadius: `0 ${TOKENS.radius.md}px ${TOKENS.radius.md}px 0`,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 20, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  +
                </button>
              </div>
              {validationErrors.qty && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.qty}</p>}
            </div>

            {/* Reason buttons (catalogo dinamico desde Odoo) */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px', fontWeight: 600 }}>Motivo</p>
              {reasons.length === 0 ? (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sin motivos disponibles. Verifica conexion con Odoo.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {reasons.map(reason => {
                    const active = selectedReason?.id === reason.id
                    return (
                      <button
                        key={reason.id}
                        onClick={() => { setSelectedReason(reason); setValidationErrors(prev => ({ ...prev, reason: undefined })) }}
                        style={{
                          padding: '10px 14px', borderRadius: TOKENS.radius.md,
                          background: active ? 'rgba(43,143,224,0.15)' : TOKENS.colors.surfaceSoft,
                          border: `1.5px solid ${active ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                          color: active ? TOKENS.colors.blue3 : TOKENS.colors.textSoft,
                          fontSize: 13, fontWeight: 600,
                          transition: `all ${TOKENS.motion.fast}`,
                        }}
                      >
                        {reason.name}
                      </button>
                    )
                  })}
                </div>
              )}
              {validationErrors.reason && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.reason}</p>}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>
                Notas (opcional)
              </p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Detalle adicional..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${validationErrors.notes ? TOKENS.colors.error : TOKENS.colors.border}`,
                  color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
                }}
              />
              {validationErrors.notes && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.notes}</p>}
            </div>

            {/* Submit */}
            <button
              onClick={handleOpenConfirm}
              disabled={submitting}
              style={{
                width: '100%', padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'linear-gradient(90deg, #f59e0b, #d97706)', color: 'white',
                fontSize: 15, fontWeight: 600, opacity: submitting ? 0.6 : 1,
                boxShadow: '0 10px 24px rgba(245,158,11,0.25)',
              }}
            >
              {submitting ? 'Registrando...' : 'Registrar Merma'}
            </button>
          </div>

          {/* ── History section ───────────────────────────────────────────── */}
          <div>
            <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, marginBottom: 10 }}>MERMA DEL DIA</p>
            {history.length === 0 ? (
              <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin mermas registradas hoy</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((item, i) => (
                  <div key={item.id || i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: TOKENS.radius.md,
                    background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{item.product || 'Producto'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                        {item.reason || item.reason_tag || '—'} &middot; {item.time || item.create_date || ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.warning, flexShrink: 0, marginLeft: 8 }}>
                      {item.qty ?? item.quantity ?? 0} kg
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Confirm dialog ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title="Registrar merma"
        message={confirmMessage}
        confirmLabel="Registrar"
        variant="danger"
        onConfirm={handleSubmit}
        onCancel={() => setConfirmOpen(false)}
        loading={submitting}
      />
    </ScreenShell>
  )
}
