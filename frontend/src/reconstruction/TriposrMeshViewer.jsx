import { useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, DoubleSide } from 'three'

function PredictedMesh({ prediction }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry()
    const vertices = new Float32Array(prediction.vertices.flat())
    const colors = new Float32Array(prediction.vertex_colors.flatMap((rgba) => rgba.slice(0, 3).map((channel) => channel / 255)))
    const indices = new Uint32Array(prediction.faces.flat())
    result.setAttribute('position', new BufferAttribute(vertices, 3))
    result.setAttribute('color', new BufferAttribute(colors, 3))
    result.setIndex(new BufferAttribute(indices, 1))
    result.computeVertexNormals()
    result.computeBoundingSphere()
    const center = result.boundingSphere.center
    const radius = result.boundingSphere.radius
    result.translate(-center.x, -center.y, -center.z)
    if (radius > 0) result.scale(1.35 / radius, 1.35 / radius, 1.35 / radius)
    result.computeBoundingSphere()
    return result
  }, [prediction])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}>
    <meshStandardMaterial vertexColors roughness={0.78} metalness={0.02} side={DoubleSide} />
  </mesh>
}

export function TriposrMeshViewer({ prediction, className = '' }) {
  return <div className={`triposr-viewer ${className}`} role="img" aria-label="Interactive TripoSR predicted mesh. Drag to rotate and scroll to zoom.">
    <Canvas camera={{ position: [2.7, 1.8, 3.2], fov: 38, near: 0.01, far: 100 }} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={['#f2efe7']} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[4, 6, 4]} intensity={2.2} />
      <directionalLight position={[-4, 2, -3]} intensity={1.1} />
      <PredictedMesh prediction={prediction} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} enablePan />
    </Canvas>
  </div>
}
