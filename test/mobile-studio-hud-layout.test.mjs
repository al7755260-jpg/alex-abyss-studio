import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

test('mobile studio HUD docks compact status below the 3D scene instead of covering discoveries', async () => {
  const styles = await readFile(projectFile('src/styles.css'), 'utf8')

  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.objective-rail \{[\s\S]{0,260}top: auto;[\s\S]{0,160}bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\);[\s\S]{0,120}left: 80px;[\s\S]{0,180}display: grid;/)
  assert.match(styles, /\.objective-rail p \{\s*display: none;/)
  assert.match(styles, /\.objective-rail h2 \{[\s\S]{0,360}text-overflow: ellipsis;[\s\S]{0,80}white-space: nowrap;/)
  assert.match(styles, /\.sanity-meter \{[\s\S]{0,180}bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\);[\s\S]{0,120}width: 58px;[\s\S]{0,80}height: 58px;/)
})

test('mobile decorative HUD stops stealing canvas gestures while unlocked controls remain usable', async () => {
  const styles = await readFile(projectFile('src/styles.css'), 'utf8')

  assert.match(styles, /\.game-ui:not\(\.game-ui--editing\) \.brand \{\s*pointer-events: none;/)
  assert.match(styles, /\.relic-archive \{[\s\S]{0,300}justify-content: flex-start;[\s\S]{0,80}pointer-events: none;/)
  assert.match(styles, /\.relic-slot:disabled \{ pointer-events: none; \}/)
  assert.match(styles, /\.relic-slot:not\(:disabled\) \{ pointer-events: auto; \}/)
  assert.match(styles, /\.relic-slot \{ height: 50px; min-height: 50px;/)
  assert.match(styles, /\.game-ui \.reset-button,[\s\S]{0,160}min-width: 44px;[\s\S]{0,80}height: 44px;/)
})

test('mobile loading and relic detail chrome stay clear of the primary 3D interaction area', async () => {
  const styles = await readFile(projectFile('src/styles.css'), 'utf8')

  assert.match(styles, /\.loading \{[\s\S]{0,180}top: 80px;[\s\S]{0,160}right: 14px;[\s\S]{0,120}bottom: auto;[\s\S]{0,120}width: min\(210px, calc\(100vw - 28px\)\);/)
  assert.match(styles, /\.game-ui--relic \.game-topbar \{ display: none; \}/)
  assert.match(styles, /\.artifact-detail__actions > button \{[\s\S]{0,80}min-height: 44px;/)
  assert.match(styles, /\.relic-transition--zoom,[\s\S]{0,80}\.relic-transition--reveal \{[\s\S]{0,100}pointer-events: auto;/)
  assert.match(styles, /@media \(min-width: 721px\) and \(max-width: 900px\) and \(max-height: 500px\) \{[\s\S]{0,500}\.artifact-detail \{[\s\S]{0,160}width: min\(320px, calc\(100vw - 20px\)\);/)
})
