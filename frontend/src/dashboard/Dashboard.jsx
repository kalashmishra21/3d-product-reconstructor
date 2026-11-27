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
        <p>Run the trained Pixel3Mesh model on a calibrated product view, then inspect its predicted geometry.</p>
        <Link className="button primary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link>
        <div className="dash-process" aria-label="Reconstruction pipeline"><span>Image</span><Arrow /><span>Mesh</span><Arrow /><span>OBJ / GLB</span></div>
      </div><TopologyStudy />
    </section>
    {health.state === 'unavailable' && <div className="dash-api-error" role="alert"><span>The reconstruction service is unavailable right now.</span><button type="button" onClick={health.retry}>Retry connection</button></div>}
    <div className="dash-lower-grid">
      <section className="dash-recent" aria-labelledby="recent-title"><div className="dash-section-heading"><div><p className="dash-kicker">YOUR COLLECTION</p><h2 id="recent-title">Your reconstructions</h2></div></div>
        <div className="dash-collection-callout"><Icon name="history" /><p>Return to saved inputs, inspect predicted geometry, and reopen available exports in History.</p><Link className="dash-text-link" to="/history">Open History <Arrow diagonal /></Link></div>
      </section>
      <section className="dash-model" aria-labelledby="model-title"><p className="dash-kicker">CURRENT TRAINED MODEL</p><h2 id="model-title">Pixel3Mesh<br /><em>Six-category baseline.</em></h2>
        <p className="model-context">ImageNet-pretrained ResNet18 with custom global-point and depth/foreground decoders. The model predicts 2,048 global XYZ points and a variable-size visible-surface mesh.</p>
        <p className="dash-categories">Handbags · Speakers · Mugs · Tables · Backpacks · Chairs</p><Link className="dash-text-link" to="/model">Explore the model <Arrow diagonal /></Link>
      </section>
    </div>
  </div>
}
