import { TOKENS } from '../../../tokens'

/* ============================================================================
   ConfirmDialog — Modal overlay for double-confirmation of critical actions
============================================================================ */

export default function ConfirmDialog({
  open,
  title = 'Confirmar',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
  children,
}) {
  if (!open) return null

  const isDanger = variant === 'danger'
  const confirmBg = isDanger ? TOKENS.colors.error : TOKENS.colors.blue2
  const confirmBgHover = isDanger ? '#dc2626' : '#1a7fd4'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel?.()
      }}
    >
      <style>{`@keyframes entregasDialogIn { from { opacity:0; transform: scale(0.92) translateY(12px); } to { opacity:1; transform: scale(1) translateY(0); } } @keyframes entregasSpin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel,
          backgroundColor: TOKENS.colors.bg1,
          border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: TOKENS.shadow.lg,
          padding: 24,
          animation: 'entregasDialogIn 220ms ease',
        }}
      >
        {/* Title */}
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: 18,
            fontWeight: 700,
            color: TOKENS.colors.text,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p
            style={{
              margin: children ? '0 0 14px 0' : '0 0 24px 0',
              fontSize: 14,
              fontWeight: 500,
              color: TOKENS.colors.textSoft,
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        )}

        {children && (
          <div style={{ marginBottom: 20 }}>
            {children}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              height: 48,
              borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: `opacity ${TOKENS.motion.fast}`,
            }}
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              height: 48,
              borderRadius: TOKENS.radius.md,
              background: confirmBg,
              border: 'none',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.85 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: `background ${TOKENS.motion.fast}`,
              boxShadow: `0 4px 14px ${confirmBg}44`,
            }}
          >
            {loading && (
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid #fff',
                  borderRadius: '50%',
                  animation: 'entregasSpin 0.7s linear infinite',
                  flexShrink: 0,
                }}
              />
            )}
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
