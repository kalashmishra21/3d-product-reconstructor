import { Component, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { createStudyGeometry } from './study.js'

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="scene-fallback">3D preview is unavailable on this device. The theme and workspace preview remain available.</div> : this.props.children }
}

function Vessel({ theme, topology, mode, view, reset }) {
  const { camera, invalidate } = useThree()
  const controls = useRef()
  const geometry = useMemo(() => {
    const data = createStudyGeometry()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
    g.setIndex(data.indices)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    const positions = { iso: [4, 2.1, 5], front: [0, .4, 6.8], side: [6.8, .4, 0], top: [0, 7, .01] }
    camera.position.set(...positions[view || 'iso'])
    camera.lookAt(0, 0, 0)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
    invalidate()
  }, [camera, invalidate, view, reset])
  const light = theme === 'ivory'
  return <>
    <hemisphereLight args={[light ? '#fffaf0' : '#e3ead7', light ? '#72816a' : '#17251b', light ? 1.05 : .82]} />
    <ambientLight intensity={light ? .48 : .28} />
    <directionalLight position={[3, 5, 4]} intensity={light ? 2.25 : 1.8} color="#fff3da" />
    <directionalLight position={[-4, 2, -1]} intensity={light ? 1.25 : 1.05} color="#afc7b1" />
    <pointLight position={[0, -1.4, 3.8]} intensity={light ? .42 : .72} color={light ? '#c1a77e' : '#d3dcbe'} distance={8} decay={2} />
    <group rotation={[0, -.4, 0]}>
      {mode !== 'vertices' && <mesh geometry={geometry}>
        <meshPhysicalMaterial color={light ? '#728b72' : '#bdcaae'} roughness={.32} metalness={.12} clearcoat={.34} clearcoatRoughness={.4} side={THREE.DoubleSide} wireframe={mode === 'wireframe'} />
      </mesh>}
      {mode === 'vertices' ? <points geometry={geometry}><pointsMaterial color={light ? '#254c37' : '#e4efd7'} size={.018} sizeAttenuation /></points> : topology > 0 && mode !== 'wireframe' && <mesh geometry={geometry} scale={1.001}>
        <meshBasicMaterial color={light ? '#183f2b' : '#3c5942'} wireframe transparent opacity={topology / 100 * .78} depthWrite={false} />
      </mesh>}
      <mesh position={[0, 1.35, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.3, .41, 96]} /><meshStandardMaterial color={light ? '#718b70' : '#b9c7a7'} roughness={.5} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -1.365, 0]}><cylinderGeometry args={[1.2, 1.2, .035, 96]} /><meshStandardMaterial color={light ? '#c9cbbd' : '#314537'} roughness={.85} /></mesh>
    </group>
    <OrbitControls ref={controls} makeDefault enablePan={false} enableZoom={false} enableDamping={false} minPolarAngle={.12} maxPolarAngle={Math.PI * .88} />
  </>
}

export default function StudyScene(props) {
  return <SceneBoundary><Canvas dpr={[1, 1.5]} frameloop="demand" camera={{ position: [4, 2.1, 5], fov: 36 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} role="img" aria-label="Interactive illustrative ribbed vessel. Drag to orbit; use view buttons for keyboard inspection.">
    <Vessel {...props} />
  </Canvas></SceneBoundary>
}
