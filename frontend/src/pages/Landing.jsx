import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { GeometryDemo } from '../components/GeometryDemo'
import { ChairDrawing } from '../components/ChairDrawing'
import { BackendStatus } from '../components/BackendStatus'

export function Landing({ health }) {
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-square" />FROM IMAGE TO FORM</p>
        <h1 id="hero-title">One image.<br />Another<br /><em>dimension.</em></h1>
        <p className="hero-description">There’s more to an image than meets the eye. Explore how learned geometry gives a flat photograph a new perspective.</p>
        <a className="button primary" href="#geometry">Explore the geometry <Arrow diagonal /></a>
        <div className="hero-footnote"><span className="footnote-line" /><span>A single-image reconstruction study.<br />Built around Pixel2Mesh.</span></div>
      </div>
      <GeometryDemo />
    </section>

    <section className="pipeline-section" id="process" aria-labelledby="process-title">
      <div className="section-heading"><p className="eyebrow">01 / THE TRANSFORMATION</p><h2 id="process-title">Pixels become <em>possibility.</em></h2><p>One view in. A new way to see it out.</p></div>
      <ol className="pipeline-strip">
        <li><div className="pipeline-drawing reference"><ChairDrawing /></div><span className="pipeline-index">01</span><h3>A single image</h3><p>Appearance, perspective,<br />and the shape we can see.</p></li>
        <li><div className="pipeline-drawing points" aria-hidden="true"><svg viewBox="0 0 160 120"><g fill="currentColor">{Array.from({ length: 49 }, (_, i) => { const row = Math.floor(i / 7); const column = i % 7; return <circle key={i} cx={26 + column * 18 + Math.sin(row) * 6} cy={22 + row * 12 + Math.cos(column) * 6} r="1.8" /> })}</g></svg></div><span className="pipeline-index">02</span><h3>Learned geometry</h3><p>Image features guide the<br />positions of mesh vertices.</p></li>
        <li><div className="pipeline-drawing topology" aria-hidden="true"><svg viewBox="0 0 160 120" fill="none" stroke="currentColor" strokeWidth=".8"><path d="m80 9 51 27 10 43-61 31-59-31 10-43Z M31 36l49 16 51-16M21 79l59-27 61 27M80 9v101M31 36l49 74 51-74M21 79l59-70 61 70" /></svg></div><span className="pipeline-index">03</span><h3>Connected topology</h3><p>Edges and triangular faces<br />give the surface structure.</p></li>
        <li><div className="pipeline-drawing solid"><ChairDrawing /></div><span className="pipeline-index">04</span><h3>A complete mesh</h3><p>The final Stage-3 geometry,<br />preserved as an OBJ.</p></li>
      </ol>
    </section>

    <section className="method-section" aria-labelledby="method-title">
      <div><p className="eyebrow">02 / UNDER THE SURFACE</p><h2 id="method-title">A shape, learned.<br /><em>Not just rendered.</em></h2></div>
      <div className="method-copy"><p>Pixel2Mesh starts with a simple ellipsoid. Image features guide a graph neural network as it moves the vertices, refining the mesh through three stages.</p><p>The result is geometry: points, edges, and faces that can be viewed from different angles. A single photograph cannot reveal every hidden surface, so reconstruction remains an estimate.</p><a className="text-link" href="#status">Where the project stands <Arrow /></a></div>
    </section>

    <section className="status-section" id="status" aria-labelledby="status-title">
      <div className="status-heading"><p className="eyebrow">03 / WORK IN PROGRESS</p><h2 id="status-title">The foundation is here.<br /><em>The experience is taking shape.</em></h2></div>
      <div className="status-details"><div className="status-row"><span>Model training</span><span className="status-value">Complete <span aria-hidden="true">✓</span></span></div><div className="status-row"><span>Backend connection</span><div className="health-actions"><BackendStatus health={health} /><button className="check-again" type="button" disabled={health.state === 'loading'} onClick={health.retry}>Check again</button></div></div><div className="status-row"><span>Image-to-mesh application</span><span className="muted">Coming in a later stage</span></div><p className="health-note">Connection status checks the API only. It does not verify inference readiness.</p><div className="coming-cta"><Link className="button secondary" to="/reconstruct">Start reconstruction <Arrow diagonal /></Link><span>Coming next · preview the plan</span></div></div>
    </section>
  </>
}
