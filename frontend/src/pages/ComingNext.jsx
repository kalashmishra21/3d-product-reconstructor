import { Link } from 'react-router-dom'
import { Arrow, Mark } from '../components/Icons'

export function ComingNext() {
  return <section className="coming-page" data-page="not-found" aria-labelledby="not-found-title">
    <Mark className="coming-mark" /><p className="eyebrow">404 / PAGE NOT FOUND</p>
    <h1 id="not-found-title">This view does not exist.</h1>
    <p>The address may have changed. Return to your workspace or begin a new reconstruction.</p>
    <div className="coming-actions"><Link className="button primary" to="/dashboard">Overview <Arrow /></Link><Link className="button secondary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link></div>
  </section>
}
