import assert from 'node:assert/strict'
import test from 'node:test'
import { Vector3 } from 'three'
import {
  CLIENT_LOGOS, ClientHologramPlayback, HOLOGRAM_CHARGE_SECONDS,
  HOLOGRAM_STAGGER_SECONDS, HOLOGRAM_REVEAL_SECONDS, HOLOGRAM_TOTAL_SECONDS,
} from '../src/data/clientLogos.ts'

test('six clients emerge in order and stay projected until the globe is toggled', () => {
  const playback = new ClientHologramPlayback()
  assert.ok(CLIENT_LOGOS.every((_, i) => playback.reveal(i) === 0))
  playback.advance(HOLOGRAM_CHARGE_SECONDS + HOLOGRAM_STAGGER_SECONDS / 2, true)
  assert.ok(playback.reveal(0) > 0)
  assert.ok(CLIENT_LOGOS.slice(1).every((_, i) => playback.reveal(i + 1) === 0))
  playback.advance(HOLOGRAM_TOTAL_SECONDS, true)
  assert.ok(CLIENT_LOGOS.every((_, i) => playback.reveal(i) === 1))
  playback.advance(60, true)
  assert.ok(CLIENT_LOGOS.every((_, i) => playback.reveal(i) === 1))
  playback.advance(HOLOGRAM_TOTAL_SECONDS, false)
  assert.equal(playback.elapsed, 0)
  assert.ok(CLIENT_LOGOS.every((_, i) => playback.reveal(i) === 0))
})

test('closing and reopening during the reveal reverse smoothly without stale timers', () => {
  const playback = new ClientHologramPlayback()
  playback.advance(HOLOGRAM_CHARGE_SECONDS + HOLOGRAM_REVEAL_SECONDS / 2, true)
  const first = playback.reveal(0)
  playback.advance(0, false)
  assert.equal(playback.reveal(0), first)
  playback.advance(0.04, false)
  assert.ok(playback.reveal(0) < first)
  const halfway = playback.elapsed
  playback.advance(0, true)
  assert.equal(playback.elapsed, halfway)
  playback.advance(0.04, true)
  assert.ok(playback.elapsed > halfway)
})

test('frame rate independent sequence and reduced motion open/close', () => {
  const one = new ClientHologramPlayback(), many = new ClientHologramPlayback()
  one.advance(1.2, true)
  for (let i = 0; i < 72; i++) many.advance(1 / 60, true)
  assert.ok(Math.abs(one.elapsed - many.elapsed) < 1e-10)
  for (const delta of [-1, NaN, Infinity]) assert.throws(() => one.advance(delta, true), RangeError)
  one.advance(0, true, true)
  assert.ok(CLIENT_LOGOS.every((_, i) => one.reveal(i) === 1))
  one.advance(0, false, true)
  assert.equal(one.elapsed, 0)
})

test('the reference directions contain actual noncoplanar positions with significant depth', () => {
  const positions = CLIENT_LOGOS.map(({position}) => new Vector3(...position))
  const depths = positions.map(p => p.z)
  assert.ok(Math.max(...depths) - Math.min(...depths) > 1)
  const normal = positions[1].clone().sub(positions[0])
    .cross(positions[2].clone().sub(positions[0])).normalize()
  const outOfPlane = positions.slice(3).map(p => Math.abs(normal.dot(p.clone().sub(positions[0]))))
  assert.ok(Math.max(...outOfPlane) > 0.4, '3D layout must not collapse to a tilted flat plane')
  for (let i=0; i<positions.length; i++) for (let j=i+1; j<positions.length; j++) {
    assert.ok(positions[i].distanceTo(positions[j]) > 0.9, 'logos need enough physical separation')
  }
})
