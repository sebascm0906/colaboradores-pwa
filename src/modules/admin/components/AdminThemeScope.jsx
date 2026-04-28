import { Outlet } from 'react-router-dom'
import { getAdminThemeScopeStyle } from '../adminTheme'

export default function AdminThemeScope() {
  return (
    <div style={getAdminThemeScopeStyle()}>
      <Outlet />
    </div>
  )
}
