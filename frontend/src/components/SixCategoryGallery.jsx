import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import './SixCategoryGallery.css'

const categories = ['Handbags', 'Speakers', 'Mugs', 'Tables', 'Backpacks', 'Chairs']
// These directions come from the recorded camera-to-world matrices of the
// exported input views. Blender's world is Z-up for both PLY and OBJ assets.
const inputCamera = {
  Handbags: [0, -0.7878462, 0.1389185],
  Speakers: [0, -0.7878462, 0.1389185],
  Mugs: [0, -0.7878462, 0.1389185],
  Tables: [0, -0.6928203, 0.4],
  Backpacks: [0, -0.7878462, 0.1389185],
  Chairs: [0.5570914, 0.5570914, 0.1389185],
}
const views = ['front', 'side', 'oblique']

function viewDirection(category, view) {
  const [x, y, z] = inputCamera[category]
  const front = new Vector3(x, y, z).normalize()
  const side = new Vector3(-y, x, z).normalize()
  return view === 'front' ? front : view === 'side' ? side : front.add(side).normalize()
}

function AssetModel({ category, mode, view }) {
  const root = `/pixel3mesh/six-category/${category}`
  const points = useLoader(PLYLoader, `${root}/point_cloud.ply`)
  const object = useLoader(OBJLoader, `${root}/visible_surface.obj`)
  const { camera } = useThree()
  const controls = useRef(null)

  const displayMesh = useMemo(() => {
    const clone = object.clone(true)
    clone.traverse((node) => {
      if (node.isMesh) {
        node.geometry = node.geometry.clone()
        node.geometry.computeVertexNormals()
        node.material = node.material.clone()
        node.material.color.set('#72a9ad')
        node.material.side = 2
        node.material.roughness = 0.78
      }
    })
    return clone
  }, [object])

  useEffect(() => {
    const radius = 2.5
    const direction = viewDirection(category, view)
    camera.position.copy(direction.multiplyScalar(radius))
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 0)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [camera, view, category, mode])

  return <>
    {mode === 'points' ? <points geometry={points} scale={2.6}>
      <pointsMaterial color="#8fd2ca" size={3} sizeAttenuation={false} />
    </points> : <primitive object={displayMesh} scale={2.6} />}
    <ambientLight intensity={1.8} />
    <directionalLight position={[3, 5, 4]} intensity={2.2} />
    <OrbitControls ref={controls} makeDefault enableDamping enablePan />
  </>
}

function ModelCanvas({ category, mode, view }) {
  return <Canvas camera={{ position: [2.5, 1.5, 2.5], fov: 40, near: 0.01, far: 100 }}>
    <color attach="background" args={['#111817']} />
    <Suspense fallback={null}><AssetModel category={category} mode={mode} view={view} /></Suspense>
  </Canvas>
}

export function SixCategoryGallery() {
  const [category, setCategory] = useState(categories[0])
  const [mode, setMode] = useState('points')
  const [view, setView] = useState('oblique')
  const assetRoot = `/pixel3mesh/six-category/${category}`

  useEffect(() => {
    // RouteEffects does not yet include this public gallery route.
    const timer = window.setTimeout(() => { document.title = 'Six-category model gallery — Pixel3Mesh' }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return <main className="six-gallery">
    <header className="six-gallery-header">
      <a className="six-gallery-back" href="/">Pixel3Mesh</a>
      <p>MODEL RESULTS / SIX CATEGORIES</p>
      <h1>Image to 3D predictions</h1>
      <div className="six-gallery-header-row">
        <span>ResNet18 image encoder · shared 2,048 point decoder</span>
        <span className="six-gallery-hash">Checkpoint {`ea861cc8…ef3500`}</span>
      </div>
    </header>

    <section className="six-gallery-layout" aria-label="Six-category model gallery">
      <nav className="six-gallery-categories" aria-label="Product categories">
        {categories.map((item) => <button key={item} type="button" className={category === item ? 'is-selected' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </nav>
      <section className="six-gallery-card" aria-label={`${category} prediction`}>
        <div className="six-gallery-image-wrap">
          <img className="six-gallery-input" src={`${assetRoot}/input.png`} alt={`Input product photograph for ${category}`} />
          <div className="six-gallery-image-label">INPUT RGB</div>
        </div>
        <div className="six-gallery-viewer">
          <div className="six-gallery-viewer-head">
            <div><span>MODEL OUTPUT</span><h2>{mode === 'points' ? '2,048 predicted points' : 'Visible-surface mesh'}</h2></div>
            <div className="six-gallery-modes" role="group" aria-label="Prediction representation">
              <button type="button" aria-pressed={mode === 'points'} className={mode === 'points' ? 'active' : ''} onClick={() => setMode('points')}>Point cloud</button>
              <button type="button" aria-pressed={mode === 'mesh'} className={mode === 'mesh' ? 'active' : ''} onClick={() => setMode('mesh')}>Visible mesh</button>
            </div>
          </div>
          <div className="six-gallery-canvas"><ModelCanvas key={`${category}-${mode}`} category={category} mode={mode} view={view} /></div>
          <div className="six-gallery-tools" role="group" aria-label="Camera presets">
            {views.map((preset) => <button key={preset} type="button" aria-pressed={view === preset} className={view === preset ? 'active' : ''} onClick={() => setView(preset)}>{preset}</button>)}
            <span>Drag to rotate · scroll to zoom</span>
          </div>
          <p className="six-gallery-disclaimer">Visible-surface mesh — not a complete watertight object. Hidden surfaces are not inferred by this mesh export.</p>
          <div className="six-gallery-downloads">
            <a href={`${assetRoot}/point_cloud.ply`} download={`${category.toLowerCase()}_prediction.ply`}>Download predicted PLY</a>
            <a href={`${assetRoot}/visible_surface.obj`} download={`${category.toLowerCase()}_visible_surface.obj`}>Download visible OBJ</a>
          </div>
        </div>
      </section>
      <p className="six-gallery-note">These are saved predictions from the trained checkpoint. Live image-upload inference is not connected here. The point cloud is the full model output; the OBJ is a camera-visible depth shell. <a href="/pixel3mesh/six-category/ATTRIBUTION.txt">Source attribution</a></p>
    </section>
  </main>
}

export default SixCategoryGallery
