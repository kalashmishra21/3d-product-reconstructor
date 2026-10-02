import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { signOut } from '../lib/auth'
import { useAuth } from './AuthProvider'

export function DashboardShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const savedName = user.user_metadata?.display_name
  const displayName = typeof savedName === 'string' && savedName.trim() ? savedName.trim() : user.email

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

  return <section className="auth-dashboard" aria-labelledby="dashboard-title">
    <p className="eyebrow"><span className="eyebrow-square" />YOUR WORKSPACE / FOUNDATION</p>
    <h1 id="dashboard-title">Welcome, {displayName}.</h1>
    <p>Your account is connected. Reconstruction upload, results, and history will arrive in later stages.</p>
    <div className="auth-dashboard-account"><span>SIGNED IN AS</span>{user.email}</div>
    <div className="auth-dashboard-actions">
      <Link className="button secondary" to="/">Explore the landing <Arrow diagonal /></Link>
      <button className="auth-signout" type="button" disabled={pending} onClick={logout}>{pending ? 'Signing out…' : 'Sign out'}</button>
    </div>
    {error && <p className="auth-form-message is-error" role="alert">{error}</p>}
  </section>
}
