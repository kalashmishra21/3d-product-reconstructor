import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { useTheme } from '../theme/ThemeProvider.jsx'
import '../landing/landing.css'

// The approved illustrative study is marketing only, never a reconstruction fallback.
const StudyScene = lazy(() => import('../stage12a/StudyScene.jsx'))
export function Landing() {
  const { theme } = useTheme()
  const [topology, setTopology] = useState(0)
  const [view, setView] = useState('iso')
  return <div className="studio-landing">
    <section className="studio-hero" aria-labelledby="hero-title">
      <div className="studio-hero-copy"><p className="studio-overline">SINGLE IMAGE / THREE DIMENSIONS</p><h1 id="hero-title">A new dimension<br />in <em>perspective.</em></h1>
        <p>A single image is a starting point.<br />Explore its structure. Inspect its geometry.<br />See what takes shape.</p>
        <div className="studio-hero-actions"><Link className="button primary" to="/reconstruct">Enter the studio <Arrow diagonal /></Link><a className="studio-quiet-link" href="#process">Discover the process <span aria-hidden="true">↓</span></a></div>
        <div className="studio-theme-caption"><span aria-hidden="true" /><div><strong>{theme === 'forest' ? 'Dark Forest Studio' : 'Light Ivory Atelier'}</strong><small>Two perspectives. One workspace.</small></div></div>
      </div>
      <div className="studio-form" id="geometry"><div className="studio-form-heading"><span>Form study — Ribbed vessel</span><span>01 / 3D</span></div>
        <div className="studio-form-canvas"><Suspense fallback={<p className="studio-scene-fallback" role="status">Preparing the form study…</p>}><StudyScene theme={theme} topology={topology} mode="solid" view={view} /></Suspense></div>
        <div className="studio-source-study"><svg viewBox="0 0 180 220" role="img" aria-label="Illustrative vessel source study"><ellipse cx="90" cy="191" rx="57" ry="7" fill="currentColor" opacity=".12" /><path d="M70 31C62 59 58 65 46 90C29 126 44 176 66 185Q90 194 114 185C136 176 151 126 134 90C122 65 118 59 110 31Z" fill="currentColor" opacity=".66" />{[0,1,2,3,4,5,6].map(i=><path key={i} d={`M${73+i*5.6} 34C${63+i*8.9} 75 ${40+i*16.6} 116 ${69+i*7} 185`} fill="none" stroke="var(--color-surface)" strokeWidth="1.3" opacity=".5" />)}<ellipse cx="90" cy="31" rx="20" ry="5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="3" /></svg><span>Source study<small>Illustrative image</small></span><Arrow /></div>
        <div className="studio-form-controls"><div><label htmlFor="landing-topology">Reveal the topology</label><output htmlFor="landing-topology">{topology}%</output></div><input id="landing-topology" type="range" min="0" max="100" value={topology} onChange={event=>setTopology(Number(event.target.value))} /><div><span>Surface <span aria-hidden="true">→</span> Structure</span><button type="button" onClick={()=>setView(value=>value==='iso'?'front':'iso')}>{view==='iso'?'Front view':'Isometric view'} <Arrow /></button></div></div>
      </div>
      <div className="studio-hero-foot"><span>IMAGE / GEOMETRY / FORM</span><p>Illustrative geometry, not a model prediction.</p><a href="#process">Scroll to explore <span aria-hidden="true">↓</span></a></div>
    </section>
    <section className="studio-process" id="process" aria-labelledby="process-title"><div className="studio-section-heading"><p className="studio-overline">FROM SOURCE TO SURFACE</p><h2 id="process-title">A space to <em>see clearly.</em></h2></div><ol>{[
      ['Begin with an image.','Choose your source and verify it before inference. A considered first step toward geometry.'],
      ['Look beneath the surface.','Inspect the real model output as a surface, wireframe, or vertices. Keep the source in view.'],
      ['Keep the geometry.','Reopen saved work and take the same raw Stage-3 geometry into your next tool as OBJ or GLB.'],
    ].map(([title,body],i)=><li key={title}><span>0{i+1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol></section>
    <section className="studio-closing" id="status"><div><p className="studio-overline">A REAL PIXEL2MESH WORKSPACE</p><h2>Built for curiosity.<br /><em>Grounded in geometry.</em></h2></div><div><p>One image, three deformation stages, and a connected surface to inspect. Your sources, meshes, and exports stay together in your private workspace.</p><p className="studio-limitation">The current integration checkpoint has limited reconstruction quality and is being re-evaluated. The workspace always shows its real output.</p><Link className="button secondary" to="/dashboard">Open your workspace <Arrow diagonal /></Link></div></section>
  </div>
}
