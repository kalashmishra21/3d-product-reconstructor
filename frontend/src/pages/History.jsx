import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { DashboardIcon } from '../dashboard/DashboardIcon'

export default function History() {
  return <section className="workspace-page" aria-labelledby="history-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">YOUR COLLECTION</p><h1 id="history-title">A place for<br /><em>every perspective.</em></h1><p>Revisit the geometry you create. Saved reconstruction history is the next part of this workspace.</p></div><Link className="button primary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link></div>
    <div className="history-tools" aria-label="History tools"><label className="sr-only" htmlFor="history-search">Search saved reconstructions</label><input id="history-search" disabled placeholder="Search reconstructions" aria-describedby="history-availability" /><button disabled type="button">All formats</button><span id="history-availability">Available with saved history</span></div>
    <div className="history-empty"><div className="history-empty-graphic" aria-hidden="true"><DashboardIcon name="model" /><span>IMAGE / MESH / ASSET</span></div><div><p className="dash-kicker">THE COLLECTION STARTS HERE</p><h2>No saved reconstructions yet.</h2><p>Your completed meshes will appear here once persistence is connected. For now, download OBJ or GLB files directly from the reconstruction workspace.</p><Link className="dash-text-link" to="/reconstruct">Make a new reconstruction <Arrow diagonal /></Link></div></div>
    <div className="workspace-footnote"><span>01 / PREPARE</span><span>02 / INSPECT</span><span>03 / EXPORT LOCALLY</span></div>
  </section>
}
