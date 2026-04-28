export const ADMIN_THEME_SCOPE_STYLE = Object.freeze({
  minHeight: '100dvh',
  background: '#05070a',
  filter: 'invert(1) hue-rotate(180deg)',
  isolation: 'isolate',
})

export function getAdminThemeScopeStyle(overrides = {}) {
  return {
    ...ADMIN_THEME_SCOPE_STYLE,
    ...overrides,
  }
}
