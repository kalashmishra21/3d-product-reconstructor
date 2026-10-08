import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { signedImageUrl } from '../lib/storage.js'
import { formatMilliseconds } from '../reconstruction/mesh.js'

const STATUS = { processing: 'PROCESSING', completed: 'COMPLETED', low_volume: 'LOW VOLUME',
  failed: 'FAILED', interrupted: 'INTERRUPTED' }

export function HistoryCard({ record }) {
  const ref = useRef(null)
  const path = useRef(record.source_path)
  path.current = record.source_path
  const retried = useRef(false)
  const [thumbnail, setThumbnail] = useState('')
  useEffect(() => {
    retried.current = false
    setThumbnail('')
    if (!record.source_path) return
    let active = true
    let observer
    const load = () => signedImageUrl('reconstruction-artifacts', record.source_path)
      .then((url) => { if (active) setThumbnail(url) }).catch(() => {})
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { observer.disconnect(); load() }
      })
      observer.observe(ref.current)
    } else load()
    return () => { active = false; observer?.disconnect() }
  }, [record.source_path])

  function refreshThumbnail() {
    if (retried.current || !record.source_path) { setThumbnail(''); return }
    retried.current = true
    const sourcePath = record.source_path
    signedImageUrl('reconstruction-artifacts', sourcePath)
      .then((url) => { if (path.current === sourcePath) setThumbnail(url === thumbnail ? '' : url) })
      .catch(() => { if (path.current === sourcePath) setThumbnail('') })
  }

  const date = record.created_at ? new Date(record.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
  const ready = ['completed', 'low_volume'].includes(record.status)
  return <article className="history-card" ref={ref}>
    <Link to={'/reconstructions/' + encodeURIComponent(record.id)} className="history-card-link">
      <div className="history-thumb">{thumbnail ? <img src={thumbnail} onError={refreshThumbnail} alt={'Source image for ' + (record.object_name || record.source_filename)} loading="lazy" /> : <span aria-hidden="true">SOURCE / IMAGE</span>}</div>
      <div className="history-card-main"><span className="dash-kicker">{date} · {STATUS[record.status] || 'UNKNOWN'}</span><h2>{record.object_name || 'Untitled reconstruction'}</h2><p>{record.source_filename}</p><div className="history-card-meta"><span>{record.vertices_count != null ? record.vertices_count.toLocaleString() + ' vertices' : 'Mesh pending'}</span><span>{record.faces_count != null ? record.faces_count.toLocaleString() + ' faces' : '—'}</span><span>{record.inference_ms != null ? formatMilliseconds(Number(record.inference_ms)) : '—'}</span><span>{ready && record.obj_path && record.glb_path ? 'OBJ + GLB available' : 'Exports pending'}</span></div></div>
      <Arrow diagonal />
    </Link>
  </article>
}
