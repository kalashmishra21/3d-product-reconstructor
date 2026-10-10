import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { SOFTWARE_APPLICATION_JSON_LD } from '../seo/siteMetadata.js'
import '../landing/approvedLanding.css'

// Approved illustrative study. Never used as a real inference fallback.
const StudyScene = lazy(() => import('../stage12a/StudyScene.jsx'))

function Icon({ name = 'arrow', ...props }) {
  const paths = { arrow: 'M5 19 19 5M5 5h14v14', cube: 'm12 2 10 6v8l-10 6-10-6V8l10-6Zm0 0v20M2 8l20 8M22 8 2 16', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', plus: 'M12 4v16M4 12h16', history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2', panel: 'M3 4h18v16H3zM9 4v16', sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z', orbit: 'M3 12c0-4 18-4 18 0s-18 4-18 0ZM12 3c4 0 4 18 0 18s-4-18 0-18Z' }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>
}

function Brand({ compact = false }) {
  return <Link to="/" className="p-brand" aria-label="Reconstruct home"><span className="p-brand-mark"><Icon name="cube" /></span>{!compact && <span><strong>reconstruct<span>.</span></strong><small>SINGLE IMAGE / THREE DIMENSIONS</small></span>}</Link>
}

function SourceStudy() {
  return <svg className="source-study" viewBox="0 0 180 220" role="img" aria-label="Illustrative vessel source study, not an uploaded photograph">
    <ellipse cx="90" cy="191" rx="57" ry="7" fill="currentColor" opacity=".12" />
    <path d="M70 31C62 59 58 65 46 90C29 126 44 176 66 185Q90 194 114 185C136 176 151 126 134 90C122 65 118 59 110 31Z" fill="currentColor" opacity=".66" />
    {[0,1,2,3,4,5,6].map(i => <path key={i} d={`M${73+i*5.6} 34C${63+i*8.9} 75 ${40+i*16.6} 116 ${69+i*7} 185`} fill="none" stroke="var(--p-bg)" strokeWidth="1.3" opacity=".45" />)}
    <ellipse cx="90" cy="31" rx="20" ry="5" fill="var(--p-bg)" stroke="currentColor" strokeWidth="3" />
  </svg>
}

function Scene({ theme, topology = 0, mode = 'solid', view = 'iso', reset = 0 }) {
  return <Suspense fallback={<div className="scene-fallback" role="status">Preparing the form study…</div>}><StudyScene {...{ theme, topology, mode, view, reset }} /></Suspense>
}

function Workspace({ theme }) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState('result')
  const [mode, setMode] = useState('solid')
  const [view, setView] = useState('iso')
  const [reset, setReset] = useState(0)
  return <section id="workspace" className="p-workspace-section" aria-labelledby="workspace-title">
    <div className="p-section-heading"><h2 id="workspace-title">A space to <em>see clearly.</em></h2><p>From source to surface, every control has its place.<br />Explore the workspace below.</p></div>
    <div className={`p-workspace ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="p-sidebar">
        <div className="p-sidebar-head"><Brand compact={collapsed} /><button className="p-icon-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand preview sidebar' : 'Collapse preview sidebar'} aria-expanded={!collapsed}><Icon name="panel" /></button></div>
        <nav aria-label="Illustrative workspace"><Link to="/dashboard" title="Open Overview"><Icon name="grid" /><span>Overview</span></Link><a href="#workspace" className="is-active" aria-current="page" title="Reconstruction preview"><Icon name="plus" /><span>Reconstruction</span></a><Link to="/history" title="Open History"><Icon name="history" /><span>History</span></Link><Link to="/model" title="Open Model"><Icon name="cube" /><span>Model</span></Link></nav>
        <div className="p-sidebar-bottom"><span className="p-avatar">R</span><div><strong>Design preview</strong><small>Illustrative workspace</small></div></div>
      </aside>
      <div className="p-workspace-main">
        <div className="p-workspace-top"><span>Studio / Form study</span><Link to="/reconstruct">Open live workspace <Icon /></Link></div>
        <div className="p-work-title"><h3>Vessel study<span>.01</span></h3><span className="p-tag">Illustrative demo</span></div>
        <div className="p-inspection-grid">
          <div className="p-source-panel"><div className="p-source-heading"><span>Source study</span><span className="p-mono">SVG</span></div><div className="p-source-image"><SourceStudy /></div><h4>One view. More to explore.</h4><p>This procedural study demonstrates the interface. It is not reconstructed by Pixel2Mesh.</p><dl><div><dt>Study</dt><dd>Ribbed vessel</dd></div><div><dt>Geometry</dt><dd>Illustrative</dd></div><div><dt>Real pipeline</dt><dd>Pixel2Mesh</dd></div></dl><Link className="p-source-action" to="/reconstruct">Try a real reconstruction <Icon /></Link></div>
          <div className="p-inspector">
            <div className="p-inspector-bar"><div className="p-primary-tabs" role="group" aria-label="Preview source or result">{['result','input'].map(value => <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value}>{value === 'result' ? 'Result' : 'Input'}</button>)}</div><span className="p-mono">FORM / 01</span></div>
            {tab === 'result' ? <><div className="p-mode-bar"><div role="group" aria-label="Surface mode">{['solid','wireframe','vertices'].map(value => <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div><button onClick={() => { setView('iso'); setReset(v=>v+1) }}>Reset view</button></div><div className="p-preview-canvas"><Scene {...{theme, mode, view, reset}} /></div><div className="p-camera-bar"><div role="group" aria-label="View direction">{['iso','front','side','top'].map(value => <button key={value} onClick={() => setView(value)} aria-pressed={view === value}>{value.toUpperCase()}</button>)}</div><span><Icon name="orbit" /> Drag to inspect</span></div></> : <div className="p-input-preview"><SourceStudy /><span>Illustrative source · unchanged aspect ratio</span></div>}
            <div className="p-export-preview"><div><strong>Inspect. Then take it further.</strong><small>Real OBJ / GLB exports are available in the live workspace.</small></div><Link to="/history">Open saved work <Icon /></Link></div>
          </div>
        </div>
      </div>
    </div>
  </section>
}

export function Landing() {
  const { theme } = useTheme()
  const [topology, setTopology] = useState(0)
  const [heroView, setHeroView] = useState('iso')
  return <div className="approved-landing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_JSON_LD) }} />
      <section className="p-hero" aria-labelledby="prototype-title">
        <div className="p-hero-copy"><h1 id="prototype-title">A new dimension<br />in <em>perspective.</em></h1><p>A single image is a starting point.<br />Explore its structure. Inspect its geometry.<br />See what takes shape.</p><div className="p-hero-actions"><a className="p-button" href="#workspace">Explore the studio <Icon /></a><Link className="p-quiet-link" to="/reconstruct">Try real reconstruction</Link></div><div className="p-theme-caption"><span className="p-theme-swatch" /><div><strong>{theme === 'forest' ? 'Dark Forest Studio' : 'Light Ivory Atelier'}</strong><span>Two perspectives. One workspace.</span></div></div></div>
        <div className="p-hero-stage"><div className="p-stage-heading"><span>Form study — Ribbed vessel</span><span className="p-mono">01 / 03D</span></div><div className="p-hero-canvas"><Scene theme={theme} topology={topology} view={heroView} /></div><div className="p-source-float"><div><SourceStudy /></div><span>Source study<small>Illustrative image</small></span><Icon /></div><div className="p-stage-controls"><div className="p-reveal-label"><label htmlFor="topology">Reveal the topology</label><output htmlFor="topology" className="p-mono">{topology}%</output></div><input id="topology" type="range" min="0" max="100" value={topology} onChange={e=>setTopology(Number(e.target.value))} /><div className="p-stage-foot"><span>Surface <span aria-hidden="true">→</span> Structure</span><button onClick={()=>setHeroView(v=>v==='iso'?'front':'iso')}><Icon name="orbit" /> {heroView === 'iso' ? 'Front view' : 'Isometric view'}</button></div></div></div>
        <div className="p-hero-bottom"><span>IMAGE <span aria-hidden="true">/</span> GEOMETRY <span aria-hidden="true">/</span> FORM</span><p>Illustrative geometry, not a model prediction.</p><a href="#workspace" aria-label="Scroll to workspace preview">Scroll to explore <span aria-hidden="true">↓</span></a></div>
      </section>
      <section id="process" className="p-process" aria-label="The reconstruction workflow"><div><span className="p-mono">01</span><h2>Begin with an image.</h2><p>Choose a source. Verify it before inference.</p></div><div><span className="p-mono">02</span><h2>Look beneath the surface.</h2><p>Inspect the model’s real vertices and faces.</p></div><div><span className="p-mono">03</span><h2>Keep the geometry.</h2><p>Reopen saved work. Export raw OBJ or GLB.</p></div></section>
      <Workspace theme={theme} />
      <section id="status" className="p-closing"><h2>Built for curiosity.<br /><em>Grounded in geometry.</em></h2><div><p>The live app uses a real Pixel2Mesh integration checkpoint. Its reconstruction quality is being re-evaluated. This design study does not replace or alter model output.</p><Link className="p-button" to="/dashboard">Open your workspace <Icon /></Link></div></section>
  </div>
}
