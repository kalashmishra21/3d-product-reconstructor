import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { IcosahedronGeometry, MathUtils, SRGBColorSpace, TextureLoader, WireframeGeometry } from 'three'

function ImageSurface({ url, width, height, scanning, motion, pointer }) {
  const [texture, setTexture] = useState(null)
  const group = useRef(null)
  const scan = useRef(null)
  const time = useRef(0)
  const invalidate = useThree((state) => state.invalidate)
  const scale = Math.min(3.55 / width, 2.65 / height)
  const planeWidth = width * scale
  const planeHeight = height * scale

  useEffect(() => {
    let disposed = false
    setTexture(null)
    const loaded = new TextureLoader().load(url, (imageTexture) => {
      if (disposed) return
      imageTexture.colorSpace = SRGBColorSpace
      imageTexture.anisotropy = 4
      setTexture(imageTexture)
      invalidate()
    }, undefined, () => { if (!disposed) setTexture(null) })
    return () => { disposed = true; loaded.dispose() }
  }, [url, invalidate])

  useFrame((_, delta) => {
    if (!motion || !group.current) return
    const step = Math.min(delta, 0.06)
    time.current += step
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, pointer.current.x * 0.09, 3, step)
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, -pointer.current.y * 0.06, 3, step)
    if (scan.current && scanning) scan.current.position.y = ((time.current * 0.8) % (planeHeight + 0.3)) - planeHeight / 2
  })

  return <group ref={group} rotation={[0.02, -0.05, 0]}>
    <mesh position={[0.11, -0.11, -0.18]}><planeGeometry args={[planeWidth + 0.18, planeHeight + 0.18]} /><meshBasicMaterial color="#101710" /></mesh>
    <mesh position={[0, 0, -0.06]}><planeGeometry args={[planeWidth + 0.11, planeHeight + 0.11]} /><meshBasicMaterial color="#b2bf92" /></mesh>
    <mesh position={[0, 0, 0]}><planeGeometry args={[planeWidth, planeHeight]} /><meshBasicMaterial color={texture ? '#ffffff' : '#46553e'} map={texture} toneMapped={false} /></mesh>
    <mesh ref={scan} position={[0, 0, 0.018]} visible={scanning}>
      <planeGeometry args={[planeWidth, 0.025]} /><meshBasicMaterial color="#e7f0c6" transparent opacity={0.8} depthWrite={false} />
    </mesh>
  </group>
}

function SpatialGuide({ compact, motion, pointer }) {
  const group = useRef(null)
  const time = useRef(0)
  const shape = useMemo(() => new IcosahedronGeometry(1.32, compact ? 0 : 1), [compact])
  const wire = useMemo(() => new WireframeGeometry(shape), [shape])
  useEffect(() => () => { shape.dispose(); wire.dispose() }, [shape, wire])
  useFrame((_, delta) => {
    if (!motion || !group.current) return
    const step = Math.min(delta, 0.06)
    time.current += step
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, time.current * 0.12 + pointer.current.x * 0.16, 2, step)
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, 0.22 + pointer.current.y * 0.12, 2, step)
  })
  return <group ref={group} rotation={[0.22, 0.3, 0]}>
    <mesh geometry={shape}><meshStandardMaterial color="#48563d" transparent opacity={0.13} depthWrite={false} side={2} /></mesh>
    <lineSegments geometry={wire}><lineBasicMaterial color="#c9d8a7" transparent opacity={0.82} /></lineSegments>
    <points geometry={shape}><pointsMaterial color="#f0f3d8" size={compact ? 0.043 : 0.032} sizeAttenuation /></points>
    <mesh rotation={[Math.PI / 2.5, 0, 0]}><torusGeometry args={[1.9, 0.004, 3, 96]} /><meshBasicMaterial color="#8b9b76" transparent opacity={0.6} /></mesh>
  </group>
}

function Stage({ previewUrl, width, height, scanning, compact, motion, pointer }) {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    if (!motion) return
    const timer = window.setInterval(invalidate, 1000 / 24)
    return () => window.clearInterval(timer)
  }, [motion, invalidate])
  return <>
    <ambientLight intensity={1.2} />
    <directionalLight position={[3, 4, 5]} intensity={2.2} color="#e5edcf" />
    <directionalLight position={[-3, -2, 2]} intensity={0.8} color="#768a61" />
    <gridHelper args={[8, compact ? 8 : 16, '#697d5a', '#455541']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.55]} />
    {previewUrl && width && height ? <ImageSurface url={previewUrl} width={width} height={height} scanning={scanning} motion={motion} pointer={pointer} /> : <SpatialGuide compact={compact} motion={motion} pointer={pointer} />}
    <OrbitControls enablePan={false} enableZoom={!compact} enableRotate={!compact} minDistance={5} maxDistance={8} minAzimuthAngle={-0.5} maxAzimuthAngle={0.5} minPolarAngle={1.1} maxPolarAngle={2.0} />
  </>
}

export default function InputScene(props) {
  return <Canvas frameloop="demand" dpr={[1, props.compact ? 1 : 1.5]} camera={{ position: [0, 0, 6.4], fov: 42 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} fallback={null}>
    <Stage {...props} />
  </Canvas>
}
