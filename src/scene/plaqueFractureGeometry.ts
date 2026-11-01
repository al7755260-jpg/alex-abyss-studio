import {
  Box3, BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector3,
  type Material, type Object3D,
} from 'three'
import { plaqueCellForPoint } from './plaqueFractureMotion.ts'

export type PlaqueFragment = { group: Group; home: Vector3; index: number }
export type PlaqueFractureGeometry = {
  root: Group
  cracks: LineSegments<BufferGeometry, LineBasicMaterial>
  pieces: PlaqueFragment[]
  triangleCount: number
  dispose: () => void
}

/**
 * Partitions the ORIGINAL surface triangles, including original UVs and normals.
 * Each yield bounds the work so the browser can prepare the 155k-face asset
 * over several idle slices, never in the fifth-click event handler.
 */
export function* buildPlaqueFractureGeometry(
  source: Object3D,
  fitScale: number,
  offset: Vector3,
  height: number,
  width: number,
): Generator<void, PlaqueFractureGeometry, unknown> {
  const root = new Group()
  root.name = 'plaque-fracture-pieces'
  const pieces: PlaqueFragment[] = Array.from({ length: 16 }, (_, index) => {
    const group = new Group()
    group.name = `plaque-fragment:${index}`
    root.add(group)
    return { group, home: new Vector3(), index }
  })
  const geometries: BufferGeometry[] = []
  const sideMaterial = new MeshStandardMaterial({ color: '#171310', roughness: 0.96, metalness: 0.04 })
  const crackMaterial = new LineBasicMaterial({
    color: '#090705', transparent: true, opacity: 0, depthWrite: false,
  })
  const crackPositions: number[] = []
  const sidePositions: number[][] = Array.from({ length: 16 }, () => [])
  let completed = false
  let triangleCount = 0
  const dispose = () => {
    for (const geometry of geometries) geometry.dispose()
    sideMaterial.dispose()
    crackMaterial.dispose()
    root.clear()
  }

  try {
    source.updateMatrixWorld(true)
    const meshes: Mesh[] = []
    source.traverse((child) => { if (child instanceof Mesh) meshes.push(child) })
    const fitted = new Matrix4().makeScale(fitScale, fitScale, fitScale)
      .multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z))
    const point = new Vector3()
    const normal = new Vector3()

    for (const mesh of meshes) {
      const original = mesh.geometry
      const sourcePositions = original.getAttribute('position')
      const sourceNormals = original.getAttribute('normal')
      const matrix = new Matrix4().multiplyMatrices(fitted, mesh.matrixWorld)
      const normalMatrix = new Matrix3().getNormalMatrix(matrix)
      const positions = new Float32Array(sourcePositions.count * 3)
      const normals = new Float32Array(sourcePositions.count * 3)
      for (let i = 0; i < sourcePositions.count; i++) {
        point.fromBufferAttribute(sourcePositions, i).applyMatrix4(matrix).toArray(positions, i * 3)
        if (sourceNormals) normal.fromBufferAttribute(sourceNormals, i).applyNormalMatrix(normalMatrix).toArray(normals, i * 3)
        if (i % 2048 === 2047) yield
      }
      const positionAttribute = new Float32BufferAttribute(positions, 3)
      const normalAttribute = new Float32BufferAttribute(normals, 3)
      const buckets: number[][] = Array.from({ length: 16 }, () => [])
      const faceCount = Math.floor((original.index?.count ?? sourcePositions.count) / 3)
      const edgeOwners = new Map<number, { cell: number; a: number; b: number }>()
      const vertexIndex = (i: number) => original.index ? original.index.getX(i) : i
      const appendSide = (cell: number, a: number, b: number) => {
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2]
        const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2]
        sidePositions[cell].push(ax, ay, az, bx, by, bz, 0, by, bz, ax, ay, az, 0, by, bz, 0, ay, az)
      }

      for (let face = 0; face < faceCount; face++) {
        const a = vertexIndex(face * 3), b = vertexIndex(face * 3 + 1), c = vertexIndex(face * 3 + 2)
        const y = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3
        const z = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3
        const cell = plaqueCellForPoint(y, z, height, width)
        buckets[cell].push(a, b, c)
        for (let edge = 0; edge < 3; edge++) {
          const first = edge === 0 ? a : edge === 1 ? b : c
          const second = edge === 0 ? b : edge === 1 ? c : a
          const key = Math.min(first, second) * sourcePositions.count + Math.max(first, second)
          const previous = edgeOwners.get(key)
          if (!previous) edgeOwners.set(key, { cell, a: first, b: second })
          else {
            edgeOwners.delete(key)
            if (previous.cell !== cell) {
              appendSide(cell, first, second)
              appendSide(previous.cell, previous.a, previous.b)
              if ((positions[first * 3] + positions[second * 3]) / 2 > 0) {
                const lift = height * 0.0015
                crackPositions.push(
                  positions[first * 3] + lift, positions[first * 3 + 1], positions[first * 3 + 2],
                  positions[second * 3] + lift, positions[second * 3 + 1], positions[second * 3 + 2],
                )
              }
            }
          }
        }
        if (face % 1024 === 1023) yield
      }
      triangleCount += faceCount
      edgeOwners.clear()
      for (let cell = 0; cell < 16; cell++) {
        if (!buckets[cell].length) continue
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', positionAttribute)
        if (sourceNormals) geometry.setAttribute('normal', normalAttribute)
        for (const name of Object.keys(original.attributes)) {
          if (name !== 'position' && name !== 'normal') geometry.setAttribute(name, original.getAttribute(name))
        }
        geometry.setIndex(buckets[cell])
        // The delivered plaque has one material. Preserve group ownership as
        // well if a future replacement uses several original materials.
        if (Array.isArray(mesh.material) && original.groups.length) {
          const materialByFace = new Map<number, number>()
          for (const group of original.groups) {
            for (let i = group.start; i < group.start + group.count; i += 3) materialByFace.set(i / 3, group.materialIndex ?? 0)
          }
          const cellFaces: number[] = []
          for (let face = 0; face < faceCount; face++) {
            const a = vertexIndex(face * 3), b = vertexIndex(face * 3 + 1), c = vertexIndex(face * 3 + 2)
            const y = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3
            const z = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3
            if (plaqueCellForPoint(y, z, height, width) === cell) cellFaces.push(face)
          }
          cellFaces.forEach((face, index) => geometry.addGroup(index * 3, 3, materialByFace.get(face) ?? 0))
        }
        geometries.push(geometry)
        const surface = new Mesh(geometry, mesh.material as Material | Material[])
        surface.name = `plaque-original-surface:${cell}`
        surface.receiveShadow = mesh.receiveShadow
        surface.castShadow = mesh.castShadow
        surface.frustumCulled = false
        pieces[cell].group.add(surface)
      }
      yield
    }

    for (const piece of pieces) {
      const sides = sidePositions[piece.index]
      if (sides.length) {
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(sides, 3))
        geometry.computeVertexNormals()
        geometries.push(geometry)
        const sideMesh = new Mesh(geometry, sideMaterial)
        sideMesh.name = 'plaque-dark-fracture-edges'
        piece.group.add(sideMesh)
      }
      // Bounds must use the selected indices; the shared position attribute
      // deliberately contains the full plaque to avoid 16 copies of its UVs.
      const bounds = new Box3()
      for (const child of piece.group.children) {
        if (!(child instanceof Mesh) || !child.geometry.index) continue
        const positions = child.geometry.getAttribute('position')
        for (let i = 0; i < child.geometry.index.count; i++) {
          bounds.expandByPoint(point.fromBufferAttribute(positions, child.geometry.index.getX(i)))
        }
      }
      if (!bounds.isEmpty()) bounds.getCenter(piece.home)
      piece.group.position.copy(piece.home)
      for (const child of piece.group.children) child.position.copy(piece.home).multiplyScalar(-1)
      yield
    }
    const crackGeometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(crackPositions, 3))
    geometries.push(crackGeometry)
    const cracks = new LineSegments(crackGeometry, crackMaterial)
    cracks.name = 'plaque-hairline-cracks'
    cracks.renderOrder = 2
    cracks.visible = false
    completed = true
    return { root, cracks, pieces, triangleCount, dispose }
  } finally {
    if (!completed) dispose()
  }
}
