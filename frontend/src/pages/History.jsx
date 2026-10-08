import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { DashboardIcon } from '../dashboard/DashboardIcon'
import { useAuth } from '../auth/AuthProvider'
import { useReconstructionJob } from '../jobs/ReconstructionJobProvider.jsx'
import { getReconstruction, interruptStaleReconstruction, listReconstructions } from '../lib/reconstructions.js'
import { classifyProcessing, STALE_AFTER_MS } from '../jobs/stale.js'
import { HistoryCard } from './HistoryCard.jsx'

const FILTERS = [['all', 'All'], ['processing', 'Processing'], ['completed', 'Completed'],
  ['low_volume', 'Low volume'], ['failed', 'Failed']]

export default function History() {
  const { user } = useAuth()
  const { state: job } = useReconstructionJob()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      listReconstructions({ userId: user.id, status: filter, search, limit: 24 })
        .then(async (data) => {
          const activeId = ['processing', 'persisting'].includes(job.phase) ? job.id : null
          const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
          const reconciled = await Promise.all(data.map(async (row) => {
            if (classifyProcessing(row, activeId) !== 'stale') return row
            try { return await interruptStaleReconstruction(row.id, cutoff) ?? await getReconstruction(row.id) }
            catch { return row }
          }))
          if (live) setRows(reconciled.filter(Boolean))
        })
        .catch(() => { if (live) setError('Could not load your reconstructions. Try again.') })
        .finally(() => { if (live) setLoading(false) })
    }, search ? 250 : 0)
    return () => { live = false; window.clearTimeout(timer) }
  }, [user.id, filter, search, job.phase, job.id, retryVersion])

  return <section className="workspace-page" aria-labelledby="history-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">YOUR COLLECTION</p><h1 id="history-title">History</h1><p>Return to your saved source images, real model geometry, and exports.</p></div><Link className="button primary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link></div>
    <div className="history-tools" aria-label="History tools">
      <label className="sr-only" htmlFor="history-search">Search saved reconstructions</label>
      <input id="history-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search objects or source files" />
      <div className="history-filters" role="group" aria-label="Filter reconstructions">{FILTERS.map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    </div>
    {loading && <p className="history-feedback" role="status">Opening your collection…</p>}
    {!loading && error && <div className="history-feedback" role="alert"><span>{error}</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry loading</button></div>}
    {!loading && !error && rows.length > 0 && <div className="history-list" aria-label="Saved reconstructions">{rows.map((row) => <HistoryCard key={row.id} record={row} />)}</div>}
    {!loading && !error && rows.length === 0 && <div className="history-empty"><div className="history-empty-graphic" aria-hidden="true"><DashboardIcon name="model" /><span>IMAGE / MESH / ASSET</span></div><div><p className="dash-kicker">YOUR COLLECTION</p><h2>{search || filter !== 'all' ? 'No matching reconstructions.' : 'No saved reconstructions yet.'}</h2><p>{search || filter !== 'all' ? 'Try another name or status filter.' : 'Your first saved reconstruction will appear here after its source and real Stage-3 result are stored.'}</p><Link className="dash-text-link" to="/reconstruct">Make a new reconstruction <Arrow diagonal /></Link></div></div>}
    <div className="workspace-footnote"><span>01 / PREPARE</span><span>02 / INSPECT</span><span>03 / EXPORT</span></div>
  </section>
}
