// Historical Pixel2Mesh research visualization. These values describe the
// original graph-deformation architecture, not the active inference service.
export const pipeline = Object.freeze([
  'RGB image', 'VGG16 image features', 'Graph feature fusion',
  'Coarse mesh deformation', 'Mesh upsampling', 'Fine mesh deformation',
])

export const trainedCategories = Object.freeze([
  ['02691156', 'Airplane'], ['02828884', 'Bench'], ['02933112', 'Cabinet'],
  ['02958343', 'Car'], ['03001627', 'Chair'], ['03211117', 'Display'],
  ['03636649', 'Lamp'], ['03691459', 'Loudspeaker'], ['04090263', 'Rifle'],
  ['04256520', 'Sofa'], ['04379243', 'Table'], ['04401088', 'Telephone'],
  ['04530566', 'Watercraft'],
].map(([id, label]) => Object.freeze({ id, label })))

export const stages = Object.freeze([
  Object.freeze({ number: '01', vertices: 156, faces: 308, heading: 'Establish the coarse form', description: 'The first graph deformation moves the initial ellipsoid toward a coarse object shape.' }),
  Object.freeze({ number: '02', vertices: 618, faces: 1232, heading: 'Refine the silhouette', description: 'Graph unpooling increases the mesh resolution before a second deformation.' }),
  Object.freeze({ number: '03', vertices: 2466, faces: 4928, heading: 'Complete the research pipeline', description: 'The final historical stage refines the research mesh. These fixed counts are not used by the current reconstruction interface.' }),
])

export const metrics = Object.freeze([
  Object.freeze({ label: 'Chamfer Distance', value: '0.037181', description: 'Historical Pixel2Mesh benchmark result; it does not describe the current inference service.' }),
  Object.freeze({ label: 'F1 @ τ', value: '0.000640', description: 'Historical Pixel2Mesh benchmark result; it does not describe the current inference service.' }),
  Object.freeze({ label: 'F1 @ 2τ', value: '0.001722', description: 'Historical Pixel2Mesh benchmark result; it does not describe the current inference service.' }),
])

export const researchStatus = 'Pixel2Mesh is preserved as the original research architecture. It is not the active inference engine.'
