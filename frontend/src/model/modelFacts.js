export const pipeline = Object.freeze(['RGB image', 'VGG16', 'Image features', 'Graph deformation', 'Stage 01', 'Stage 02', 'Stage 03'])

export const stages = Object.freeze([
  Object.freeze({ number: '01', vertices: 156, faces: 308, heading: 'Establish the coarse form', description: 'The first graph deformation moves a low-density ellipsoid toward an image-guided shape.' }),
  Object.freeze({ number: '02', vertices: 618, faces: 1232, heading: 'Refine the silhouette', description: 'The mesh is unpooled to a denser topology before the next graph deformation.' }),
  Object.freeze({ number: '03', vertices: 2466, faces: 4928, heading: 'Produce final geometry', description: 'The third deformation produces the final vertex coordinates and triangle faces used by the viewer and exports.' }),
])

export const metrics = Object.freeze([
  Object.freeze({ label: 'Chamfer Distance', value: '0.037181', description: 'A test-set distance between sampled predicted and reference surfaces; lower is better.' }),
  Object.freeze({ label: 'F1 @ τ', value: '0.000640', description: 'A test-set precision/recall measure at the evaluator’s smaller distance threshold.' }),
  Object.freeze({ label: 'F1 @ 2τ', value: '0.001722', description: 'The same test-set measure at twice that distance threshold.' }),
])
