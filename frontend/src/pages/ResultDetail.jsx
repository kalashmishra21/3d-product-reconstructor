import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
export default function ResultDetail() {
  return <section className="workspace-page" aria-labelledby="result-detail-title"><div className="workspace-page-heading"><div><p className="dash-kicker">RESULT DETAIL</p><h1 id="result-detail-title">A result needs<br /><em>a saved place.</em></h1><p>Saved result links are not available yet. Current reconstructions can be inspected and exported directly in the workspace.</p></div></div><div className="result-detail-empty"><p>No saved reconstruction is loaded for this address.</p><Link className="button primary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link><Link className="dash-text-link" to="/history">Back to history <Arrow /></Link></div></section>
}
