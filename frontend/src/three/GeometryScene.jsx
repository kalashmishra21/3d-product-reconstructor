import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils } from 'three'
import { ChairDrawing } from '../components/ChairDrawing'
import { createChairGeometry, createFaceOffsets } from './chairGeometry.js'

function Chair({ stage, rotation, reducedMotion }) {
  const group = useRef(null)
  const invalidate = useThree((state) => state.invalidate)
  const geometry = useMemo(createChairGeometry, [])
  const original = useMemo(() => new Float32Array(geometry.getAttribute('position').array), [geometry])
  const offsets = useMemo(() => createFaceOffsets(geometry), [geometry])
  const amount = useRef(0)
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => { invalidate() }, [stage, rotation, reducedMotion, invalidate])

  useFrame((_, delta) => {
    if (!group.current) return
    const target = stage === 3 ? 1 : 0
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 10)
    const next = reducedMotion ? target : MathUtils.lerp(amount.current, target, blend)
    if (Math.abs(next - amount.current) > 0.00001 || reducedMotion) {
      const positions = geometry.getAttribute('position')
      for (let i = 0; i < original.length; i++) positions.array[i] = original[i] + offsets[i] * next
      positions.needsUpdate = true
      amount.current = next
    }
    group.current.rotation.y = reducedMotion ? rotation : MathUtils.lerp(group.current.rotation.y, rotation, blend)
    if (Math.abs(target - amount.current) > 0.001 || Math.abs(group.current.rotation.y - rotation) > 0.001) invalidate()
  })

  return <group ref={group}>
    <mesh geometry={geometry} visible={stage >= 3}>
      <meshStandardMaterial color="#d9d7c8" roughness={0.53} metalness={0.08} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
    <mesh geometry={geometry} visible={stage === 2 || stage === 3}>
      <meshBasicMaterial color={stage === 2 ? '#d3ddaa' : '#777e64'} wireframe transparent opacity={stage === 2 ? 0.85 : 0.36} />
    </mesh>
    <points geometry={geometry} visible={stage === 1}>
      <pointsMaterial color="#e0c8a2" size={0.021} sizeAttenuation />
    </points>
  </group>
}

function ContextMonitor({ onLost }) {
  const canvas = useThree((state) => state.gl.domElement)
  useEffect(() => {
    const lost = (event) => { event.preventDefault(); onLost() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [canvas, onLost])
  return null
}

export default function GeometryScene(props) {
  const [contextLost, setContextLost] = useState(false)
  const onLost = useCallback(() => setContextLost(true), [])
  const fallback = <div className="static-scene"><ChairDrawing wire /><p>3D is unavailable. This static illustration explains the same concept.</p></div>
  if (contextLost) return fallback

  return <Canvas
    frameloop="demand" dpr={[1, 1.5]}
    camera={{ position: [3.4, 2.7, -4.8], fov: 33 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    fallback={fallback}
    onCreated={({ camera }) => camera.lookAt(0, 1.02, 0)}
    style={{ touchAction: 'pan-y' }} aria-hidden="true"
  >
    <ContextMonitor onLost={onLost} />
    <ambientLight intensity={0.8} />
    <directionalLight position={[-3, 5, -3]} intensity={3.3} color="#fff4dc" />
    <directionalLight position={[3, 2, 3]} intensity={2} color="#c3d2be" />
    <Chair {...props} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]}>
      <circleGeometry args={[1.32, 64]} /><meshBasicMaterial color="#11150f" transparent opacity={0.45} />
    </mesh>
    {[1.38, 1.72].map((radius) => <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}><ringGeometry args={[radius, radius + 0.004, 80]} /><meshBasicMaterial color="#7b836b" transparent opacity={0.3} /></mesh>)}
    {props.finePointer && <OrbitControls target={[0, 1.02, 0]} enablePan={false} enableZoom={false} enableDamping={!props.reducedMotion} minPolarAngle={0.4} maxPolarAngle={Math.PI / 2.05} />}
  </Canvas>
}
