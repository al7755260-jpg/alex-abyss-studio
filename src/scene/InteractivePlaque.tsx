import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Box3, Group, Matrix4, Mesh, Vector3 } from 'three'
import type { StudioAsset } from '../data/studioAssets'
import { AssetSlot } from './AssetSlot'
import { PlaceholderAsset } from './PlaceholderAsset'
import { buildPlaqueFractureGeometry, type PlaqueFractureGeometry } from './plaqueFractureGeometry'
import { PLAQUE_FALL_SECONDS, PlaqueFractureController, resolvePlaqueExitPoint, samplePlaqueFragmentMotion } from './plaqueFractureMotion'

type InteractivePlaqueProps = { asset: StudioAsset; interactive: boolean }

class PlaqueBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.warn('[深渊工作室] 牌匾交互加载失败，已保留完整模型。', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function LoadedInteractivePlaque({ asset, interactive }: InteractivePlaqueProps) {
  const gltf = useGLTF(asset.src!)
  const controller = useRef(new PlaqueFractureController()).current
  const fractureRef = useRef<PlaqueFractureGeometry | null>(null)
  const hoveredRef = useRef(false)
  const previousActiveRef = useRef(false)
  const motionRef = useRef({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })
  const exitState = useMemo(() => ({
    offsets: Array.from({ length: 16 }, () => new Vector3()),
    world: new Vector3(), exit: new Vector3(), inverseRoot: new Matrix4(),
    cameraMatrix: new Matrix4(), projectionMatrix: new Matrix4(), rootMatrix: new Matrix4(),
    dirty: true, wasReturning: false,
  }), [])
  const prepared = useMemo(() => {
    // Only clone transforms. Original cached GLB geometry, textures and
    // materials remain shared and are never disposed by this component.
    const source = gltf.scene.clone(true)
    source.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(source)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale = asset.fit.size / Math.max(0.0001, size[asset.fit.axis])
    const offset = new Vector3(-center.x, -bounds.min.y, -center.z)
    const intact = new Group()
    const fitted = new Group()
    const object = source.clone(true)
    object.position.copy(offset)
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = asset.castShadow
        child.receiveShadow = asset.receiveShadow
      }
    })
    source.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = asset.castShadow
        child.receiveShadow = asset.receiveShadow
      }
    })
    fitted.scale.setScalar(scale)
    fitted.add(object)
    intact.add(fitted)
    const root = new Group()
    root.name = 'interactive-plaque-visuals'
    root.add(intact)
    return { source, root, intact, scale, offset, height: size.y * scale, width: size.z * scale, depth: size.x * scale }
  }, [asset, gltf.scene])

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const builder = buildPlaqueFractureGeometry(
      prepared.source, prepared.scale, prepared.offset, prepared.height, prepared.width,
    )
    const buildSlice = () => {
      if (cancelled) return
      const deadline = performance.now() + 4
      try {
        do {
          const next = builder.next()
          if (next.done) {
            const fracture = next.value
            fracture.root.visible = false
            prepared.root.add(fracture.root)
            prepared.intact.add(fracture.cracks)
            fractureRef.current = fracture
            return
          }
        } while (performance.now() < deadline)
        timer = window.setTimeout(buildSlice, 16)
      } catch (error) {
        console.warn('[深渊工作室] 牌匾碎片准备失败，完整模型保持可见。', error)
      }
    }
    // Begin after the model is committed; preparation never runs in onClick.
    timer = window.setTimeout(buildSlice, 100)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      builder.return(undefined as never)
      const fracture = fractureRef.current
      if (fracture) {
        prepared.root.remove(fracture.root)
        prepared.intact.remove(fracture.cracks)
        fracture.dispose()
      }
      fractureRef.current = null
      if (hoveredRef.current) document.body.style.cursor = ''
    }
  }, [prepared])

  useEffect(() => {
    if (interactive) return
    controller.reset()
    previousActiveRef.current = false
    exitState.dirty = true
    exitState.wasReturning = false
    prepared.intact.visible = true
    prepared.intact.position.set(0, 0, 0)
    prepared.intact.rotation.set(0, 0, 0)
    const fracture = fractureRef.current
    if (fracture) {
      fracture.root.visible = false
      fracture.cracks.visible = false
      for (const piece of fracture.pieces) {
        piece.group.visible = true
        piece.group.position.copy(piece.home)
        piece.group.rotation.set(0, 0, 0)
      }
    }
    if (hoveredRef.current) document.body.style.cursor = ''
    hoveredRef.current = false
  }, [interactive, controller, prepared, exitState])

  useFrame(({ camera }, delta) => {
    // No scene traversal, geometry work, allocations, or redraw requests idle.
    if (!controller.active && !previousActiveRef.current) return
    const fracture = fractureRef.current
    if (!fracture || !interactive) return
    controller.advance(delta)
    previousActiveRef.current = controller.active
    fracture.cracks.visible = false
    if (controller.hits === 0) {
      prepared.intact.visible = true
      fracture.root.visible = false
      for (const piece of fracture.pieces) {
        piece.group.visible = true
        piece.group.position.copy(piece.home)
        piece.group.rotation.set(0, 0, 0)
      }
      exitState.wasReturning = false
      exitState.dirty = true
      return
    }

    prepared.intact.visible = false
    fracture.root.visible = true
    camera.updateMatrixWorld()
    prepared.root.updateWorldMatrix(true, false)
    if (exitState.dirty || controller.returning !== exitState.wasReturning
      || !exitState.cameraMatrix.equals(camera.matrixWorld)
      || !exitState.projectionMatrix.equals(camera.projectionMatrix)
      || !exitState.rootMatrix.equals(prepared.root.matrixWorld)) {
      exitState.inverseRoot.copy(prepared.root.matrixWorld).invert()
      for (const piece of fracture.pieces) {
        exitState.world.copy(piece.home).applyMatrix4(prepared.root.matrixWorld)
        resolvePlaqueExitPoint(camera, exitState.world, exitState.exit)
        exitState.offsets[piece.index].copy(exitState.exit).applyMatrix4(exitState.inverseRoot).sub(piece.home)
      }
      exitState.cameraMatrix.copy(camera.matrixWorld)
      exitState.projectionMatrix.copy(camera.projectionMatrix)
      exitState.rootMatrix.copy(prepared.root.matrixWorld)
      exitState.wasReturning = controller.returning
      exitState.dirty = false
    }
    for (const piece of fracture.pieces) {
      const fallTime = controller.fallTimes[piece.index]
      if (fallTime < 0) {
        piece.group.visible = true
        piece.group.position.copy(piece.home)
        piece.group.rotation.set(0, 0, 0)
        continue
      }
      // Once a fragment has travelled beyond the lower viewport, keep it
      // hidden until collection so later camera orbits cannot reveal it.
      piece.group.visible = fallTime < PLAQUE_FALL_SECONDS || controller.returning
      const motion = samplePlaqueFragmentMotion(
        piece.index, fallTime, controller.returning ? controller.returnTime : -1,
        prepared.height, exitState.offsets[piece.index], motionRef.current,
      )
      piece.group.position.set(piece.home.x + motion.x, piece.home.y + motion.y, piece.home.z + motion.z)
      piece.group.rotation.set(motion.rx, motion.ry, motion.rz)
    }
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (!interactive || event.button !== 0 || event.delta > 8) return
    if (controller.hit()) exitState.dirty = true
  }

  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.visualScale ?? [1, 1, 1]}>
      <primitive object={prepared.root} dispose={null} />
      {interactive ? (
        <mesh
          name="plaque-five-click-interaction"
          position={[0, prepared.height / 2, 0]}
          userData={{ interactionProxy: true, studioAssetId: asset.id }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleClick}
          onPointerEnter={(event) => {
            event.stopPropagation()
            hoveredRef.current = true
            document.body.style.cursor = 'pointer'
          }}
          onPointerLeave={(event) => {
            event.stopPropagation()
            hoveredRef.current = false
            document.body.style.cursor = ''
          }}
        >
          <boxGeometry args={[prepared.depth * 1.08, prepared.height, prepared.width]} />
          <meshBasicMaterial visible={false} transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}

export function InteractivePlaque(props: InteractivePlaqueProps) {
  if (!props.asset.src) return <AssetSlot asset={props.asset} />
  return (
    <PlaqueBoundary fallback={<AssetSlot asset={props.asset} />}>
      <Suspense fallback={<PlaceholderAsset asset={props.asset} loading />}>
        <LoadedInteractivePlaque {...props} />
      </Suspense>
    </PlaqueBoundary>
  )
}
