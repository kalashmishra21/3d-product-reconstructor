export const pipeline = Object.freeze(['RGB image', 'VGG16', 'Image features', 'Graph deformation', 'Stage 01', 'Stage 02', 'Stage 03'])

// IDs follow dataset_tools/prepare_pixel2mesh_subset.py; labels follow the
// ShapeNetCore v1 synset mapping used by PyTorch3D:
// https://github.com/facebookresearch/pytorch3d/blob/main/pytorch3d/datasets/shapenet/shapenet_synset_dict_v1.json
export const trainedCategories = Object.freeze([
  ['02691156', 'Airplane'], ['02828884', 'Bench'], ['02933112', 'Cabinet'],
  ['02958343', 'Car'], ['03001627', 'Chair'], ['03211117', 'Display'],
  ['03636649', 'Lamp'], ['03691459', 'Loudspeaker'], ['04090263', 'Rifle'],
  ['04256520', 'Sofa'], ['04379243', 'Table'], ['04401088', 'Telephone'],
  ['04530566', 'Watercraft'],
].map(([id, label]) => Object.freeze({ id, label })))

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
