import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, Mesh, Texture, Vector3, type BufferGeometry, type Material, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

export const SMALL_PROP_NEAR_DISTANCE = 8
export const SMALL_PROP_FAR_DISTANCE = 8.8

type GeometryPair = { mesh: Mesh; original: BufferGeometry; realtime: BufferGeometry }

export function smallPropUsesRealtime(distance: number, current: boolean) {
  if (!Number.isFinite(distance)) return current
  return current ? distance > SMALL_PROP_NEAR_DISTANCE : distance >= SMALL_PROP_FAR_DISTANCE
}

/** Reject mismatched exports as a whole, retaining the original model. */
export function matchSmallPropLodMeshes(original: Object3D, realtime: Object3D): GeometryPair[] | null {
  const originals: Mesh[] = []
  const simplified: Mesh[] = []
  original.traverse((node) => { if (node instanceof Mesh) originals.push(node) })
  realtime.traverse((node) => { if (node instanceof Mesh) simplified.push(node) })
  if (!originals.length || originals.length !== simplified.length) return null
  const pairs: GeometryPair[] = []
  for (let index = 0; index < originals.length; index++) {
    const mesh = originals[index]
    const low = simplified[index]
    if (mesh.name !== low.name) return null
    if (Object.keys(mesh.geometry.attributes).some((key) => !low.geometry.getAttribute(key))) return null
    if (mesh.geometry.groups.map((group) => group.materialIndex).join(',')
      !== low.geometry.groups.map((group) => group.materialIndex).join(',')) return null
    pairs.push({ mesh, original: mesh.geometry, realtime: low.geometry })
  }
  return pairs
}

const realtimeScenes = new Map<string, Promise<Object3D | null>>()

function loadRealtimeScene(url: string) {
  let pending = realtimeScenes.get(url)
  if (!pending) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    pending = loader.loadAsync(url).then(({ scene }) => {
      // Only low-poly geometry is used. Keep the already loaded original PBR
      // materials/textures on every live mesh, avoiding duplicate GPU textures.
      const materials = new Set<Material>()
      const textures = new Set<Texture>()
      scene.traverse((node) => {
        if (!(node instanceof Mesh)) return
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value)
          materials.add(material)
        }
        node.material = []
      })
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      return scene
    }).catch((error: unknown) => {
      console.warn('[深渊工作室] 小物件远景模型不可用，继续使用完整模型。', url, error)
      return null
    })
    realtimeScenes.set(url, pending)
  }
  return pending
}

/** Geometry-only LOD: one live mesh/material per primitive and no React state. */
export function useSmallPropLod(object: Object3D, realtimeUrl: string | null) {
  const pairsRef = useRef<GeometryPair[] | null>(null)
  const farRef = useRef(false)
  const localCenterRef = useRef(new Vector3())
  const worldCenterRef = useRef(new Vector3())
  const cameraPositionRef = useRef(new Vector3())

  useEffect(() => {
    if (!realtimeUrl) return
    let disposed = false
    object.updateWorldMatrix(true, true)
    const center = new Box3().setFromObject(object).getCenter(new Vector3())
    localCenterRef.current.copy(object.worldToLocal(center))
    void loadRealtimeScene(realtimeUrl).then((scene) => {
      if (disposed || !scene) return
      pairsRef.current = matchSmallPropLodMeshes(object, scene)
    })
    return () => {
      disposed = true
      pairsRef.current?.forEach(({ mesh, original }) => { mesh.geometry = original })
      pairsRef.current = null
      farRef.current = false
    }
  }, [object, realtimeUrl])

  useFrame(({ camera }) => {
    const pairs = pairsRef.current
    if (!pairs) return
    object.localToWorld(worldCenterRef.current.copy(localCenterRef.current))
    camera.getWorldPosition(cameraPositionRef.current)
    const distance = cameraPositionRef.current.distanceTo(worldCenterRef.current)
    const far = smallPropUsesRealtime(distance, farRef.current)
    if (far === farRef.current) return
    for (const pair of pairs) pair.mesh.geometry = far ? pair.realtime : pair.original
    farRef.current = far
  })
}
