// ─── PhotoCapture — captura y sube evidencia fotográfica ─────────────────────
//
// Uso básico (solo preview, sin upload):
//   <PhotoCapture value={base64} onChange={setBase64} />
//
// Uso con upload a backend:
//   <PhotoCapture
//     value={base64}
//     onChange={setBase64}
//     onUploadComplete={({ attachment_id, url }) => setAttachmentId(attachment_id)}
//     linkedModel="hr.expense"
//     linkedId={expenseId}
//     label="Comprobante"
//     required
//   />
//
// Si se pasan `onUploadComplete` + `linkedModel`, el componente llama a
// POST /pwa/evidence/upload automáticamente tras seleccionar la foto.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import { TOKENS } from '../tokens'
import { api } from '../lib/api'

export default function PhotoCapture({
  value,
  onChange,
  onUploadComplete,   // ({ attachment_id, url }) — llamado tras subir al backend
  linkedModel,        // 'hr.expense' | 'gf.cash.closing' | etc.
  linkedId,           // res_id para ligar el attachment
  label = 'Adjuntar foto',
  required = false,
  maxSizeKB = 2048,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setUploadDone(false)

    if (file.size > maxSizeKB * 1024) {
      setError(`La foto debe ser menor a ${maxSizeKB / 1024}MB`)
      e.target.value = ''
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes')
      e.target.value = ''
      return
    }

    setLoading(true)
    try {
      const base64 = await fileToBase64(file)

      // Siempre actualizar preview local
      onChange?.(base64)

      // Si hay handler de upload, subir al backend
      if (onUploadComplete) {
        try {
          const result = await api('POST', '/pwa/evidence/upload', {
            filename:     file.name || 'foto.jpg',
            data:         base64.split(',')[1] ?? base64,  // strip data:image/...;base64,
            mime_type:    file.type,
            linked_model: linkedModel || undefined,
            linked_id:    linkedId    || undefined,
          })
          const payload = result?.data ?? result ?? {}
          if (payload.attachment_id) {
            setUploadDone(true)
            onUploadComplete({ attachment_id: payload.attachment_id, url: payload.url })
          } else {
            setError('La foto se tomó pero no se pudo guardar en servidor.')
          }
        } catch (uploadErr) {
          setError('No se pudo subir la foto al servidor. Intenta de nuevo.')
        }
      }
    } catch (err) {
      setError('No se pudo procesar la foto')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(file)
    })
  }

  function clearPhoto() {
    onChange?.(null)
    onUploadComplete?.({ attachment_id: null, url: null })
    setError('')
    setUploadDone(false)
  }

  const hasPhoto = !!value

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: TOKENS.colors.textLow, textTransform: 'uppercase' }}>
          {label} {required && <span style={{ color: TOKENS.colors.error }}>*</span>}
        </label>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        disabled={disabled || loading}
        style={{ display: 'none' }}
      />

      {hasPhoto ? (
        <div style={{
          position: 'relative',
          borderRadius: TOKENS.radius.md,
          overflow: 'hidden',
          border: `1px solid ${uploadDone ? TOKENS.colors.success || '#22c55e' : TOKENS.colors.border}`,
        }}>
          <img
            src={value}
            alt="Evidencia"
            style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
          />
          {uploadDone && (
            <div style={{
              position: 'absolute', top: 8, left: 8,
              background: '#22c55e', color: 'white',
              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
            }}>
              ✓ Guardada
            </div>
          )}
          <button
            type="button"
            onClick={clearPhoto}
            disabled={disabled}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white',
              fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || loading}
          style={{
            padding: '20px 16px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px dashed ${TOKENS.colors.border}`,
            color: TOKENS.colors.textMuted,
            fontSize: 13, fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: disabled ? 0.5 : 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <span style={{ fontSize: 18 }}>{loading ? '⏳' : '📷'}</span>
          <span>{loading ? (onUploadComplete ? 'Subiendo...' : 'Procesando...') : 'Tomar foto / Seleccionar'}</span>
        </button>
      )}

      {error && (
        <p style={{ color: TOKENS.colors.error, fontSize: 12, margin: 0 }}>{error}</p>
      )}
    </div>
  )
}
