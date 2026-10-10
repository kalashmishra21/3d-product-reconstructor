import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

test('the isolated landing lens uses the verified liquid-gl release', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.dependencies['liquid-gl'], '3.0.0')
})

async function loadStageModule(path, description) {
  try {
    return await import(new URL(path, import.meta.url))
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') assert.fail(`${description} is not implemented`)
    throw error
  }
}

test('Landing liquid glass is theme-aware, auto-fallback capable, and safely disposable', async () => {
  const glass = await loadStageModule('../src/landing/landingGlass.js', 'Landing liquid-glass lifecycle')
  assert.equal(glass.LANDING_GPU_GLASS_ENABLED, false, 'GPU refraction stays disabled on the public landing until its measured startup cost is acceptable')
  assert.equal(glass.shouldEnableLandingGlass({ isLanding: true, reducedMotion: false }), false)
  assert.equal(glass.shouldEnableLandingGlass({ isLanding: true, reducedMotion: true }), false)
  assert.equal(glass.shouldEnableLandingGlass({ isLanding: true, reducedMotion: false, smallScreen: true }), false)
  assert.equal(glass.shouldEnableLandingGlass({ isLanding: false, reducedMotion: false }), false)

  const forest = glass.buildLandingGlassOptions('forest')
  const ivory = glass.buildLandingGlassOptions('ivory')
  assert.equal(forest.engine, 'auto') // liquidGL: WebGPU -> WebGL -> CSS fallback
  assert.equal(forest.target, '[data-landing-liquid-surface]')
  assert.equal(forest.snapshot, 'body')
  assert.equal(forest.content, false)
  assert.ok(forest.resolution <= 1, 'the full-page capture stays at a conservative resolution')
  assert.ok(forest.refraction >= 0.06, 'refraction must remain visibly legible')
  assert.notEqual(forest.tint, ivory.tint)
  assert.equal(typeof forest.on.init, 'function')

  let destroyed = 0
  glass.destroyLandingGlass([{ destroy() { destroyed += 1 } }, { destroy() { destroyed += 1 } }])
  glass.destroyLandingGlass({ destroy() { destroyed += 1 } })
  glass.destroyLandingGlass(null)
  assert.equal(destroyed, 3)
})

test('public metadata is truthful, valid SoftwareApplication JSON-LD, and omits unknown canonical URLs', async () => {
  const seo = await loadStageModule('../src/seo/siteMetadata.js', 'Public SEO metadata')
  assert.deepEqual(seo.SOFTWARE_APPLICATION_JSON_LD['@context'], 'https://schema.org')
  assert.equal(seo.SOFTWARE_APPLICATION_JSON_LD['@type'], 'SoftwareApplication')
  assert.equal(seo.SOFTWARE_APPLICATION_JSON_LD.name, 'Reconstruct')
  assert.equal(seo.SOFTWARE_APPLICATION_JSON_LD.applicationCategory, 'DesignApplication')
  assert.match(seo.SOFTWARE_APPLICATION_JSON_LD.description, /single.image|single RGB image/i)
  assert.equal('aggregateRating' in seo.SOFTWARE_APPLICATION_JSON_LD, false)
  assert.equal(seo.routeRobotsContent('/'), 'index, follow')
  for (const path of ['/login', '/dashboard', '/reconstruct', '/history', '/model', '/profile', '/reconstructions/abc']) {
    assert.equal(seo.routeRobotsContent(path), 'noindex, nofollow', `${path} remains private/non-indexable`)
  }

  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /property="og:title"/)
  assert.match(html, /property="og:description"/)
  assert.match(html, /name="twitter:card"/)
  assert.match(html, /location\.pathname\s*===?\s*['"]\/['"]/,
    'the synchronous head bootstrap must mark private SPA routes noindex before React mounts')
  assert.doesNotMatch(html, /rel="canonical"|property="og:url"/)
})

test('robots policy keeps the public landing crawlable and defers host-dependent sitemap declaration', async () => {
  const path = new URL('../public/robots.txt', import.meta.url)
  assert.equal(existsSync(path), true, 'public robots.txt should be shipped')
  const robots = await readFile(path, 'utf8')
  assert.match(robots, /User-agent:\s*\*/i)
  assert.match(robots, /Allow:\s*\//i)
  assert.match(robots, /sitemap.+domain|domain.+sitemap/is)
  assert.doesNotMatch(robots, /^Disallow:/m, 'crawlers must be able to observe route-specific noindex metadata')
})

test('the landing keeps semantic study sections and labels the vessel as illustrative', async () => {
  const landing = await readFile(new URL('../src/pages/Landing.jsx', import.meta.url), 'utf8')
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const scene = await readFile(new URL('../src/stage12a/StudyScene.jsx', import.meta.url), 'utf8')
  assert.match(landing, /A new dimension/)
  assert.match(landing, /A space to/)
  assert.match(landing, /Built for curiosity/)
  assert.match(landing, /application\/ld\+json/)
  assert.match(app, /LandingLiquidGlass/)
  assert.match(landing, /Illustrative geometry, not a model prediction/)
  assert.match(scene, /OrbitControls/)
  assert.match(scene, /meshPhysicalMaterial/)
  assert.match(scene, /topology/)
})
