import { Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthProvider'
import { AuthShell } from './AuthShell'
import { AuthPage } from './AuthPage'
import { AuthCallback } from './AuthCallback'
import { DashboardShell } from './DashboardShell'

function ProtectedDashboard() {
  const { configured, ready, user } = useAuth()
  if (!configured) return <Navigate to="/login" replace />
  if (!ready) return <AuthShell mode="callback"><section className="auth-panel auth-status-panel" role="status">Checking your session…</section></AuthShell>
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname: '/dashboard' } }} />
  return <AuthShell mode="login" wide><DashboardShell /></AuthShell>
}

function AuthContent() {
  const { pathname } = useLocation()
  if (pathname === '/dashboard') return <ProtectedDashboard />
  if (pathname === '/auth/callback') return <AuthShell mode="callback"><AuthCallback /></AuthShell>
  const mode = pathname === '/signup' ? 'signup'
    : pathname === '/forgot-password' ? 'forgot'
      : pathname === '/reset-password' ? 'reset' : 'login'
  return <AuthShell mode={mode}><AuthPage mode={mode} /></AuthShell>
}

export default function AuthArea() {
  return <AuthProvider><AuthContent /></AuthProvider>
}
