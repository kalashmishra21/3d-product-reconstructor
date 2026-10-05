import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { useAuth } from './AuthProvider'
import { useBackendHealth } from '../lib/useBackendHealth'
import { WorkspaceLayout } from '../dashboard/WorkspaceLayout'

export function DashboardShell({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const health = useBackendHealth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function logout() {
    setPending(true)
    setError('')
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (failure) {
      setError(failure.message || 'Sign-out failed. Please try again.')
      setPending(false)
    }
  }

  return <WorkspaceLayout user={user} health={health} pending={pending} error={error} onLogout={logout}>{children ?? <Outlet />}</WorkspaceLayout>
}
