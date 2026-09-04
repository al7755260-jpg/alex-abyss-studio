import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url)

test('移动端遗物档案默认折叠正文并提供无障碍展开控制', async () => {
  const hud = await readFile(projectFile('src/ui/game/ArtifactDetailHUD.tsx'), 'utf8')

  assert.match(hud, /const \[expanded, setExpanded\] = useState\(false\)/)
  assert.match(hud, /data-expanded=\{expanded\}/)
  assert.match(hud, /className="artifact-detail__archive-body" id=\{archiveBodyId\}/)
  assert.match(hud, /aria-controls=\{archiveBodyId\}/)
  assert.match(hud, /aria-expanded=\{expanded\}/)
  assert.match(hud, /setExpanded\(\(current\) => !current\)/)
  assert.match(hud, /expanded \? '收起档案' : '阅读完整档案'/)
  assert.match(hud, /className="artifact-detail__return"[\s\S]{0,80}onClick=\{onReturn\}/)
})

test('移动端折叠卡透传触摸，展开正文独立滚动且桌面保持全文', async () => {
  const styles = await readFile(projectFile('src/styles.css'), 'utf8')

  assert.match(styles, /\.artifact-detail__toggle \{\s*display: none;/)
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.artifact-detail \{[\s\S]{0,360}max-height: none;[\s\S]{0,180}pointer-events: none;/)
  assert.match(styles, /\.artifact-detail\[data-expanded="true"\] \{\s*pointer-events: auto;/)
  assert.match(styles, /\.artifact-detail__archive-body \{\s*display: none;/)
  assert.match(styles, /\.artifact-detail\[data-expanded="true"\] \.artifact-detail__archive-body \{[\s\S]{0,260}max-height: min\(24dvh, 220px\);[\s\S]{0,180}overflow-y: auto;[\s\S]{0,220}overscroll-behavior: contain;[\s\S]{0,120}touch-action: pan-y;/)
  assert.match(styles, /\.artifact-detail__actions \{[\s\S]{0,180}pointer-events: auto;/)
  assert.match(styles, /\.artifact-detail__toggle \{\s*display: inline-flex;/)
  assert.doesNotMatch(styles, /max-height: 42dvh/)
})
