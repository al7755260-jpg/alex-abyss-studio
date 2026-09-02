import { useMemo, type ReactElement } from 'react'
import { RoundedBox } from '@react-three/drei'
import { CatmullRomCurve3, Vector3 } from 'three'
import type {
  AssetKind,
  StudioAsset,
  Vector3Tuple,
} from '../data/studioAssets'
import { useStudioLightingSettings } from './StudioLightingSettingsContext'

type PlaceholderAssetProps = {
  asset: StudioAsset
  loading?: boolean
}

type TentacleProps = {
  points: Vector3Tuple[]
  radius?: number
  color?: string
  emissive?: string
  emissiveIntensity?: number
}

const BONE = '#817765'
const BONE_DARK = '#484238'
const CHITIN = '#171819'
const CHITIN_LIFT = '#292829'
const FLESH = '#342226'
const BLOOD = '#6a1818'
const ABYSS = '#07090a'
const CYAN = '#4ed1c1'
const ACID = '#a4b966'

const BOOKS = [
  { x: -0.31, h: 0.22, color: '#3c2423' },
  { x: -0.2, h: 0.27, color: '#22292a' },
  { x: -0.08, h: 0.2, color: '#4a3824' },
  { x: 0.05, h: 0.25, color: '#27202a' },
  { x: 0.18, h: 0.19, color: '#3b1c22' },
  { x: 0.3, h: 0.24, color: '#283227' },
] as const

function BoneMaterial({ color = BONE }: { color?: string }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.68}
      metalness={0.06}
    />
  )
}

function ChitinMaterial({ color = CHITIN }: { color?: string }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.38}
      metalness={0.42}
    />
  )
}

function FleshMaterial({ color = FLESH }: { color?: string }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.7}
      metalness={0.02}
    />
  )
}

function GlowMaterial({
  color = CYAN,
  intensity = 2.8,
}: {
  color?: string
  intensity?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={intensity}
      roughness={0.24}
      toneMapped={false}
    />
  )
}

function Tentacle({
  points,
  radius = 0.035,
  color = FLESH,
  emissive = '#000000',
  emissiveIntensity = 0,
}: TentacleProps) {
  const curve = useMemo(
    () => new CatmullRomCurve3(points.map((point) => new Vector3(...point))),
    [points],
  )

  return (
    <mesh castShadow receiveShadow>
      <tubeGeometry args={[curve, 28, radius, 9, false]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.64}
        metalness={0.05}
      />
    </mesh>
  )
}

function Eye({
  position,
  scale = 1,
  color = ACID,
}: {
  position: Vector3Tuple
  scale?: number
  color?: string
}) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow scale={[1, 0.58, 0.34]}>
        <sphereGeometry args={[0.11, 24, 16]} />
        <meshStandardMaterial
          color="#d2c58e"
          roughness={0.34}
          emissive={color}
          emissiveIntensity={0.28}
        />
      </mesh>
      <mesh position={[0, 0, 0.035]} scale={[0.28, 0.76, 0.32]}>
        <sphereGeometry args={[0.12, 18, 12]} />
        <GlowMaterial color={color} intensity={3.1} />
      </mesh>
    </group>
  )
}

function Horn({
  position,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
}: {
  position: Vector3Tuple
  rotation?: Vector3Tuple
  scale?: Vector3Tuple
}) {
  return (
    <mesh
      castShadow
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <coneGeometry args={[0.055, 0.27, 9]} />
      <BoneMaterial color={BONE_DARK} />
    </mesh>
  )
}

function DeskModel() {
  return (
    <group>
      <RoundedBox
        args={[0.94, 0.14, 0.68]}
        radius={0.035}
        smoothness={4}
        position={[0, 0.72, 0]}
        castShadow
        receiveShadow
      >
        <ChitinMaterial color="#202224" />
      </RoundedBox>
      <RoundedBox
        args={[0.76, 0.08, 0.52]}
        radius={0.02}
        smoothness={3}
        position={[0, 0.795, 0.015]}
        castShadow
      >
        <FleshMaterial color="#47292a" />
      </RoundedBox>

      <Tentacle
        points={[
          [-0.39, 0.68, -0.23],
          [-0.43, 0.45, -0.28],
          [-0.36, 0.22, -0.21],
          [-0.42, 0.02, -0.29],
        ]}
        radius={0.047}
      />
      <Tentacle
        points={[
          [0.39, 0.68, -0.23],
          [0.44, 0.46, -0.3],
          [0.34, 0.21, -0.2],
          [0.42, 0.02, -0.29],
        ]}
        radius={0.047}
      />
      <Tentacle
        points={[
          [-0.39, 0.68, 0.23],
          [-0.33, 0.44, 0.3],
          [-0.43, 0.2, 0.23],
          [-0.37, 0.02, 0.31],
        ]}
        radius={0.05}
      />
      <Tentacle
        points={[
          [0.39, 0.68, 0.23],
          [0.32, 0.46, 0.31],
          [0.43, 0.22, 0.21],
          [0.37, 0.02, 0.31],
        ]}
        radius={0.05}
      />

      {[-0.33, -0.18, 0, 0.18, 0.33].map((x) => (
        <mesh
          key={x}
          position={[x, 0.68, 0.352]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <torusGeometry args={[0.07, 0.015, 6, 14, Math.PI]} />
          <BoneMaterial />
        </mesh>
      ))}
      <Eye position={[0, 0.725, 0.365]} scale={0.56} />
      <Horn position={[-0.48, 0.75, -0.26]} rotation={[0, 0, -0.6]} />
      <Horn position={[0.48, 0.75, -0.26]} rotation={[0, 0, 0.6]} />
    </group>
  )
}

function ChairModel() {
  return (
    <group>
      <RoundedBox
        args={[0.68, 0.13, 0.58]}
        radius={0.045}
        smoothness={4}
        position={[0, 0.34, 0.02]}
        castShadow
        receiveShadow
      >
        <FleshMaterial color="#3c2428" />
      </RoundedBox>
      <RoundedBox
        args={[0.62, 0.64, 0.13]}
        radius={0.045}
        smoothness={4}
        position={[0, 0.68, -0.3]}
        castShadow
      >
        <ChitinMaterial color="#222326" />
      </RoundedBox>
      <Eye position={[0, 0.72, -0.225]} scale={0.86} color="#83a75d" />

      {[-0.23, 0, 0.23].map((x) => (
        <mesh key={x} position={[x, 0.7, -0.372]} castShadow>
          <torusGeometry args={[0.11, 0.017, 6, 18, Math.PI]} />
          <BoneMaterial color={BONE_DARK} />
        </mesh>
      ))}

      <Tentacle
        points={[
          [-0.25, 0.31, -0.17],
          [-0.33, 0.21, -0.23],
          [-0.3, 0.08, -0.18],
          [-0.35, 0.015, -0.24],
        ]}
        radius={0.035}
      />
      <Tentacle
        points={[
          [0.25, 0.31, -0.17],
          [0.33, 0.21, -0.23],
          [0.3, 0.08, -0.18],
          [0.35, 0.015, -0.24],
        ]}
        radius={0.035}
      />
      <Tentacle
        points={[
          [-0.25, 0.31, 0.2],
          [-0.35, 0.2, 0.24],
          [-0.29, 0.08, 0.2],
          [-0.36, 0.015, 0.28],
        ]}
        radius={0.037}
      />
      <Tentacle
        points={[
          [0.25, 0.31, 0.2],
          [0.35, 0.2, 0.24],
          [0.29, 0.08, 0.2],
          [0.36, 0.015, 0.28],
        ]}
        radius={0.037}
      />

      {[-0.4, 0.4].map((x) => (
        <group key={x}>
          <Tentacle
            points={[
              [x, 0.34, -0.17],
              [x * 1.06, 0.48, -0.08],
              [x * 1.03, 0.56, 0.14],
            ]}
            radius={0.025}
            color={CHITIN_LIFT}
          />
          <Horn
            position={[x, 0.93, -0.3]}
            rotation={[0, 0, x > 0 ? -0.42 : 0.42]}
            scale={[1.05, 1.3, 1.05]}
          />
        </group>
      ))}
    </group>
  )
}

function MonitorModel() {
  return (
    <group>
      <RoundedBox
        args={[0.92, 0.69, 0.16]}
        radius={0.035}
        smoothness={4}
        position={[0, 0.59, 0]}
        castShadow
      >
        <ChitinMaterial />
      </RoundedBox>
      <mesh position={[0, 0.59, 0.086]}>
        <planeGeometry args={[0.77, 0.54, 1, 1]} />
        <meshStandardMaterial
          color="#061414"
          emissive="#0f6c69"
          emissiveIntensity={1.05}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0.59, 0.091]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.17, 0.012, 8, 36]} />
        <GlowMaterial color={CYAN} intensity={2.5} />
      </mesh>
      <Eye position={[0, 0.59, 0.105]} scale={1.1} color={CYAN} />

      <Tentacle
        points={[
          [-0.38, 0.25, -0.02],
          [-0.27, 0.18, 0.02],
          [-0.12, 0.1, 0],
          [0, 0.08, 0],
        ]}
        radius={0.025}
        color={CHITIN_LIFT}
      />
      <Tentacle
        points={[
          [0.38, 0.25, -0.02],
          [0.27, 0.18, 0.02],
          [0.12, 0.1, 0],
          [0, 0.08, 0],
        ]}
        radius={0.025}
        color={CHITIN_LIFT}
      />
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.3, 0.08, 16]} />
        <ChitinMaterial color="#1f2022" />
      </mesh>

      {[-0.43, 0.43].map((x) => (
        <Horn
          key={x}
          position={[x, 0.9, -0.01]}
          rotation={[0, 0, x > 0 ? -0.5 : 0.5]}
          scale={[0.72, 0.9, 0.72]}
        />
      ))}
    </group>
  )
}

function ComputerModel() {
  return (
    <group>
      <RoundedBox
        args={[0.78, 0.89, 0.76]}
        radius={0.06}
        smoothness={4}
        position={[0, 0.49, 0]}
        castShadow
        receiveShadow
      >
        <ChitinMaterial color="#191a1d" />
      </RoundedBox>
      <RoundedBox
        args={[0.62, 0.72, 0.025]}
        radius={0.03}
        smoothness={3}
        position={[0, 0.5, 0.393]}
      >
        <FleshMaterial color="#291d20" />
      </RoundedBox>

      {[-0.23, -0.115, 0, 0.115, 0.23].map((x, index) => (
        <RoundedBox
          key={x}
          args={[0.05, 0.42 + index * 0.015, 0.035]}
          radius={0.02}
          smoothness={3}
          position={[x, 0.53, 0.41]}
        >
          <GlowMaterial
            color={index % 2 === 0 ? '#a92220' : '#5f1719'}
            intensity={index % 2 === 0 ? 2.25 : 1.1}
          />
        </RoundedBox>
      ))}

      {[0.22, 0.38, 0.54, 0.7].map((y) => (
        <mesh
          key={y}
          position={[0, y, 0.403]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1.15, 1, 1]}
        >
          <torusGeometry args={[0.32, 0.018, 6, 24, Math.PI]} />
          <BoneMaterial color={BONE_DARK} />
        </mesh>
      ))}

      <Eye position={[0, 0.84, 0.405]} scale={0.76} color="#b82521" />
      {[-0.32, 0.32].map((x) => (
        <Horn
          key={x}
          position={[x, 0.95, 0]}
          rotation={[0, 0, x > 0 ? -0.48 : 0.48]}
          scale={[0.9, 1.18, 0.9]}
        />
      ))}
    </group>
  )
}

function KeyboardModel() {
  const keys = Array.from({ length: 24 }, (_, index) => ({
    x: -0.34 + (index % 8) * 0.097,
    z: -0.12 + Math.floor(index / 8) * 0.105,
  }))

  return (
    <group>
      <RoundedBox
        args={[0.92, 0.16, 0.52]}
        radius={0.045}
        smoothness={4}
        position={[0, 0.11, 0]}
        castShadow
        receiveShadow
      >
        <ChitinMaterial color="#181a1c" />
      </RoundedBox>
      {keys.map(({ x, z }, index) => (
        <RoundedBox
          key={`${x}-${z}`}
          args={[0.075, 0.045, 0.072]}
          radius={0.012}
          smoothness={2}
          position={[x, 0.215, z]}
          castShadow
        >
          {index % 7 === 0 ? (
            <GlowMaterial color={CYAN} intensity={1.5} />
          ) : (
            <BoneMaterial color={index % 3 ? BONE_DARK : BONE} />
          )}
        </RoundedBox>
      ))}
      <RoundedBox
        args={[0.16, 0.11, 0.23]}
        radius={0.05}
        smoothness={4}
        position={[0.36, 0.22, 0.02]}
        castShadow
      >
        <FleshMaterial color="#3b2328" />
      </RoundedBox>
      <Tentacle
        points={[
          [0.22, 0.15, 0.14],
          [0.28, 0.19, 0.11],
          [0.34, 0.2, 0.07],
        ]}
        radius={0.018}
        color={BONE_DARK}
      />
    </group>
  )
}

function BookcaseModel() {
  return (
    <group>
      <RoundedBox
        args={[0.93, 0.08, 0.82]}
        radius={0.025}
        smoothness={3}
        position={[0, 0.055, 0]}
        castShadow
      >
        <ChitinMaterial />
      </RoundedBox>
      {[-0.43, 0.43].map((x) => (
        <group key={x}>
          <RoundedBox
            args={[0.11, 0.89, 0.68]}
            radius={0.035}
            smoothness={3}
            position={[x, 0.5, 0]}
            castShadow
            receiveShadow
          >
            <ChitinMaterial color="#1b1d1d" />
          </RoundedBox>
          <Tentacle
            points={[
              [x, 0.08, 0.28],
              [x * 1.04, 0.32, 0.34],
              [x * 0.96, 0.63, 0.3],
              [x, 0.93, 0.24],
            ]}
            radius={0.024}
            color={FLESH}
          />
        </group>
      ))}
      {[0.19, 0.43, 0.67, 0.91].map((y, shelfIndex) => (
        <group key={y}>
          <RoundedBox
            args={[0.82, 0.055, 0.63]}
            radius={0.016}
            smoothness={2}
            position={[0, y, 0]}
            castShadow
          >
            <BoneMaterial color={shelfIndex % 2 ? BONE_DARK : '#38362f'} />
          </RoundedBox>
          {shelfIndex < 3
            ? BOOKS.map((book, index) => (
                <RoundedBox
                  key={`${shelfIndex}-${book.x}`}
                  args={[0.09, book.h, 0.36]}
                  radius={0.008}
                  smoothness={2}
                  position={[
                    book.x,
                    y + book.h / 2 + 0.03,
                    0.19 + (index % 2) * 0.015,
                  ]}
                  rotation={[0, 0, (index - 2.5) * 0.016]}
                  castShadow
                >
                  <meshStandardMaterial
                    color={book.color}
                    roughness={0.82}
                    metalness={0.02}
                  />
                </RoundedBox>
              ))
            : null}
        </group>
      ))}
      <Eye position={[0, 0.925, 0.37]} scale={0.72} color="#9aad62" />
      <Horn position={[-0.3, 1.03, 0]} rotation={[0, 0, 0.52]} />
      <Horn position={[0.3, 1.03, 0]} rotation={[0, 0, -0.52]} />
    </group>
  )
}

function DisplayRackModel() {
  return (
    <group>
      <RoundedBox
        args={[0.98, 0.08, 0.72]}
        radius={0.025}
        smoothness={3}
        position={[0, 0.055, 0]}
        castShadow
        receiveShadow
      >
        <ChitinMaterial color="#171819" />
      </RoundedBox>

      <RoundedBox
        args={[0.84, 0.9, 0.08]}
        radius={0.018}
        smoothness={3}
        position={[0, 0.51, -0.31]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#211b1b" roughness={0.86} metalness={0.12} />
      </RoundedBox>

      {[-0.45, 0.45].map((x) => (
        <group key={x}>
          <RoundedBox
            args={[0.12, 0.94, 0.68]}
            radius={0.035}
            smoothness={3}
            position={[x, 0.51, 0]}
            castShadow
            receiveShadow
          >
            <ChitinMaterial color="#1b1c1d" />
          </RoundedBox>
          <Tentacle
            points={[
              [x, 0.08, 0.29],
              [x * 1.04, 0.32, 0.34],
              [x * 0.96, 0.64, 0.31],
              [x, 0.96, 0.25],
            ]}
            radius={0.022}
            color={FLESH}
          />
        </group>
      ))}

      {[0.19, 0.42, 0.65, 0.88].map((y) => (
        <RoundedBox
          key={y}
          args={[0.84, 0.055, 0.63]}
          radius={0.016}
          smoothness={2}
          position={[0, y, 0]}
          castShadow
          receiveShadow
        >
          <BoneMaterial color="#35322d" />
        </RoundedBox>
      ))}

      <RoundedBox
        args={[0.98, 0.12, 0.69]}
        radius={0.03}
        smoothness={3}
        position={[0, 1.01, 0]}
        castShadow
      >
        <ChitinMaterial color="#1d1d1e" />
      </RoundedBox>
      <Eye position={[0, 1.035, 0.36]} scale={0.58} color="#9c3029" />
      <Horn position={[-0.34, 1.12, 0]} rotation={[0, 0, 0.52]} scale={[0.85, 1.15, 0.85]} />
      <Horn position={[0.34, 1.12, 0]} rotation={[0, 0, -0.52]} scale={[0.85, 1.15, 0.85]} />
    </group>
  )
}

function CabinetModel() {
  return (
    <group>
      <RoundedBox
        args={[0.92, 0.75, 0.72]}
        radius={0.055}
        smoothness={4}
        position={[0, 0.43, 0]}
        castShadow
        receiveShadow
      >
        <ChitinMaterial color="#202122" />
      </RoundedBox>

      {[0.27, 0.49, 0.7].map((y, index) => (
        <group key={y}>
          <RoundedBox
            args={[0.76, 0.16, 0.045]}
            radius={0.022}
            smoothness={3}
            position={[0, y, 0.377]}
            castShadow
          >
            <FleshMaterial color={index === 1 ? '#48262a' : '#302124'} />
          </RoundedBox>
          <mesh position={[0, y, 0.415]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.075, 0.018, 8, 20, Math.PI]} />
            <BoneMaterial />
          </mesh>
        </group>
      ))}

      {[-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x, index) => (
        <Horn
          key={x}
          position={[x, 0.12, 0.39]}
          rotation={[Math.PI / 2, 0, index % 2 ? 0.12 : -0.12]}
          scale={[0.55, 0.58, 0.55]}
        />
      ))}
      <Eye position={[0, 0.91, 0.08]} scale={0.58} color="#b1302b" />
    </group>
  )
}

function LampModel() {
  const { globalIntensity } = useStudioLightingSettings()

  return (
    <group>
      <mesh position={[0, 0.045, 0]} castShadow>
        <cylinderGeometry args={[0.31, 0.39, 0.09, 18]} />
        <ChitinMaterial />
      </mesh>
      <Tentacle
        points={[
          [0, 0.08, 0],
          [-0.12, 0.28, 0.05],
          [0.12, 0.48, -0.04],
          [-0.08, 0.68, 0.02],
          [0.06, 0.84, 0],
        ]}
        radius={0.075}
        color="#3e282d"
      />
      <Tentacle
        points={[
          [0.02, 0.67, 0],
          [-0.18, 0.77, 0.03],
          [-0.25, 0.88, 0.12],
        ]}
        radius={0.035}
      />
      <Tentacle
        points={[
          [0.03, 0.7, 0],
          [0.2, 0.79, -0.04],
          [0.28, 0.9, 0.08],
        ]}
        radius={0.035}
      />
      <mesh position={[0.06, 0.89, 0]} castShadow>
        <icosahedronGeometry args={[0.17, 3]} />
        <GlowMaterial color="#79c7af" intensity={3.8} />
      </mesh>
      <mesh position={[0.06, 0.89, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.25, 0.026, 8, 32]} />
        <BoneMaterial color={BONE_DARK} />
      </mesh>
      {[-0.23, 0.23].map((x) => (
        <Horn
          key={x}
          position={[x + 0.06, 0.94, 0]}
          rotation={[0, 0, x > 0 ? -1.05 : 1.05]}
          scale={[0.8, 1.1, 0.8]}
        />
      ))}
      <pointLight
        position={[0.06, 0.88, 0.08]}
        color="#64b6a1"
        intensity={2.2 * globalIntensity}
        distance={2.4}
        decay={2}
      />
    </group>
  )
}

function CandelabraModel() {
  const arms: readonly Vector3Tuple[][] = [
    [[0, 0.52, 0], [-0.18, 0.66, 0], [-0.34, 0.76, 0]],
    [[0, 0.58, 0], [-0.1, 0.76, 0], [-0.18, 0.88, 0]],
    [[0, 0.6, 0], [0, 0.82, 0], [0, 0.96, 0]],
    [[0, 0.58, 0], [0.1, 0.76, 0], [0.18, 0.88, 0]],
    [[0, 0.52, 0], [0.18, 0.66, 0], [0.34, 0.76, 0]],
  ]

  return (
    <group>
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.07, 16]} />
        <ChitinMaterial />
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.075, 0.62, 12]} />
        <BoneMaterial color={BONE_DARK} />
      </mesh>
      {arms.map((points, index) => (
        <group key={index}>
          <Tentacle points={[...points]} radius={0.022} color={BONE_DARK} />
          <mesh position={points.at(-1)} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.15, 10]} />
            <BoneMaterial />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function WallMaskModel() {
  return (
    <group>
      <mesh position={[0, 0.59, 0]} scale={[0.39, 0.39, 0.48]} castShadow>
        <sphereGeometry args={[1, 28, 20]} />
        <ChitinMaterial color="#1c1919" />
      </mesh>
      <mesh position={[0, 0.59, 0.23]} scale={[0.33, 0.28, 0.08]}>
        <sphereGeometry args={[1, 24, 16]} />
        <FleshMaterial color="#27191c" />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} position={[x, 0.6, 0.32]} scale={[0.13, 0.052, 0.035]}>
          <sphereGeometry args={[1, 20, 12]} />
          <meshStandardMaterial color="#080203" roughness={0.86} />
        </mesh>
      ))}
      {[-0.23, 0.23].map((x) => (
        <Horn
          key={x}
          position={[x, 0.91, 0]}
          rotation={[0, 0, x > 0 ? -0.58 : 0.58]}
          scale={[0.86, 1.18, 0.86]}
        />
      ))}
      {[-0.25, -0.13, 0, 0.13, 0.25].map((x, index) => (
        <Tentacle
          key={x}
          points={[
            [x * 0.7, 0.46, 0.2],
            [x, 0.31, 0.23],
            [x * 0.72 + (index % 2 ? 0.035 : -0.035), 0.11, 0.2],
          ]}
          radius={0.035 - Math.abs(index - 2) * 0.003}
          color="#302025"
        />
      ))}
    </group>
  )
}

function RugModel() {
  return (
    <group>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[0.49, 0.49, 0.16, 64]} />
        <meshStandardMaterial color="#25171a" roughness={0.94} />
      </mesh>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2
        return (
          <mesh
            key={angle}
            position={[Math.cos(angle) * 0.36, 0.205, Math.sin(angle) * 0.36]}
            rotation={[0, -angle, 0]}
            scale={[0.7, 1, 0.7]}
          >
            <coneGeometry args={[0.035, 0.13, 3]} />
            <GlowMaterial color="#8e3a31" intensity={1.3} />
          </mesh>
        )
      })}
    </group>
  )
}

function OctopusModel() {
  const tentacles: Vector3Tuple[][] = [
    [[-0.12, 0.53, 0], [-0.42, 0.62, 0.01], [-0.7, 0.52, 0.02], [-0.92, 0.64, 0]],
    [[-0.14, 0.48, 0], [-0.43, 0.4, 0.02], [-0.7, 0.27, 0.01], [-0.88, 0.38, 0]],
    [[-0.09, 0.42, 0], [-0.28, 0.23, 0.02], [-0.5, 0.11, 0], [-0.66, 0.24, 0]],
    [[-0.04, 0.4, 0], [-0.12, 0.18, 0.03], [-0.27, 0.08, 0], [-0.35, 0.2, 0]],
    [[0.12, 0.53, 0], [0.42, 0.62, 0.01], [0.7, 0.52, 0.02], [0.92, 0.64, 0]],
    [[0.14, 0.48, 0], [0.43, 0.4, 0.02], [0.7, 0.27, 0.01], [0.88, 0.38, 0]],
    [[0.09, 0.42, 0], [0.28, 0.23, 0.02], [0.5, 0.11, 0], [0.66, 0.24, 0]],
    [[0.04, 0.4, 0], [0.12, 0.18, 0.03], [0.27, 0.08, 0], [0.35, 0.2, 0]],
  ]

  return (
    <group>
      {tentacles.map((points, index) => (
        <Tentacle
          key={`octopus-tentacle-${index}`}
          points={points}
          radius={0.052 - (index % 4) * 0.004}
          color={index % 2 ? '#212527' : '#2b2928'}
        />
      ))}
      <mesh castShadow position={[0, 0.52, 0]} scale={[0.31, 0.3, 0.14]}>
        <sphereGeometry args={[1, 32, 20]} />
        <ChitinMaterial color="#202326" />
      </mesh>
      <mesh position={[0, 0.52, 0.125]} scale={[0.2, 0.13, 0.05]}>
        <sphereGeometry args={[1, 32, 20]} />
        <GlowMaterial color="#50d8cd" intensity={3.6} />
      </mesh>
      <mesh position={[0, 0.52, 0.174]} scale={[0.025, 0.09, 0.02]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshBasicMaterial color="#020405" />
      </mesh>
    </group>
  )
}

function PlaqueModel() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#221714" metalness={0.3} roughness={0.72} />
      </mesh>
      <mesh position={[0.52, 0.5, 0]} scale={[0.04, 0.72, 0.86]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#83633a" metalness={0.58} roughness={0.5} />
      </mesh>
    </group>
  )
}

function TelevisionModel() {
  return (
    <group>
      <RoundedBox
        args={[0.62, 0.78, 0.92]}
        radius={0.07}
        smoothness={4}
        position={[0, 0.44, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#241c18" metalness={0.18} roughness={0.72} />
      </RoundedBox>
      <mesh position={[0.322, 0.47, 0]} scale={[0.035, 0.52, 0.67]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#102329"
          emissive="#18383d"
          emissiveIntensity={0.18}
          roughness={0.28}
        />
      </mesh>
      {[-0.22, 0.22].map((z) => (
        <mesh key={z} position={[-0.04, 0.93, z]} rotation={[0, 0, z < 0 ? 0.28 : -0.28]}>
          <cylinderGeometry args={[0.012, 0.012, 0.38, 8]} />
          <meshStandardMaterial color="#403832" metalness={0.62} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function GrimoireModel() {
  return (
    <group>
      <RoundedBox
        args={[0.96, 0.22, 0.96]}
        radius={0.06}
        smoothness={3}
        position={[0, 0.12, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#281417" roughness={0.62} metalness={0.2} />
      </RoundedBox>
      <RoundedBox
        args={[0.88, 0.28, 0.88]}
        radius={0.035}
        smoothness={2}
        position={[0.02, 0.25, 0]}
      >
        <meshStandardMaterial color="#9d8969" roughness={0.92} metalness={0} />
      </RoundedBox>
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.035, 7, 24]} />
        <GlowMaterial color="#6faaa0" intensity={1.5} />
      </mesh>
    </group>
  )
}

const MODELS: Record<AssetKind, () => ReactElement> = {
  desk: DeskModel,
  chair: ChairModel,
  monitor: MonitorModel,
  computer: ComputerModel,
  keyboard: KeyboardModel,
  bookcase: BookcaseModel,
  candelabra: CandelabraModel,
  displayRack: DisplayRackModel,
  wallMask: WallMaskModel,
  cabinet: CabinetModel,
  lamp: LampModel,
  octopus: OctopusModel,
  plaque: PlaqueModel,
  television: TelevisionModel,
  grimoire: GrimoireModel,
  rug: RugModel,
}

export function PlaceholderAsset({ asset, loading = false }: PlaceholderAssetProps) {
  const Model = MODELS[asset.kind]

  return (
    <group
      scale={asset.placeholderSize}
      userData={{ assetId: asset.id, placeholder: true }}
    >
      <group scale={loading ? 0.985 : 1}>
        <Model />
      </group>
    </group>
  )
}
