import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'

// ─── Pantallas ───────────────────────────────────────────────────────────────
import ScreenLogin   from './screens/ScreenLogin'
import ScreenHome    from './screens/ScreenHome'
import ScreenKPIs    from './screens/ScreenKPIs'
import ScreenSurveys from './screens/ScreenSurveys'
import ScreenBadges  from './screens/ScreenBadges'
import ScreenProfile from './screens/ScreenProfile'

// ─── Contexto de sesión ──────────────────────────────────────────────────────
export const SessionContext = createContext(null)

export function useSession() {
  return useContext(SessionContext)
}

function getStoredSession() {
  try {
    const raw = localStorage.getItem('gf_session')
    if (!raw) return null
    const s = JSON.parse(raw)
    // Validar expiración contra campo exp del JWT (unix segundos)
    if (s?.exp && Date.now() / 1000 > s.exp) {
      localStorage.removeItem('gf_session')
      return null
    }
    return s
  } catch {
    return null
  }
}

// ─── Guard de ruta autenticada ────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/login" replace />
  return children
}

// ─── App principal ────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(getStoredSession)

  useEffect(() => {
    if (session) {
      localStorage.setItem('gf_session', JSON.stringify(session))
    } else {
      localStorage.removeItem('gf_session')
    }
  }, [session])

  function login(sessionData) { setSession(sessionData) }
  function logout()           { setSession(null) }

  return (
    <SessionContext.Provider value={{ session, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={session ? <Navigate to="/" replace /> : <ScreenLogin />}
          />
          <Route path="/" element={
            <PrivateRoute><ScreenHome /></PrivateRoute>
          } />
          <Route path="/kpis" element={
            <PrivateRoute><ScreenKPIs /></PrivateRoute>
          } />
          <Route path="/surveys" element={
            <PrivateRoute><ScreenSurveys /></PrivateRoute>
          } />
          <Route path="/badges" element={
            <PrivateRoute><ScreenBadges /></PrivateRoute>
          } />
          <Route path="/profile" element={
            <PrivateRoute><ScreenProfile /></PrivateRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}
