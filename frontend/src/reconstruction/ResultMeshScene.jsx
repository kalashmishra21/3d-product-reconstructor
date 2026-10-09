import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { DoubleSide, Vector3 } from 'three'
import { createRawStage3Geometry } from './geometry.js'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { sceneThemes } from '../theme/theme.js'

const directions = { iso: [3, 2.2, 4], front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0] }
function RealMesh({ mesh, mode, view, fitVersion, resetVersion, reduced, palette }) {
  const { camera, size, invalidate } = useThree()
  const controls = useRef(null)
  const geometry = useMemo(() => {
    const copy = createRawStage3Geometry(mesh)
    const center = copy.boundingSphere.center.clone()
    const radius = copy.boundingSphere.radius
    copy.translate(-center.x, -center.y, -center.z)
    // Uniform display fitting on a fresh geometry copy. Raw response/export arrays
    // remain untouched; proportions are never changed to disguise limited depth.
    if (radius > 0) copy.scale(1.3 / radius, 1.3 / radius, 1.3 / radius)
    copy.computeBoundingBox()
    copy.computeBoundingSphere()
    return copy
  }, [mesh.vertices, mesh.faces])
  useEffect(() => () => geometry.dispose(), [geometry])
  const fit = (direction) => {
    if (!controls.current) return
    const radius = Math.max(geometry.boundingSphere.radius, 0.1)
    const vertical = camera.fov * Math.PI / 360
    const horizontal = Math.atan(Math.tan(vertical) * size.width / Math.max(size.height, 1))
    const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.12
    camera.near = Math.max(distance / 1000, 0.001)
    camera.far = distance * 100
    camera.up.set(...(view === 'top' ? [0, 0, -1] : [0, 1, 0]))
    camera.position.copy(direction.normalize().multiplyScalar(distance))
    controls.current.target.set(0, 0, 0)
    controls.current.minDistance = radius * 1.05
    controls.current.maxDistance = distance * 5
    camera.updateProjectionMatrix()
    controls.current.update()
    invalidate()
  }
  useEffect(() => { fit(new Vector3(...directions[view])) }, [geometry, view, resetVersion, size.width, size.height])
  useEffect(() => { if (fitVersion) fit(camera.position.clone().sub(controls.current?.target ?? new Vector3())) }, [fitVersion])
  useEffect(() => {
    // Canvas setup can resize/clear the drawing buffer after the initial commit.
    // Request a settled frame, and redraw when a background tab becomes visible.
    let frame = requestAnimationFrame(() => invalidate())
    const reveal = () => {
      if (!document.hidden) {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => invalidate())
      }
    }
    document.addEventListener('visibilitychange', reveal)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', reveal) }
  }, [geometry, mode, view, fitVersion, resetVersion, size.width, size.height, size.top, size.left, invalidate])
  return <>
    {mode === 'vertices' ? <points geometry={geometry}><pointsMaterial color={palette.points} size={3} sizeAttenuation={false} /></points> :
      <mesh geometry={geometry}>{mode === 'wireframe' ? <meshBasicMaterial color={palette.wire} wireframe /> :
        <meshStandardMaterial color={palette.solid} roughness={0.82} metalness={0} side={DoubleSide} />}</mesh>}
    <gridHelper args={[7, 14, palette.gridCenter, palette.grid]} position={[0, geometry.boundingBox.min.y - 0.16, 0]} />
    <OrbitControls ref={controls} makeDefault enableDamping={!reduced} dampingFactor={0.12} enablePan />
  </>
}
export default function ResultMeshScene(props) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { theme } = useTheme()
  const palette = sceneThemes[theme]
  return <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3, 2.2, 4], fov: 38, near: 0.01, far: 100 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    fallback={<p className="result-static-state">3D is unavailable in this browser. Mesh metadata and exports remain available.</p>}>
    <ambientLight intensity={palette.ambient} color={palette.key} />
    <directionalLight position={[4, 5, 4]} intensity={2.4} color={palette.key} />
    <directionalLight position={[-4, 2, -3]} intensity={1.3} color={palette.fill} />
    <RealMesh {...props} reduced={reduced} palette={palette} />
  </Canvas>
}
