import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from 'three'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { sceneThemes } from '../theme/theme.js'

const CAMERA_DIRECTIONS = {
  iso: [3, 2.2, 4], front: [0, 0, 1], rear: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], side: [1, 0.15, 1],
  top: [0, 1, 0], bottom: [0, -1, 0],
}
const VIEW_OPTIONS = [
  ['iso', 'ISO'], ['front', 'Front'], ['rear', 'Rear'], ['left', 'Left'],
  ['right', 'Right'], ['side', 'Side'], ['top', 'Top'], ['bottom', 'Bottom'],
]
const DISPLAY_OPTIONS = [['solid', 'Solid'], ['wireframe', 'Wireframe'], ['vertices', 'Vertices']]

function PredictedMesh({ prediction, mode }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry()
    result.setAttribute('position', new BufferAttribute(new Float32Array(prediction.vertices.flat()), 3))
    result.setAttribute('color', new BufferAttribute(new Float32Array(
      prediction.vertex_colors.flatMap((rgba) => rgba.slice(0, 3).map((channel) => channel / 255)),
    ), 3))
    result.setIndex(new BufferAttribute(new Uint32Array(prediction.faces.flat()), 1))
    result.computeVertexNormals()
    result.computeBoundingSphere()
    const center = result.boundingSphere.center
    const radius = result.boundingSphere.radius
    result.translate(-center.x, -center.y, -center.z)
    if (radius > 0) result.scale(1.3 / radius, 1.3 / radius, 1.3 / radius)
    result.computeBoundingBox()
    result.computeBoundingSphere()
    return result
  }, [prediction])
  useEffect(() => () => geometry.dispose(), [geometry])

  if (mode === 'vertices') return <points geometry={geometry}>
    <pointsMaterial vertexColors size={0.024} sizeAttenuation />
  </points>

  return <mesh geometry={geometry}>
    {mode === 'wireframe'
      ? <meshBasicMaterial vertexColors wireframe />
      : <meshStandardMaterial vertexColors roughness={0.76} metalness={0.02} side={DoubleSide} />}
  </mesh>
}

function FramedScene({ prediction, mode, view, cameraVersion, palette, controlsRef }) {
  const { camera, size, invalidate } = useThree()
  const geometry = useMemo(() => {
    const copy = new BufferGeometry()
    const points = new Float32Array(prediction.vertices.flat())
    copy.setAttribute('position', new BufferAttribute(points, 3))
    copy.computeBoundingSphere()
    const center = copy.boundingSphere.center.clone()
    copy.translate(-center.x, -center.y, -center.z)
    const radius = Math.max(copy.boundingSphere.radius, 0.001)
    copy.scale(1.3 / radius, 1.3 / radius, 1.3 / radius)
    copy.computeBoundingBox()
    copy.computeBoundingSphere()
    return copy
  }, [prediction])
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    if (!controlsRef.current) return
    const direction = new Vector3(...(CAMERA_DIRECTIONS[view] || CAMERA_DIRECTIONS.iso)).normalize()
    const radius = Math.max(geometry.boundingSphere.radius, 0.1)
    const verticalFov = camera.fov * Math.PI / 360
    const horizontalFov = Math.atan(Math.tan(verticalFov) * size.width / Math.max(size.height, 1))
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov)) * 1.18
    camera.near = Math.max(distance / 1000, 0.001)
    camera.far = distance * 100
    camera.up.set(...(view === 'top' ? [0, 0, -1] : view === 'bottom' ? [0, 0, 1] : [0, 1, 0]))
    camera.position.copy(direction.multiplyScalar(distance))
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.minDistance = radius * 1.08
    controlsRef.current.maxDistance = distance * 6
    camera.updateProjectionMatrix()
    controlsRef.current.update()
    invalidate()
  }, [camera, geometry, invalidate, size.height, size.width, view, cameraVersion])

  return <>
    <PredictedMesh prediction={prediction} mode={mode} />
    <gridHelper args={[3.3, 22, palette.gridCenter, palette.grid]} position={[0, geometry.boundingBox.min.y - 0.04, 0]} />
    <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} enablePan minPolarAngle={0.02} maxPolarAngle={Math.PI - 0.02} />
  </>
}

export function TriposrMeshViewer({ prediction, className = '' }) {
  const [mode, setMode] = useState('solid')
  const [view, setView] = useState('iso')
  const [cameraVersion, setCameraVersion] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const wrapperRef = useRef(null)
  const orbitRef = useRef(null)
  const { theme } = useTheme()
  const palette = sceneThemes[theme]
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const cameraChanged = (nextView) => {
    setView(nextView)
    setCameraVersion((value) => value + 1)
  }
  const zoom = (direction) => {
    const controls = orbitRef.current
    if (!controls) return
    if (direction === 'in') controls.dollyIn(1.22)
    else controls.dollyOut(1.22)
    controls.update()
  }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === wrapperRef.current) await document.exitFullscreen()
      else await wrapperRef.current?.requestFullscreen()
    } catch { /* Fullscreen is optional in embedded browsers. */ }
  }

  return <section className={`triposr-viewer-shell ${className}`} aria-label="3D model inspection">
    <div className="triposr-viewer-toolbar">
      <div className="triposr-control-group" role="group" aria-label="Mesh rendering mode">
        <span className="triposr-toolbar-label">DISPLAY</span>
        {DISPLAY_OPTIONS.map(([value, label]) => <button key={value} type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
      </div>
      <div className="triposr-viewer-actions" role="group" aria-label="Viewer controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom('out')}>−</button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom('in')}>+</button>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => cameraChanged('iso')}>Reset</button>
        <button type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'View fullscreen'} onClick={() => { void toggleFullscreen() }}>⛶</button>
      </div>
    </div>
    <div className="triposr-camera-presets" role="group" aria-label="Camera view presets">
      <span className="triposr-toolbar-label">VIEW</span>
      {VIEW_OPTIONS.map(([value, label]) => <button key={value} type="button" className={view === value ? 'is-active' : ''} aria-pressed={view === value} onClick={() => cameraChanged(value)}>{label}</button>)}
    </div>
    <div className="triposr-viewer" ref={wrapperRef}>
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3, 2.2, 4], fov: 38, near: 0.01, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        fallback={<p className="triposr-viewer-fallback">3D viewing is unavailable in this browser. You can still download the generated model.</p>}>
        <color attach="background" args={[theme === 'forest' ? '#142019' : '#f2efe7']} />
        <ambientLight intensity={palette.ambient} color={palette.key} />
        <directionalLight position={[4, 6, 5]} intensity={2.25} color={palette.key} />
        <directionalLight position={[-4, 2, -3]} intensity={1.25} color={palette.fill} />
        <FramedScene prediction={prediction} mode={mode} view={view} cameraVersion={cameraVersion} palette={palette} controlsRef={orbitRef} />
      </Canvas>
    </div>
    <div className="triposr-viewer-caption" aria-live="polite"><span>{mode.toUpperCase()} · {view.toUpperCase()} VIEW</span><span>{reduced ? 'DRAG TO ORBIT · SCROLL TO ZOOM' : 'DRAG TO ORBIT · SCROLL TO ZOOM · RIGHT-DRAG TO PAN'}</span></div>
  </section>
}
