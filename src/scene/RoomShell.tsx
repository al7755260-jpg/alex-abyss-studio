import { RoundedBox } from '@react-three/drei'

const STONE = '#111315'
const STONE_RAISED = '#1d2021'
const MORTAR = '#080a0b'
const OXIDE = '#3d2423'

function StoneMaterial({ color = STONE }: { color?: string }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.92}
      metalness={0.05}
    />
  )
}

function WallArch({ x, showSigil = true }: { x: number; showSigil?: boolean }) {
  return (
    <group position={[x, 0, -3.075]}>
      <mesh position={[0, 2.05, 0]} castShadow receiveShadow>
        <torusGeometry args={[0.72, 0.075, 8, 32, Math.PI]} />
        <StoneMaterial color={STONE_RAISED} />
      </mesh>
      {[-0.72, 0.72].map((offset) => (
        <RoundedBox
          key={offset}
          args={[0.15, 1.36, 0.15]}
          radius={0.025}
          smoothness={3}
          position={[offset, 1.38, 0]}
          castShadow
          receiveShadow
        >
          <StoneMaterial color={STONE_RAISED} />
        </RoundedBox>
      ))}
      {showSigil ? (
        <mesh position={[0, 1.92, 0.045]}>
          <circleGeometry args={[0.17, 32]} />
          <meshStandardMaterial
            color="#3d191c"
            emissive="#4d1115"
            emissiveIntensity={0.7}
            roughness={0.75}
          />
        </mesh>
      ) : null}
    </group>
  )
}

export function RoomShell({ brainMode = false }: { brainMode?: boolean }) {
  if (brainMode) {
    return null
  }

  return (
    <group>
      {brainMode ? null : (
        <>
          <mesh position={[0, -0.065, -0.15]} receiveShadow>
            <boxGeometry args={[8.2, 0.13, 6.25]} />
            <StoneMaterial color={MORTAR} />
          </mesh>

          {Array.from({ length: 9 }, (_, index) => (
            <mesh
              key={`floor-slab-${index}`}
              position={[-3.56 + index * 0.89, 0.004, -0.18]}
              receiveShadow
            >
              <boxGeometry args={[0.84, 0.025, 5.92]} />
              <StoneMaterial color={index % 2 ? '#121416' : '#161718'} />
            </mesh>
          ))}
        </>
      )}
      {brainMode ? null : (
        <>
          <mesh position={[0, 1.7, -3.08]} receiveShadow>
            <planeGeometry args={[8.1, 3.4, 1, 1]} />
            <StoneMaterial />
          </mesh>
          <mesh position={[-4.04, 1.7, -0.7]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[4.8, 3.4, 1, 1]} />
            <StoneMaterial color="#0f1213" />
          </mesh>
          <mesh position={[4.04, 1.7, -0.7]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[4.8, 3.4, 1, 1]} />
            <StoneMaterial color="#0f1213" />
          </mesh>
        </>
      )}

      {[-3.75, -1.9, 0, 1.9, 3.75].map((x) => (
        <RoundedBox
          key={`pillar-${x}`}
          args={[0.2, 3.28, 0.19]}
          radius={0.025}
          smoothness={3}
          position={[x, 1.64, -3.0]}
          castShadow
          receiveShadow
        >
          <StoneMaterial color={STONE_RAISED} />
        </RoundedBox>
      ))}
      <WallArch x={-2.82} />
      <WallArch x={0} />
      <WallArch x={2.82} showSigil={false} />

      <RoundedBox
        args={[8.12, 0.19, 0.2]}
        radius={0.025}
        smoothness={3}
        position={[0, 3.29, -3.0]}
        castShadow
      >
        <StoneMaterial color="#252728" />
      </RoundedBox>
      {[-3.92, 3.92].map((x) => (
        <group key={`corner-${x}`}>
          <RoundedBox
            args={[0.25, 3.34, 0.25]}
            radius={0.035}
            smoothness={3}
            position={[x, 1.67, -3.0]}
            castShadow
          >
            <StoneMaterial color="#252627" />
          </RoundedBox>
          <mesh position={[x, 2.62, -2.82]} castShadow>
            <coneGeometry args={[0.16, 0.62, 7]} />
            <meshStandardMaterial
              color={OXIDE}
              roughness={0.7}
              metalness={0.18}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}
