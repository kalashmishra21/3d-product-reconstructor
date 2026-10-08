import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { DashboardIcon as Icon } from './DashboardIcon'
import { TopologyStudy } from './TopologyStudy'
import { useWorkspace } from './WorkspaceLayout'

export function Dashboard() {
  const { health } = useWorkspace()
  return <div className="dashboard-content">
    <section className="dash-command" aria-labelledby="command-title">
      <div className="dash-command-copy"><p className="dash-kicker"><span className="dash-small-square" />FROM A SINGLE VIEW</p>
        <h2 id="command-title">Turn one image into<br /><em>inspectable geometry.</em></h2>
        <p>A focused space to prepare an image, run Pixel2Mesh, and inspect the geometry from every angle.</p>
        <Link className="button primary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link>
        <div className="dash-process" aria-label="Reconstruction pipeline"><span>Image</span><Arrow /><span>Mesh</span><Arrow /><span>OBJ / GLB</span></div>
      </div><TopologyStudy />
    </section>
    {health.state === 'unavailable' && <div className="dash-api-error" role="alert"><span>The reconstruction service is unavailable right now.</span><button type="button" onClick={health.retry}>Retry connection</button></div>}
    <div className="dash-lower-grid">
      <section className="dash-recent" aria-labelledby="recent-title"><div className="dash-section-heading"><div><p className="dash-kicker">YOUR COLLECTION</p><h2 id="recent-title">Your reconstructions</h2></div></div>
        <div className="dash-collection-callout"><Icon name="history" /><p>Return to saved sources, inspect their real Stage-3 geometry, and download your assets in History.</p><Link className="dash-text-link" to="/history">Open History <Arrow diagonal /></Link></div>
      </section>
      <section className="dash-model" aria-labelledby="model-title"><p className="dash-kicker">MODEL BASELINE</p><h2 id="model-title">Three stages.<br /><em>One connected surface.</em></h2>
        <dl className="stage-baseline">{[[156, 308], [618, 1232], [2466, 4928]].map(([v, f], i) => <div key={v}><dt>Stage 0{i + 1}</dt><dd>{v.toLocaleString()} <span>vertices</span><br />{f.toLocaleString()} <span>faces</span></dd></div>)}</dl>
        <p className="dash-categories">13 trained object categories</p><p className="model-context">The current checkpoint supports integration testing. Reconstruction quality is being re-evaluated.</p><Link className="dash-text-link" to="/model">Explore the model <Arrow diagonal /></Link>
      </section>
    </div>
  </div>
}
