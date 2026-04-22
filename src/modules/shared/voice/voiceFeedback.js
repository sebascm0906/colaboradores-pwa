// voiceFeedback.js — envia diff AI vs humano a W122 /webhook/voice-feedback.
// Best-effort, no bloquea UX. Nunca lanza excepciones que rompan handleSubmit.

const FEEDBACK_URL = import.meta.env.VITE_N8N_VOICE_FEEDBACK_URL
const AUTH_TOKEN   = import.meta.env.VITE_N8N_VOICE_TOKEN

/**
 * @param {{trace_id:string, ai_output:object, final_output:object, metadata?:object}} payload
 */
export async function sendVoiceFeedback({ trace_id, ai_output, final_output, metadata = {} }) {
  if (!trace_id) return
  if (!FEEDBACK_URL || !AUTH_TOKEN) return
  try {
    await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        trace_id,
        ai_output,
        final_output,
        confirmed_at: new Date().toISOString(),
        metadata,
      }),
      keepalive: true,
    })
  } catch (err) {
    // Nunca bloquear el flujo por feedback
    console.warn('[voiceFeedback] fallo registro diff', err?.message || err)
  }
}
