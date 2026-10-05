import { Link } from 'react-router-dom'
import { useReconstructionJob } from '../jobs/ReconstructionJobProvider.jsx'

const labels = {
  idle: 'READY', selected: 'IMAGE SELECTED', preflighting: 'VERIFYING INPUT', ready: 'PREFLIGHT READY',
  processing: 'PROCESSING', persisting: 'SAVING RESULT', completed: 'COMPLETED',
  low_volume: 'LOW VOLUME', failed: 'FAILED', interrupted: 'INTERRUPTED',
}

export function GlobalJobStatus() {
  const { state, dismissNotice } = useReconstructionJob()
  const destination = state.id ? `/reconstructions/${state.id}` : '/reconstruct'
  const activeName = state.objectName?.trim() || 'Untitled reconstruction'
  const label = labels[state.phase] || 'READY'
  return <>
    <Link to={destination} className={`global-job-status is-${state.phase}`} aria-label={`Reconstruction status: ${label}${state.phase === 'idle' ? '' : `, ${activeName}`}`}>
      <span className="global-job-dot" aria-hidden="true" />
      <span>{label}</span>{state.phase !== 'idle' && <strong>· {activeName}</strong>}
    </Link>
    {state.notice && <div className="global-job-notice" role="status" aria-live="polite">
      <span>{state.notice.message}</span><Link to={destination}>Open result</Link>
      <button type="button" onClick={dismissNotice} aria-label="Dismiss reconstruction notice">×</button>
    </div>}
  </>
}
