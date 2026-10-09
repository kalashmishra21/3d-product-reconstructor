import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MathUtils, TorusKnotGeometry, WireframeGeometry } from 'three'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { sceneThemes } from '../theme/theme.js'

function Form({ compact, stage, animate, pointer, hovered, palette }) {
  const group = useRef(null)
  const elapsed = useRef(0)
  const shape = useMemo(() => new TorusKnotGeometry(1.05, 0.31, compact ? 64 : 96, 8, 2, 3), [compact])
  const wire = useMemo(() => new WireframeGeometry(shape), [shape])
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => () => { shape.dispose(); wire.dispose() }, [shape, wire])
  useEffect(() => {
    if (!animate) return
    const timer = window.setInterval(invalidate, 1000 / 30)
    return () => window.clearInterval(timer)
  }, [animate, invalidate])
  useFrame((_, delta) => {
    if (!animate || !group.current) return
    elapsed.current += Math.min(delta, 0.06)
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, elapsed.current * 0.055 + pointer.current.x * 0.16, 3, delta)
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, 0.35 + pointer.current.y * 0.1, 3, delta)
  })
  return <group ref={group} rotation={[0.35, 0, -0.15]}>
    <mesh geometry={shape} visible={stage === 'Surface'}>
      <meshStandardMaterial color={palette.solid} metalness={0.32} roughness={0.48} emissive="#63794d" emissiveIntensity={hovered ? 0.22 : 0.08} />
    </mesh>
    <lineSegments geometry={wire} visible={stage === 'Wireframe'}><lineBasicMaterial color={hovered ? palette.points : palette.wire} transparent opacity={0.75} /></lineSegments>
    <points geometry={shape} visible={stage === 'Vertices'}><pointsMaterial color={palette.points} size={compact ? 0.026 : 0.022} sizeAttenuation /></points>
  </group>
}

export default function TopologyScene(props) {
  const { theme } = useTheme()
  const palette = sceneThemes[theme]
  return <Canvas frameloop="demand" dpr={[1, props.compact ? 1 : 1.5]} camera={{ position: [0, 0, 6.3], fov: 40 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} fallback={null}>
    <ambientLight intensity={1.1} />
    <directionalLight position={[3, 4, 5]} intensity={3} color={palette.key} />
    <directionalLight position={[-3, -1, 1]} intensity={1.2} color={palette.fill} />
    <Form {...props} palette={palette} />
  </Canvas>
}
