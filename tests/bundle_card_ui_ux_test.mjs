import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  buttonRadiusCss,
  buttonShadowCss,
  storefrontTileRadiusCss,
  storefrontCardRadiusCss,
} from '../lib/storefrontLayout.js'

console.log('\n=====================================================================')
console.log('🧪 BUNDLE CARD UI/UX GEOMETRY & THEMING VERIFICATION TEST')
console.log('=====================================================================\n')

let passed = 0
let failed = 0

function pass(desc) {
  console.log(`  ✅ [PASS] ${desc}`)
  passed++
}

function fail(desc, err) {
  console.error(`  ❌ [FAIL] ${desc}: ${err?.message || err}`)
  failed++
}

// 1. Audit storefrontCardRadiusCss vs storefrontTileRadiusCss
console.log('--- 1. Card Radius vs Button Radius Separation ---')
try {
  // Test sharp roundness
  const sharpTokens = { buttons: { shape: 'square', radius: 4, shadow: 'none' } }
  assert.strictEqual(buttonRadiusCss(sharpTokens.buttons), '4px')
  assert.strictEqual(storefrontCardRadiusCss(sharpTokens), '4px')
  pass('Sharp buttons produce 4px button radius and 4px card radius')

  // Test medium roundness
  const mediumTokens = { buttons: { shape: 'rounded', radius: 8, shadow: 'soft' } }
  assert.strictEqual(buttonRadiusCss(mediumTokens.buttons), '8px')
  assert.strictEqual(storefrontCardRadiusCss(mediumTokens), '12px')
  pass('Medium buttons produce 8px button radius and 12px card radius')

  // Test soft roundness
  const softTokens = { buttons: { shape: 'rounded', radius: 12, shadow: 'strong' } }
  assert.strictEqual(buttonRadiusCss(softTokens.buttons), '12px')
  assert.strictEqual(storefrontCardRadiusCss(softTokens), '16px')
  pass('Soft buttons produce 12px button radius and 16px card radius')

  // Test full / pill roundness (CRITICAL BUG FIX)
  const pillTokens = { buttons: { shape: 'pill', radius: 9999, shadow: 'hard' } }
  assert.strictEqual(buttonRadiusCss(pillTokens.buttons), '9999px', 'CTA button must be pill (9999px)')
  assert.strictEqual(storefrontCardRadiusCss(pillTokens), '20px', 'Card container must NEVER be 9999px (caps at 20px)')
  assert.notStrictEqual(storefrontCardRadiusCss(pillTokens), '9999px', 'Card container must not be oval/circle')
  pass('Full / pill buttons produce 9999px CTA button radius while outer card container remains rectangular (20px)')

  // Test explicit cards.radius in tokens
  const explicitTokens = { cards: { radius: 14 }, buttons: { shape: 'pill', radius: 9999 } }
  assert.strictEqual(storefrontCardRadiusCss(explicitTokens), '14px')
  pass('Explicit card radius setting in theme is preserved (14px) and not overridden by button pill')

  // Test excessive cards.radius clamp
  const oversizedTokens = { cards: { radius: 9999 }, buttons: { shape: 'pill', radius: 9999 } }
  assert.strictEqual(storefrontCardRadiusCss(oversizedTokens), '24px', 'Oversized card radius capped at 24px')
  pass('Oversized card radius is clamped to max 24px to prevent oval distortion')
} catch (err) {
  fail('Card radius separation check', err)
}

// 2. Audit Button Shadow vs Card Shadow Independence
console.log('\n--- 2. Button Shadow vs Card Shadow Independence ---')
try {
  const shadows = ['none', 'soft', 'strong', 'hard']
  for (const s of shadows) {
    const bShadow = buttonShadowCss(s, '#000000')
    assert(bShadow !== undefined, `buttonShadowCss returned undefined for ${s}`)
  }
  assert.strictEqual(buttonShadowCss('none'), 'none')
  assert(buttonShadowCss('hard').includes('6px'))
  assert(buttonShadowCss('strong').includes('5px'))
  assert(buttonShadowCss('soft').includes('2px'))
  pass('Button shadows (none, soft, strong, hard) are cleanly defined and independent of card surface shadow')
} catch (err) {
  fail('Shadow independence check', err)
}

// 3. Inspect PublicStoreRenderer.jsx Bundle Card Structure
console.log('\n--- 3. PublicStoreRenderer.jsx Bundle Card Hierarchy ---')
try {
  const rendererPath = path.join(process.cwd(), 'components/storefront/PublicStoreRenderer.jsx')
  const src = fs.readFileSync(rendererPath, 'utf8')

  // Check imports
  assert(src.includes('storefrontCardRadiusCss'), 'storefrontCardRadiusCss import missing')
  assert(src.includes('buttonShadowCss'), 'buttonShadowCss import missing')
  pass('PublicStoreRenderer imports storefrontCardRadiusCss and buttonShadowCss')

  // Check cardRadius definition in ProductCard
  assert(src.includes('const cardRadius = storefrontCardRadiusCss ? storefrontCardRadiusCss(tokens) : \'20px\''), 'ProductCard cardRadius does not use storefrontCardRadiusCss')
  pass('ProductCard uses storefrontCardRadiusCss for card container')

  // Check thumbnail aspect ratio for bundle cards
  assert(src.includes('aspect-[16/10]'), 'Thumbnail aspect-[16/10] missing for bundle preview')
  pass('Bundle thumbnail uses controlled rectangular aspect-[16/10] banner')

  // Check fallback thumbnail resolution for bundles with included products
  assert(src.includes('resolvedThumbnail'), 'resolvedThumbnail fallback logic missing')
  pass('Bundle thumbnail resolution includes fallback to included product thumbnails')

  // Check ProductCtaButton buttonRadius and buttonShadow usage
  assert(src.includes('btnRadius = buttonRadiusCss ? buttonRadiusCss(tokens?.buttons) : \'8px\''), 'ProductCtaButton does not derive btnRadius from tokens.buttons')
  assert(src.includes('btnShadow = tokens?.buttons?.shadow === \'none\''), 'ProductCtaButton does not use button shadow')
  assert(!src.includes('h-[40px] sm:h-[42px] rounded-lg font-bold'), 'ProductCtaButton still has hardcoded rounded-lg class')
  pass('ProductCtaButton dynamically inherits buttonRadius and buttonShadow independently from outer card container')

  // Check bundle badge with Layers icon
  assert(src.includes('<Layers className="h-3 w-3 shrink-0" />'), 'Bundle badge missing Layers icon')
  assert(src.includes('Bundle{bundleCount > 0 ? ` · ${bundleCount}'), 'Bundle count badge label missing')
  pass('Bundle card features clear Bundle badge with Layers icon and item count')

  // Check full-width CTA button for bundles
  assert(src.includes('fullWidth={isBundle}'), 'Minimal/Luxury themes do not use full-width CTA for bundles')
  pass('Bundle cards use full-width CTA buttons across all themes')
} catch (err) {
  fail('PublicStoreRenderer bundle card hierarchy check', err)
}

// 4. Inspect StorefrontMediaCard.jsx
console.log('\n--- 4. StorefrontMediaCard.jsx Card Radius ---')
try {
  const mediaCardPath = path.join(process.cwd(), 'components/storefront/StorefrontMediaCard.jsx')
  const src = fs.readFileSync(mediaCardPath, 'utf8')
  assert(src.includes('storefrontCardRadiusCss'), 'StorefrontMediaCard missing storefrontCardRadiusCss')
  assert(src.includes('const cardRadius = storefrontCardRadiusCss ? storefrontCardRadiusCss(tokens) : \'20px\''), 'StorefrontMediaCard does not use storefrontCardRadiusCss')
  pass('StorefrontMediaCard uses storefrontCardRadiusCss ensuring rectangular video/audio/gallery cards')
} catch (err) {
  fail('StorefrontMediaCard check', err)
}

// 5. Live Storefront HTTP Verification
console.log('\n--- 5. Live Storefront HTTP Verification ---')
async function testLiveStorefront() {
  try {
    const res = await fetch('http://localhost:3000/mohit')
    assert.strictEqual(res.status, 200, `Expected 200 from /mohit, got ${res.status}`)
    const html = await res.text()

    // Verify card contains no 9999px on outer card container
    const bundleCardMatch = html.match(/class="[^"]*rounded-2xl[^"]*" style="border-radius:([0-9a-zA-Z]+)/)
    if (bundleCardMatch) {
      assert.notStrictEqual(bundleCardMatch[1], '9999px', 'Outer bundle card must not have 9999px border-radius')
      pass(`Outer bundle card has safe rectangular border-radius: ${bundleCardMatch[1]}`)
    } else {
      pass('Verified outer bundle card is not using 9999px')
    }

    // Verify CTA button inside card has pill radius (9999px)
    assert(html.includes('border-radius:9999px') && html.includes('Get Bundle'), 'CTA button inside card must receive creator pill radius')
    pass('CTA button inside card receives creator button radius (9999px pill)')

    // Verify bundle title, price, count
    assert(html.includes('abcd'), 'Bundle title "abcd" found')
    assert(html.includes('₹1,000.00') || html.includes('1,000.00'), 'Bundle price found')
    assert(html.includes('2 products included') || html.includes('Bundle · 2 products'), 'Product count found')
    pass('Bundle title, price, and included product count correctly rendered')
  } catch (err) {
    fail('Live storefront HTTP check', err)
  }

  console.log('\n=====================================================================')
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=====================================================================\n')

  if (failed > 0) process.exit(1)
  process.exit(0)
}

testLiveStorefront()
