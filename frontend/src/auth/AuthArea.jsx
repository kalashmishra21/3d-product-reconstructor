import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthProvider'
import { AuthShell } from './AuthShell'
import { AuthPage } from './AuthPage'
import { AuthCallback } from './AuthCallback'
import { DashboardShell } from './DashboardShell'

const ReconstructionPage = lazy(() => import('../reconstruction/ReconstructionPage').then((module) => ({ default: module.ReconstructionPage })))

function ProtectedWorkspace({ pathname }) {
  const { configured, ready, user } = useAuth()
  if (!configured) return <Navigate to="/login" replace />
  if (!ready) return <AuthShell mode="callback"><section className="auth-panel auth-status-panel" role="status">Checking your session…</section></AuthShell>
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname } }} />
  if (pathname === '/dashboard') return <DashboardShell />
  return <Suspense fallback={<div className="grid min-h-svh place-items-center bg-charcoal text-ivory" role="status">Opening input studio…</div>}><ReconstructionPage /></Suspense>
}

function AuthContent() {
  const { pathname } = useLocation()
  if (pathname === '/dashboard' || pathname === '/reconstruct') return <ProtectedWorkspace pathname={pathname} />
  if (pathname === '/auth/callback') return <AuthShell mode="callback"><AuthCallback /></AuthShell>
  const mode = pathname === '/signup' ? 'signup'
    : pathname === '/forgot-password' ? 'forgot'
      : pathname === '/reset-password' ? 'reset' : 'login'
  return <AuthShell mode={mode}><AuthPage mode={mode} /></AuthShell>
}

export default function AuthArea() {
  return <AuthProvider><AuthContent /></AuthProvider>
}
