import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EdgesGeometry, IcosahedronGeometry, MathUtils } from 'three'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { sceneThemes } from '../theme/theme.js'

function Topology({ compact, reducedMotion, palette }) {
  const group = useRef(null)
  const pointer = useRef({ x: 0, y: 0 })
  const shape = useMemo(() => new IcosahedronGeometry(1.6, compact ? 1 : 2), [compact])
  const edges = useMemo(() => new EdgesGeometry(shape, 3), [shape])

  useEffect(() => () => { shape.dispose(); edges.dispose() }, [shape, edges])
  useEffect(() => {
    if (reducedMotion) return
    const move = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.current.y = (event.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [reducedMotion])

  useFrame((state, delta) => {
    if (!group.current || reducedMotion) return
    const slowTime = state.clock.elapsedTime
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, slowTime * 0.07 + pointer.current.x * 0.12, 2, delta)
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, 0.22 + Math.sin(slowTime * 0.17) * 0.06 - pointer.current.y * 0.09, 2, delta)
  })

  return <group ref={group} position={compact ? [0, 1.48, 0] : [-1.45, 0.12, 0]} rotation={[0.22, -0.32, 0]} scale={compact ? 0.9 : 1.16}>
    <mesh geometry={shape}><meshPhongMaterial color={palette.solid} emissive="#283f27" emissiveIntensity={0.4} transparent opacity={0.17} shininess={80} depthWrite={false} /></mesh>
    <lineSegments geometry={edges}><lineBasicMaterial color={palette.wire} transparent opacity={0.72} /></lineSegments>
    <points geometry={shape}><pointsMaterial color={palette.points} transparent opacity={0.78} size={0.018} sizeAttenuation depthWrite={false} /></points>
    <mesh rotation={[0.7, 0.2, 0]}><torusGeometry args={[2.03, 0.006, 3, 80]} /><meshBasicMaterial color={palette.gridCenter} transparent opacity={0.42} /></mesh>
    <mesh rotation={[-0.35, 0.75, 0]}><torusGeometry args={[2.27, 0.004, 3, 80]} /><meshBasicMaterial color={palette.grid} transparent opacity={0.3} /></mesh>
  </group>
}

export default function AuthScene({ compact, reducedMotion, visible }) {
  const { theme } = useTheme()
  const palette = sceneThemes[theme]
  return <Canvas
    frameloop={visible && !reducedMotion ? 'always' : 'demand'}
    dpr={[1, 1.5]}
    camera={{ position: [0, 0, 8], fov: 40 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    fallback={null}
    onCreated={({ invalidate }) => invalidate()}
    style={{ pointerEvents: 'none' }}
  >
    <ambientLight intensity={0.7} />
    <pointLight position={[-4, 3, 5]} intensity={25} color={palette.key} />
    <Topology compact={compact} reducedMotion={reducedMotion} palette={palette} />
  </Canvas>
}
