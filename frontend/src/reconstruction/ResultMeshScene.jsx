import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

function RealMesh({ mesh, mode, fitVersion }) {
  const { invalidate } = useThree()
  const controls = useRef(null)
  const geometry = useMemo(() => {
    const result = new BufferGeometry()
    const positions = new Float32Array(mesh.vertices.flat())
    const indices = mesh.faces.flat()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    result.setIndex(indices)
    result.computeVertexNormals()
    result.computeBoundingBox()
    const center = new Vector3()
    const size = new Vector3()
    result.boundingBox?.getCenter(center)
    result.boundingBox?.getSize(size)
    const largest = Math.max(size.x, size.y, size.z, 0.0001)
    const displayScale = 2.45 / largest
    // This geometry is a display copy. The raw model arrays in reconstruction
    // state remain unchanged for the later OBJ/GLB export stage.
    result.translate(-center.x, -center.y, -center.z)
    result.scale(displayScale, displayScale, displayScale)
    result.computeBoundingBox()
    result.computeBoundingSphere()
    return result
  }, [mesh.vertices, mesh.faces])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => { invalidate() }, [geometry, invalidate])
  useEffect(() => {
    if (!controls.current) return
    controls.current.target.set(0, 0, 0)
    controls.current.object.position.set(0, 0, 3.8)
    controls.current.update()
  }, [fitVersion])

  return <>
    <group>
      {mode === 'vertices' ? <points geometry={geometry}>
        <pointsMaterial color="#d9e7b1" size={2.2} sizeAttenuation={false} />
      </points> : <mesh geometry={geometry}>
        {mode === 'wireframe'
          ? <meshBasicMaterial color="#d3e5ae" wireframe transparent opacity={0.95} />
          : <meshStandardMaterial color="#c4cba8" emissive="#657050" emissiveIntensity={0.42} roughness={0.72} metalness={0.04} flatShading={false} side={2} />}
      </mesh>}
    </group>
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan minDistance={2.2} maxDistance={7} target={[0, 0, 0]} />
  </>
}

function Stage({ mesh, mode, fitVersion }) {
  const { invalidate } = useThree()
  useEffect(() => { invalidate() }, [mode, fitVersion, invalidate])
  useEffect(() => {
    const refresh = () => invalidate()
    window.addEventListener('scroll', refresh, { passive: true })
    window.addEventListener('resize', refresh)
    refresh()
    return () => {
      window.removeEventListener('scroll', refresh)
      window.removeEventListener('resize', refresh)
    }
  }, [invalidate])
  return <>
    <ambientLight intensity={1.25} color="#dfe9c7" />
    <directionalLight position={[3, 4, 5]} intensity={2.6} color="#f5f2d9" />
    <directionalLight position={[-4, -1, 2]} intensity={1.1} color="#82996c" />
    <gridHelper args={[8, 16, '#687c59', '#3e503d']} position={[0, -1.65, -1.25]} />
    <RealMesh mesh={mesh} mode={mode} fitVersion={fitVersion} />
  </>
}

export default function ResultMeshScene({ mesh, mode, fitVersion }) {
  return <Canvas
    frameloop="always"
    dpr={[1, 1.5]}
    camera={{ position: [0, 0, 3.8], fov: 38, near: 0.01, far: 100 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    fallback={null}
  >
    <Stage mesh={mesh} mode={mode} fitVersion={fitVersion} />
  </Canvas>
}
