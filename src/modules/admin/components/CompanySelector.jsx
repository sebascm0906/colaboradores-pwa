// ─── CompanySelector — dropdown persistente de razón social ─────────────────
// Componente crítico: vive en el top bar de AdminShell y controla el company_id
// global del rol. Al cambiar, persiste el valor en el AdminContext y a través
// de éste en session.company_id → localStorage → headers de api.js.
import { useState, useRef, useEffect } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'

export default function CompanySelector() {
  const { companyId, companyLabel, availableCompanies, setCompanyId } = useAdmin()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface,
          border: `1px solid ${open ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
          color: TOKENS.colors.text, fontSize: 13, fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          minWidth: 180,
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: TOKENS.colors.blue3, flexShrink: 0,
        }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{companyLabel}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 1000,
          minWidth: 260, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.bg1, border: `1px solid ${TOKENS.colors.borderBlue}`,
          boxShadow: TOKENS.shadow.lg, padding: 6,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, padding: '8px 10px 4px', margin: 0,
          }}>
            RAZÓN SOCIAL
          </p>
          {availableCompanies.map(co => {
            const active = co.id === companyId
            return (
              <button
                key={co.id}
                onClick={() => { setCompanyId(co.id); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                  background: active ? `${TOKENS.colors.blue2}22` : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${active ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {active && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TOKENS.colors.blue2 }} />
                  )}
                </div>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 600,
                  color: active ? TOKENS.colors.text : TOKENS.colors.textSoft,
                }}>
                  {co.name}
                </span>
                <span style={{ fontSize: 10, color: TOKENS.colors.textLow }}>#{co.id}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
