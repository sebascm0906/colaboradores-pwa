import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'

// ─── Pantallas base ──────────────────────────────────────────────────────────
import ScreenLogin   from './screens/ScreenLogin'
import ScreenHome    from './screens/ScreenHome'
import ScreenKPIs    from './screens/ScreenKPIs'
import ScreenSurveys from './screens/ScreenSurveys'
import ScreenBadges  from './screens/ScreenBadges'
import ScreenProfile from './screens/ScreenProfile'

// ─── Módulos operativos (lazy — solo descarga el código si el rol lo necesita) ─
const ScreenModuloPendiente = lazy(() => import('./screens/ScreenModuloPendiente'))

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

// ─── Loader mínimo para Suspense ──────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#030811',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 32, height: 32,
        border: '2px solid rgba(255,255,255,0.12)',
        borderTop: '2px solid #2B8FE0',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
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
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth */}
            <Route
              path="/login"
              element={session ? <Navigate to="/" replace /> : <ScreenLogin />}
            />

            {/* Generales — todos los roles */}
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

            {/* Módulos operativos — misma pantalla genérica hasta que se implementen */}
            {[
              '/produccion', '/supervision', '/almacen-pt',
              '/ruta', '/entregas', '/equipo',
              '/admin', '/torres',
            ].map(path => (
              <Route key={path} path={path} element={
                <PrivateRoute>
                  <ScreenModuloPendiente />
                </PrivateRoute>
              } />
            ))}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}
