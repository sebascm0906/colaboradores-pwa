import { useCallback, useRef, useState } from 'react'
import { TOKENS } from '../../../tokens'

/* ============================================================================
   VoiceInputButton — Push-to-talk hacia n8n W120 voice-intake.

   Flujo: pointerdown -> MediaRecorder start -> pointerup -> stop ->
          POST audio/webm al webhook -> parse envelope -> onResult/onError.

   Envelope esperado (W120):
     ok:true   -> onResult(envelope)
     ok:false  -> onError(error_code, msg)
   Timeouts: 15s para la llamada; frontend rechaza <500ms o >1MB.
============================================================================ */

const S = {
  IDLE: 'idle',
  RECORDING: 'recording',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
}

const ERROR_MESSAGES = {
  AUTH_FAILED:            'Sesion expirada, recarga la app',
  MIC_PERMISSION_DENIED:  'Permite el microfono en la configuracion del navegador',
  AUDIO_TOO_SHORT:        'Audio demasiado corto',
  AUDIO_TOO_LARGE:        'Audio muy largo, max 10 segundos',
  STT_LOW_CONFIDENCE:     'No se entendio bien, intenta de nuevo',
  STT_EMPTY:              'No detecte voz, intenta de nuevo',
  CATALOG_UNAVAILABLE:    'Captura manual por ahora',
  EMPTY_CATALOG:          'Catalogo no cargado, intenta de nuevo',
  MODE_CATEGORY_MISMATCH: 'La categoria no coincide con el tipo, intenta otra vez',
  LLM_TIMEOUT:            'Servicio lento, intenta otra vez',
  VALIDATION_FAILED:      'Revisa los datos manualmente',
  INTERNAL_ERROR:         'Error, reporta a soporte',
}

const WEBHOOK_URL = import.meta.env.VITE_N8N_VOICE_WEBHOOK_URL
const AUTH_TOKEN  = import.meta.env.VITE_N8N_VOICE_TOKEN

export default function VoiceInputButton({
  context_id,
  onResult,
  onError,
  metadata = {},
  disabled = false,
  label = 'Manten presionado para hablar',
}) {
  const [state, setState] = useState(S.IDLE)
  const [userMsg, setUserMsg] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const startedAtRef = useRef(null)

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const reportError = useCallback((error_code, fallbackMsg, envelope = null) => {
    const msg = ERROR_MESSAGES[error_code] || fallbackMsg || 'Error desconocido'
    setUserMsg(msg)
    setState(S.ERROR)
    // Tercer arg (envelope) permite al padre rescatar el transcript cuando STT
    // funciono pero el parser del context_id fallo (p.ej. VALIDATION_FAILED).
    // Consumidores antiguos que aceptan solo (code, msg) ignoran el extra sin romperse.
    onError?.(error_code, msg, envelope)
    setTimeout(() => setState(S.IDLE), 2500)
  }, [onError])

  const uploadAudio = useCallback(async (blob, mimeType) => {
    if (!WEBHOOK_URL || !AUTH_TOKEN) {
      reportError('INTERNAL_ERROR', 'Configuracion de voz ausente (.env.local)')
      return
    }
    if (blob.size > 1_000_000) { reportError('AUDIO_TOO_LARGE'); return }
    setState(S.UPLOADING)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const fd = new FormData()
      // Extensión derivada del mimeType real para que Deepgram detecte correctamente.
      // iOS Safari no soporta audio/webm — graba en audio/mp4 (AAC).
      const ext = (mimeType || '').includes('mp4') ? 'mp4'
        : (mimeType || '').includes('mpeg') ? 'mp3'
        : 'webm'
      fd.append('audio', blob, `voice_${context_id}_${Date.now()}.${ext}`)
      fd.append('context_id', context_id)
      fd.append('timestamp', new Date().toISOString())
      fd.append('metadata', JSON.stringify(metadata))
      setState(S.PROCESSING)
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        body: fd,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const envelope = await res.json().catch(() => null)
      if (!envelope || typeof envelope !== 'object') {
        reportError('INTERNAL_ERROR', 'Respuesta no valida')
        return
      }
      if (!envelope.ok) {
        reportError(envelope.error_code || 'INTERNAL_ERROR', envelope.error_message, envelope)
        return
      }
      setState(S.SUCCESS)
      onResult?.(envelope)
      setTimeout(() => setState(S.IDLE), 700)
    } catch (err) {
      clearTimeout(timeoutId)
      if (err?.name === 'AbortError') reportError('LLM_TIMEOUT')
      else reportError('INTERNAL_ERROR', err?.message)
    }
  }, [context_id, metadata, onResult, reportError])

  const startRecording = useCallback(async () => {
    if (disabled || state === S.RECORDING) return
    setUserMsg(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream
      // Orden de preferencia: webm+opus (Chrome/Firefox/Android Chrome) → mp4/AAC (Safari iOS)
      // → webm simple → default del browser (último recurso).
      // typeof MediaRecorder.isTypeSupported guard porque algunos browsers viejos no lo tienen.
      const isSupported = (t) => {
        try { return typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t) }
        catch { return false }
      }
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/webm',
      ]
      const mimeType = candidates.find(isSupported) || ''
      let rec
      try {
        rec = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream) // fallback sin mimeType: browser escoge
      } catch (e) {
        cleanup()
        reportError('INTERNAL_ERROR', 'Tu navegador no soporta grabacion de audio')
        return
      }
      // mimeType efectivo (puede diferir si el browser eligio en el fallback sin mimeType)
      const effectiveMimeType = rec.mimeType || mimeType || 'audio/webm'
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      rec.onstop = async () => {
        const duration = Date.now() - startedAtRef.current
        // Snapshot de los chunks ANTES de cleanup — cleanup resetea chunksRef.current a [].
        const chunks = chunksRef.current
        cleanup()
        if (duration < 500) { reportError('AUDIO_TOO_SHORT'); return }
        const blob = new Blob(chunks, { type: effectiveMimeType })
        await uploadAudio(blob, effectiveMimeType)
      }
      startedAtRef.current = Date.now()
      rec.start()
      recorderRef.current = rec
      setState(S.RECORDING)
    } catch (err) {
      cleanup()
      if (err?.name === 'NotAllowedError') reportError('MIC_PERMISSION_DENIED')
      else reportError('INTERNAL_ERROR', err?.message)
    }
  }, [disabled, state, cleanup, uploadAudio, reportError])

  const stopRecording = useCallback(() => {
    if (state !== S.RECORDING) return
    try { recorderRef.current?.stop() }
    catch { cleanup(); setState(S.IDLE) }
  }, [state, cleanup])

  const busy = state === S.UPLOADING || state === S.PROCESSING
  const labels = {
    [S.IDLE]:       label,
    [S.RECORDING]:  'Grabando... suelta para enviar',
    [S.UPLOADING]:  'Enviando audio...',
    [S.PROCESSING]: 'Procesando...',
    [S.SUCCESS]:    'Listo',
    [S.ERROR]:      userMsg || 'Error',
  }

  // Color por estado (usa TOKENS para consistencia)
  const colorByState = {
    [S.IDLE]:       { bg: 'linear-gradient(90deg, #15499B, #2B8FE0)', border: 'rgba(97,178,255,0.35)' },
    [S.RECORDING]:  { bg: '#DC2626', border: 'rgba(239,68,68,0.55)' },
    [S.UPLOADING]:  { bg: '#2563EB', border: 'rgba(43,143,224,0.45)' },
    [S.PROCESSING]: { bg: '#2563EB', border: 'rgba(43,143,224,0.45)' },
    [S.SUCCESS]:    { bg: '#16A34A', border: 'rgba(34,197,94,0.45)' },
    [S.ERROR]:      { bg: '#F59E0B', border: 'rgba(245,158,11,0.55)' },
  }
  const { bg, border } = colorByState[state]

  return (
    <>
      <style>{`
        @keyframes voiceBtnPulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.55)} 50%{box-shadow:0 0 0 12px rgba(220,38,38,0)} }
        @keyframes voiceBtnSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .voice-btn-pulse { animation: none !important; }
          .voice-btn-spin  { animation: none !important; }
        }
      `}</style>
      <button
        type="button"
        disabled={disabled || busy}
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        onPointerCancel={stopRecording}
        aria-pressed={state === S.RECORDING}
        aria-label={`Captura por voz: ${context_id}`}
        className={state === S.RECORDING ? 'voice-btn-pulse' : undefined}
        style={{
          width: '100%',
          minHeight: 56,
          padding: '14px 18px',
          borderRadius: TOKENS.radius.lg,
          background: bg,
          border: `1.5px solid ${border}`,
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '0.01em',
          cursor: disabled || busy ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: state === S.IDLE ? TOKENS.shadow.blue : 'none',
          transition: `background ${TOKENS.motion.fast}, border-color ${TOKENS.motion.fast}`,
          animation: state === S.RECORDING ? 'voiceBtnPulse 1.2s ease-out infinite' : undefined,
        }}
      >
        {busy && (
          <span
            className="voice-btn-spin"
            style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.35)',
              borderTopColor: '#FFFFFF',
              animation: 'voiceBtnSpin 0.8s linear infinite',
            }}
          />
        )}
        <span aria-hidden="true" style={{ fontSize: 18 }}>
          {state === S.RECORDING ? '⏺' : state === S.SUCCESS ? '✓' : state === S.ERROR ? '⚠' : '🎤'}
        </span>
        <span>{labels[state]}</span>
      </button>
    </>
  )
}
