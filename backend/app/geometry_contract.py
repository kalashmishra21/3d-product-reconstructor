"""Validate the public point-cloud and visible-surface output contract."""
import math
from app.model_readiness import SELECTED_SHA256


def validate_reconstruction(result):
    if not isinstance(result, dict) or result.get('schema_version') != 2 or result.get('model') != 'Pixel3Mesh':
        raise ValueError('Unknown reconstruction schema')
    if result.get('status') != 'complete' or result.get('model_version') != SELECTED_SHA256:
        raise ValueError('Unverified model identity')
    if result.get('output_type') != 'point_cloud_and_visible_surface':
        raise ValueError('Unsupported geometry representation')
    for name, minimum, maximum in [('global_points', 2048, 2048), ('vertices', 3, 50176)]:
        values = result.get(name)
        if not isinstance(values, list) or not minimum <= len(values) <= maximum:
            raise ValueError('Invalid coordinate count')
        if any(not isinstance(row, list) or len(row) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in row) for row in values):
            raise ValueError('Invalid coordinates')
    faces, vertices = result.get('faces'), result['vertices']
    if not isinstance(faces, list) or not 1 <= len(faces) <= 100000:
        raise ValueError('Invalid face count')
    seen = set()
    for face in faces:
        if not isinstance(face, list) or len(face) != 3 or any(type(i) is not int or not 0 <= i < len(vertices) for i in face) or len(set(face)) != 3:
            raise ValueError('Invalid triangle indices')
        key = tuple(sorted(face))
        if key in seen:
            raise ValueError('Duplicate triangle')
        seen.add(key)
        a, b, c = (vertices[i] for i in face)
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        if not all(math.isfinite(x) for x in cross) or sum(x*x for x in cross) <= 1e-20:
            raise ValueError('Degenerate triangle')
    if result.get('vertices_count') != len(vertices) or result.get('faces_count') != len(faces):
        raise ValueError('Geometry count mismatch')
    latency = result.get('latency_ms')
    if type(latency) not in (int, float) or not math.isfinite(latency) or latency < 0:
        raise ValueError('Invalid inference timing')
    return result
