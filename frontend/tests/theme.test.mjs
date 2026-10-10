import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, readTheme, storeTheme, sceneThemes, THEME_KEY } from '../src/theme/theme.js'

test('app theme validates preference, honors system fallback and tolerates blocked storage', () => {
  assert.equal(resolveTheme('ivory', true), 'ivory')
  assert.equal(resolveTheme('forest', false), 'forest')
  assert.equal(resolveTheme('unexpected', true), 'forest')
  assert.equal(resolveTheme(null, false), 'ivory')
  assert.equal(readTheme({ getItem() { throw Error('blocked') } }, true), 'forest')
  assert.doesNotThrow(() => storeTheme({ setItem() { throw Error('blocked') } }, 'ivory'))
  const writes = []
  storeTheme({ setItem: (...args) => writes.push(args) }, 'ivory')
  storeTheme({ setItem: (...args) => writes.push(args) }, 'invalid')
  assert.deepEqual(writes, [[THEME_KEY, 'ivory']])
})

test('scene themes change presentation only and have distinct legible material palettes', () => {
  assert.notEqual(sceneThemes.forest.solid, sceneThemes.ivory.solid)
  assert.notEqual(sceneThemes.forest.wire, sceneThemes.ivory.wire)
  for (const theme of Object.values(sceneThemes)) {
    assert.deepEqual(Object.keys(theme).sort(), ['ambient', 'fill', 'grid', 'gridCenter', 'key', 'points', 'solid', 'wire'])
    assert.ok(theme.ambient > 0)
    for (const [name, value] of Object.entries(theme)) if (name !== 'ambient') assert.match(value, /^#[\da-f]{6}$/i)
  }
})

// The pre-paint script is tested independently of React so a refresh cannot flash the other studio.
test('pre-paint theme bootstrap handles saved choice, system fallback, and blocked storage', async () => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  for (const [saved, system, blocked, expected] of [['forest', false, false, 'forest'], ['ivory', true, false, 'ivory'], [null, false, false, 'ivory'], ['bad', true, false, 'forest'], [null, false, true, 'ivory']]) {
    const root = { dataset: {}, style: {} }, meta = {}
    runInNewContext(script, { document: { documentElement: root, querySelector: () => meta }, localStorage: { getItem() { if (blocked) throw Error('blocked'); return saved } }, matchMedia: () => ({ matches: system }) })
    assert.equal(root.dataset.theme, expected)
    assert.equal(root.style.colorScheme, expected === 'ivory' ? 'light' : 'dark')
    assert.equal(meta.content, expected === 'ivory' ? '#eeeade' : '#142019')
  }
})

test('both approved palettes keep body, secondary, warning, and action text at AA contrast', async () => {
  const { readFile } = await import('node:fs/promises')
  const css = await readFile(new URL('../src/theme/tokens.css', import.meta.url), 'utf8')
  const luminance = hex => {
    const rgb = hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
  }
  for (const theme of ['forest','ivory']) {
    const block=css.match(new RegExp(':root\\[data-theme='+theme+'\\] \\{([^}]+)'))[1]
    const value=name=>block.match(new RegExp('--color-'+name+': (#[\\da-f]{6});'))[1]
    for(const [fg,bg] of [['text-primary','background'],['text-secondary','surface'],['text-secondary','background'],['warning','surface'],['on-accent','accent']]) {
      const a=luminance(value(fg)),b=luminance(value(bg))
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${theme} ${fg}/${bg}`)
    }
  }
})
