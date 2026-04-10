import { useState, useRef } from 'react'
import { TOKENS } from '../../../tokens'

/* ============================================================================
   ProductRow — Product line with quantity, used in inventory/handover/merma
============================================================================ */

export default function ProductRow({
  product,
  qty,
  unit = 'kg',
  extra,
  extraColor,
  editable = false,
  onQtyChange,
  typo,
}) {
  const t = typo || {}
  const bodyStyle = t.body || { fontSize: 14, fontWeight: 500 }
  const captionStyle = t.caption || { fontSize: 12, fontWeight: 500 }

  const [editing, setEditing] = useState(false)
  const [localQty, setLocalQty] = useState(String(qty ?? ''))
  const inputRef = useRef(null)

  function handleStartEdit() {
    if (!editable) return
    setLocalQty(String(qty ?? ''))
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleBlur() {
    setEditing(false)
    const parsed = parseFloat(localQty)
    if (!isNaN(parsed) && parsed !== qty) {
      onQtyChange?.(parsed)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.target.blur()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '12px 14px',
        borderRadius: TOKENS.radius.sm,
        background: TOKENS.colors.surface,
        border: `1px solid ${TOKENS.colors.border}`,
        transition: `background ${TOKENS.motion.fast}`,
      }}
    >
      {/* Product name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            ...bodyStyle,
            color: TOKENS.colors.text,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {product}
        </span>
        {extra && (
          <span
            style={{
              ...captionStyle,
              color: extraColor || TOKENS.colors.textMuted,
              display: 'block',
              marginTop: 2,
            }}
          >
            {extra}
          </span>
        )}
      </div>

      {/* Quantity */}
      <div
        onClick={handleStartEdit}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
          flexShrink: 0,
          cursor: editable ? 'pointer' : 'default',
          padding: editable ? '4px 8px' : 0,
          borderRadius: editable ? TOKENS.radius.sm : 0,
          background: editable ? 'rgba(43,143,224,0.08)' : 'transparent',
          border: editable ? `1px solid rgba(43,143,224,0.15)` : 'none',
          minWidth: 60,
          justifyContent: 'flex-end',
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            value={localQty}
            onChange={(e) => setLocalQty(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              width: 60,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: TOKENS.colors.text,
              fontSize: bodyStyle.fontSize,
              fontWeight: 700,
              textAlign: 'right',
              padding: 0,
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <span
            style={{
              ...bodyStyle,
              color: TOKENS.colors.text,
              fontWeight: 700,
            }}
          >
            {qty != null ? qty : '—'}
          </span>
        )}
        <span
          style={{
            ...captionStyle,
            color: TOKENS.colors.textMuted,
          }}
        >
          {unit}
        </span>
      </div>
    </div>
  )
}
