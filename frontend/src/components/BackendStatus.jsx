const labels = { loading: 'Checking API', connected: 'API connected', unavailable: 'API unavailable' }

export function BackendStatus({ health }) {
  return <span className={`backend-status is-${health.state}`} role="status" aria-live="polite">
    <span className="status-dot" aria-hidden="true" />{labels[health.state]}
  </span>
}
