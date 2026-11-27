import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateMeshResponse } from '../src/reconstruction/mesh.js'

function result() {
  return {schema_version:2,status:'complete',model:'Pixel3Mesh',
    model_version:'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500',
    output_type:'point_cloud_and_visible_surface',global_points:Array.from({length:2048},()=>[0,0,0]),
    vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],vertices_count:3,faces_count:1,latency_ms:1}
}
test('versioned surface does not require historical fixed topology',()=>{
  assert.equal(validateMeshResponse(result()),'')
})
test('versioned geometry rejects corrupt indices, identity, coordinates and degenerate faces',()=>{
  for (const damage of [r=>r.faces[0][2]=99,r=>r.model_version='wrong',r=>r.vertices[0][0]=NaN,r=>r.vertices[2]=[2,0,0]]) {
    const value=result(); damage(value); assert.equal(validateMeshResponse(value),'MESH DATA INVALID')
  }
})
