import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { createStudyGeometry } from './study.js'

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="scene-fallback">3D preview is unavailable on this device. The theme and workspace preview remain available.</div> : this.props.children }
}

function Vessel({ theme, topology, mode, view, reset, hero = false }) {
  const { camera, gl, invalidate, size } = useThree()
  const controls = useRef()
  const form = useRef()
  const revealing = useRef(false)
  const introPlayed = useRef(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return undefined
    const update = () => setReducedMotion(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  const surface = hero ? topology >= 75 ? 'vertices' : topology >= 35 ? 'wireframe' : 'solid' : mode
  const geometry = useMemo(() => {
    const data = createStudyGeometry()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
    g.setIndex(data.indices)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const wireGeometry = useMemo(() => {
    if (!hero) return null
    const position = geometry.getAttribute('position')
    const lines = []
    const connect = (rowA, columnA, rowB, columnB) => {
      for (const index of [rowA * 97 + columnA, rowB * 97 + columnB]) {
        lines.push(position.getX(index), position.getY(index), position.getZ(index))
      }
    }
    for (let row = 0; row <= 64; row += 4) {
      for (let column = 0; column < 96; column += 6) connect(row, column, row, column + 6)
    }
    for (let column = 0; column < 96; column += 6) {
      for (let row = 0; row < 64; row += 4) connect(row, column, row + 4, column)
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    return result
  }, [geometry, hero])
  useEffect(() => () => wireGeometry?.dispose(), [wireGeometry])
  const contactShadow = useMemo(() => {
    if (!hero) return null
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(64, 64, 9, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(0, 0, 0, .5)')
    gradient.addColorStop(.46, 'rgba(0, 0, 0, .23)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(canvas)
  }, [hero])
  useEffect(() => () => contactShadow?.dispose(), [contactShadow])
  useEffect(() => {
    const directions = { iso: [4, 2.1, 5], front: [0, .06, 1], side: [1, .06, 0], top: [0, 1, .001] }
    const fov = THREE.MathUtils.degToRad(camera.fov)
    const aspect = size.width / Math.max(size.height, 1)
    const distance = Math.max(3.25 / (2 * Math.tan(fov / 2)), 2.35 / (2 * Math.tan(fov / 2) * aspect)) * 1.08
    camera.position.fromArray(directions[view || 'iso']).normalize().multiplyScalar(distance)
    camera.lookAt(0, 0, 0)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
    invalidate()
  }, [camera, invalidate, reset, size.height, size.width, view])
  useEffect(() => {
    if (!hero || !form.current) return undefined
    if (reducedMotion) {
      introPlayed.current = true
      revealing.current = false
      form.current.scale.setScalar(1)
      form.current.rotation.set(0, -.4, 0)
      invalidate()
      return undefined
    }
    if (introPlayed.current) return undefined
    let frame = 0
    let started = false
    let observer
    const finish = () => {
      form.current?.scale.setScalar(1)
      if (form.current) form.current.rotation.y = -.4
      revealing.current = false
      invalidate()
    }
    const start = () => {
      if (started) return
      started = true
      introPlayed.current = true
      observer?.disconnect()
      revealing.current = true
      const began = performance.now()
      const tick = now => {
        if (document.hidden) { finish(); return }
        const progress = Math.min((now - began) / 720, 1)
        const eased = 1 - (1 - progress) ** 3
        form.current?.scale.setScalar(.92 + .08 * eased)
        if (form.current) form.current.rotation.y = -.56 + .16 * eased
        invalidate()
        if (progress < 1) frame = requestAnimationFrame(tick)
        else revealing.current = false
      }
      frame = requestAnimationFrame(tick)
    }
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) start() }, { threshold: .15 })
      observer.observe(gl.domElement)
    } else start()
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); revealing.current = false }
  }, [gl, hero, invalidate, reducedMotion])
  const light = theme === 'ivory'
  const move = event => {
    if (!hero || reducedMotion || revealing.current || event.buttons || !form.current) return
    form.current.rotation.y = -.4 + event.pointer.x * .06
    form.current.rotation.x = event.pointer.y * -.025
    invalidate()
  }
  const leave = () => {
    if (!hero || reducedMotion || revealing.current || !form.current) return
    form.current.rotation.set(0, -.4, 0)
    invalidate()
  }
  return <>
    <hemisphereLight args={[light ? '#fffaf0' : '#dce7d5', light ? '#a5ad9a' : '#657a60', light ? .9 : .86]} />
    <ambientLight intensity={light ? .22 : .18} />
    <directionalLight position={[4.5, 6, 4]} intensity={light ? 2.7 : 2.4} color="#fff0d5" />
    <directionalLight position={[-4, 2, 1.5]} intensity={light ? .58 : .68} color="#afc7b1" />
    <directionalLight position={[-2.5, 3.8, -3.5]} intensity={light ? 1.6 : 1.45} color={light ? '#f4ebd1' : '#d7e6c8'} />
    <pointLight position={[0, -1.5, 3.3]} intensity={light ? .62 : .82} color={light ? '#d9cfb5' : '#d6e2c5'} distance={7} decay={2} />
    {hero && <mesh position={[0, -1.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.4, 3.4]} />
      <meshBasicMaterial map={contactShadow} transparent opacity={light ? .48 : .6} depthWrite={false} />
    </mesh>}
    <group ref={form} rotation={[0, hero && !reducedMotion ? -.56 : -.4, 0]} scale={hero && !reducedMotion ? .92 : 1} onPointerMove={move} onPointerOut={leave}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial color={light ? '#718b72' : '#bfcdb1'} roughness={.29} metalness={.16} clearcoat={.48} clearcoatRoughness={.26} side={THREE.DoubleSide} transparent={surface !== 'solid'} opacity={surface === 'solid' ? 1 : surface === 'wireframe' ? .14 : .08} depthWrite={surface === 'solid'} />
      </mesh>
      {surface === 'vertices' && <points geometry={geometry}><pointsMaterial color={light ? '#234a37' : '#ecf5db'} size={.03} sizeAttenuation /></points>}
      {hero && surface !== 'vertices' && topology > 0 && <lineSegments geometry={wireGeometry} scale={1.004}>
        <lineBasicMaterial color={light ? '#234633' : '#e2ebd2'} transparent opacity={surface === 'wireframe' ? .95 : Math.min(topology / 35, 1) * .55} depthWrite={false} />
      </lineSegments>}
      {!hero && surface === 'wireframe' && <mesh geometry={geometry} scale={1.002}>
        <meshBasicMaterial color={light ? '#234633' : '#e2ebd2'} wireframe transparent opacity={.82} depthWrite={false} />
      </mesh>}
      <mesh position={[0, 1.35, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.3, .41, 96]} /><meshStandardMaterial color={light ? '#658263' : '#d5dfc3'} roughness={.34} metalness={.14} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -1.365, 0]}><cylinderGeometry args={[1.2, 1.2, .035, 96]} /><meshStandardMaterial color={light ? '#d0d1c1' : '#2e4838'} roughness={.76} metalness={.09} /></mesh>
    </group>
    <OrbitControls ref={controls} makeDefault enablePan={false} enableZoom={false} enableDamping={false} minPolarAngle={.12} maxPolarAngle={Math.PI * .88} />
  </>
}

export default function StudyScene(props) {
  return <SceneBoundary><Canvas dpr={[1, 1.5]} frameloop="demand" camera={{ position: [4, 2.1, 5], fov: 36 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} role="img" aria-label="Interactive illustrative ribbed vessel. Drag to orbit; use view buttons for keyboard inspection.">
    <Vessel {...props} />
  </Canvas></SceneBoundary>
}
