import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { DashboardIcon } from '../dashboard/DashboardIcon'
import { useAuth } from '../auth/AuthProvider'
import { useReconstructionJob } from '../jobs/ReconstructionJobProvider.jsx'
import { getReconstruction, interruptStaleReconstruction, listReconstructions } from '../lib/reconstructions.js'
import { listTriposrOutputs } from '../lib/triposrHistory.js'
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
  const [triposrRows, setTriposrRows] = useState([])
  const [triposrUnavailable, setTriposrUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      Promise.all([
        listReconstructions({ userId: user.id, status: filter, search, limit: 24 }),
        listTriposrOutputs({ limit: 24 }).then((data) => ({ data })).catch(() => ({ error: true })),
      ])
        .then(async ([data, triposrResult]) => {
          const activeId = ['processing', 'persisting'].includes(job.phase) ? job.id : null
          const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
          const reconciled = await Promise.all(data.map(async (row) => {
            if (classifyProcessing(row, activeId) !== 'stale') return row
            try { return await interruptStaleReconstruction(row.id, cutoff) ?? await getReconstruction(row.id) }
            catch { return row }
          }))
          if (live) setRows(reconciled.filter(Boolean))
          const needle = search.trim().toLocaleLowerCase()
          const visibleTriposr = (triposrResult.data ?? []).filter((row) => {
            if (filter !== 'all' && filter !== 'completed') return false
            return !needle || `${row.object_name ?? ''} ${row.source_filename}`.toLocaleLowerCase().includes(needle)
          })
          if (live) {
            setTriposrRows(visibleTriposr)
            setTriposrUnavailable(Boolean(triposrResult.error))
          }
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
    {!loading && !error && triposrUnavailable && <p className="history-feedback" role="status">TripoSR history is unavailable until its private-history migration is applied.</p>}
    {!loading && !error && rows.length + triposrRows.length > 0 && <>
      {triposrRows.length > 0 && <section aria-labelledby="triposr-history-title"><h2 id="triposr-history-title">TripoSR reconstructions</h2>
        <div className="history-list" aria-label="Saved TripoSR reconstructions">{triposrRows.map((row) => <article className="history-card" key={`triposr-${row.id}`}>
          <Link to={`/reconstructions/${encodeURIComponent(row.id)}`} className="history-card-link">
            <div className="history-thumb"><span aria-hidden="true">TRIPOSR / MESH</span></div>
            <div className="history-card-main"><div className="history-card-overline"><span>{new Date(row.created_at).toLocaleDateString()}</span><span className="history-card-status" data-status="completed">SAVED</span></div>
              <h2>{row.object_name || row.source_filename}</h2><p>{row.source_filename}</p>
              <div className="history-card-meta"><span>{row.vertices_count.toLocaleString()} vertices</span><span>{row.faces_count.toLocaleString()} faces</span>
                <span>{Number(row.inference_ms).toLocaleString()} ms</span><span>OBJ + GLB available</span></div>
            </div><Arrow diagonal />
          </Link>
        </article>)}</div>
      </section>}
      {rows.length > 0 && <section aria-labelledby="previous-history-title"><h2 id="previous-history-title">Previous reconstructions</h2>
        <div className="history-list" aria-label="Saved reconstructions">{rows.map((row) => <HistoryCard key={row.id} record={row} />)}</div>
      </section>}
    </>}
    {!loading && !error && rows.length + triposrRows.length === 0 && !triposrUnavailable && <div className="history-empty"><div className="history-empty-graphic" aria-hidden="true"><DashboardIcon name="model" /><span>IMAGE / MESH / ASSET</span></div><div><p className="dash-kicker">YOUR COLLECTION</p><h2>{search || filter !== 'all' ? 'No matching reconstructions.' : 'No saved reconstructions yet.'}</h2><p>{search || filter !== 'all' ? 'Try another name or status filter.' : 'Your first saved reconstruction will appear here after its source and real predicted geometry are stored.'}</p><Link className="dash-text-link" to="/reconstruct">Make a new reconstruction <Arrow diagonal /></Link></div></div>}
    <div className="workspace-footnote"><span>01 / PREPARE</span><span>02 / INSPECT</span><span>03 / EXPORT</span></div>
  </section>
}
