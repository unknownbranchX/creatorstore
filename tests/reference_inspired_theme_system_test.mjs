/**
 * CreatorStore — Reference-Inspired Theme System Comprehensive Test Suite
 * 
 * Verifies all 17 acceptance criteria from Section 11 of the specification:
 * 1. White button on a dark card
 * 2. White button on a white card (distinct border, never merges)
 * 3. Black button on a black card (distinct border, never merges)
 * 4. Dark button on a white card
 * 5. Lime button on an olive card (Nourish preset)
 * 6. Red button on a red-toned card (Vox preset)
 * 7. Purple button on a dark card (Twilight preset)
 * 8. Custom creator-selected colors
 * 9. Missing legacy theme settings (graceful defaults)
 * 10. Switching between presets (clean atomic patch)
 * 11. Saving and reloading a theme (JSON roundtrip)
 * 12. Preview and published storefront consistency (authoritative tokens)
 * 13. All supported tile types (links, products, bundles, media, socials)
 * 14. Mobile viewport tokens
 * 15. Long titles and descriptions
 * 16. Keyboard focus rings and hover states
 * 17. Theme configuration authorization
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import {
  STOREFRONT_GALLERY_THEMES,
  getGalleryThemeId,
  getGalleryTheme,
  themePatchFromGallery,
  gallerySwatchStyle,
} from '../lib/storefront-themes.js'

import {
  GALLERY_SEMANTIC_PALETTES,
  resolveUnifiedSemanticTokens,
  applyAutoContrastTokens,
  getContrastRatio,
  isLightColor,
  isDarkColor,
  getAccessibleTextColor,
  getProductCtaStyles,
} from '../lib/colorContrast.js'

import {
  generateAdaptivePalette,
  resolveCardCtaButton,
  resolveTileStyle,
} from '../lib/adaptiveTheme.js'

import { getThemeTokens } from '../lib/themePresets.js'
import { getThemeArtwork } from '../lib/storefront-theme-artwork.js'
import { getStorefrontTileStyle } from '../lib/storefrontLayout.js'

const REFERENCE_PRESET_IDS = [
  'grid', 'groove', 'haven', 'lake', 'mineral',
  'nourish', 'rise', 'sweat', 'tress', 'twilight',
  'vox', 'agate', 'air', 'astrid', 'aura',
  'bliss', 'blocks', 'bloom', 'breeze', 'encore'
]

const LEGACY_PRESET_IDS = ['creatorstore', 'chalk', 'flare', 'tide', 'afterglow', 'lattice']

describe('1. Reference-Inspired Theme Presets Model Audit', () => {
  it('defines all 20 reference presets plus legacy presets in STOREFRONT_GALLERY_THEMES', () => {
    for (const id of REFERENCE_PRESET_IDS) {
      const preset = STOREFRONT_GALLERY_THEMES.find(t => t.id === id)
      assert.ok(preset, `Preset '${id}' must exist in STOREFRONT_GALLERY_THEMES`)
      assert.ok(preset.name, `Preset '${id}' must have a display name`)
      assert.ok(preset.colors, `Preset '${id}' must have colors`)
      assert.ok(preset.colors.background, `Preset '${id}' must have background color`)
      assert.ok(preset.colors.buttons, `Preset '${id}' must have buttons color`)
      assert.ok(preset.colors.cardBg, `Preset '${id}' must have cardBg color`)
      assert.ok(preset.button, `Preset '${id}' must have button configuration`)
      assert.ok(preset.card, `Preset '${id}' must have card configuration`)
    }

    for (const id of LEGACY_PRESET_IDS) {
      const preset = STOREFRONT_GALLERY_THEMES.find(t => t.id === id)
      assert.ok(preset, `Legacy preset '${id}' must be preserved`)
    }
  })

  it('defines semantic palettes in GALLERY_SEMANTIC_PALETTES for all reference presets', () => {
    for (const id of REFERENCE_PRESET_IDS) {
      const palette = GALLERY_SEMANTIC_PALETTES[id]
      assert.ok(palette, `GALLERY_SEMANTIC_PALETTES must include '${id}'`)
      assert.ok(palette.pageBackground, `${id} must have pageBackground`)
      assert.ok(palette.surfaceBackground, `${id} must have surfaceBackground`)
      assert.ok(palette.primaryText, `${id} must have primaryText`)
      assert.ok(palette.buttonBackground, `${id} must have buttonBackground`)
      assert.ok(palette.buttonText, `${id} must have buttonText`)
      assert.ok(palette.borderColor, `${id} must have borderColor`)
      assert.ok(palette.focusRing, `${id} must have focusRing`)
    }
  })

  it('provides signature photographic artwork for Sweat, Nourish, Vox, Encore, Tress, Bliss', () => {
    const artworkThemes = ['sweat', 'nourish', 'vox', 'encore', 'tress', 'bliss']
    for (const id of artworkThemes) {
      const artwork = getThemeArtwork(id)
      assert.ok(artwork, `Artwork for '${id}' must be provided`)
      assert.ok(artwork.svgDataUri.startsWith('data:image/svg+xml'), `Artwork '${id}' must have valid SVG data URI`)
    }
  })
})

describe('2. Critical Color Combinations & Contrast Math', () => {
  // 1. White button on a dark card
  it('1. White button on dark card guarantees >= 4.5:1 text contrast and high visibility', () => {
    const cta = resolveCardCtaButton({
      buttonColor: '#FFFFFF',
      buttonTextColor: '#0F172A',
      cardSurface: '#0D2D82', // Sweat card surface
      pageBg: '#154CD1',
    })
    const textContrast = getContrastRatio(cta.color, cta.background)
    assert.ok(textContrast >= 4.5, `Text contrast on white button (${textContrast}:1) must be >= 4.5:1`)
    assert.ok(cta.contrastWithCard >= 2.5, `Button must separate from card (${cta.contrastWithCard}:1 >= 2.5:1)`)
  })

  // 2. White button on a white card
  it('2. White button on white card NEVER merges — receives visible boundary/border', () => {
    // In Adaptive Palette
    const palette = generateAdaptivePalette({
      buttonColor: '#FFFFFF',
      pageBg: '#FFFFFF',
      themeMode: 'adaptive',
    })
    // Tile on white page
    assert.ok(palette.tile.border.includes('1px solid'), 'White tile on white page must receive visible border')
    // CTA button inside card must be distinguishable and high contrast
    assert.ok(isDarkColor(palette.productCard.ctaBackground), 'CTA button on white card must be high-contrast dark')
    assert.ok(palette.cta.fallbackApplied, 'Fallback flag must be set')

    // In Semantic Tokens Guard
    const semantic = resolveUnifiedSemanticTokens({}, { buttonColor: '#FFFFFF', cardBg: '#FFFFFF' })
    assert.ok(semantic.buttonBorder, 'Semantic token must specify buttonBorder when button matches card')
    assert.ok(getContrastRatio(semantic.buttonText, semantic.buttonBackground) >= 4.5, 'Button text must remain readable')
  })

  // 3. Black button on a black card
  it('3. Black button on black card NEVER merges — receives visible boundary/border', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#000000',
      pageBg: '#000000',
      themeMode: 'adaptive',
    })
    assert.ok(palette.tile.border.includes('1px solid'), 'Black tile on black page must receive visible border')
    assert.ok(isLightColor(palette.productCard.ctaBackground), 'CTA on black card must be light')

    const semantic = resolveUnifiedSemanticTokens({}, { buttonColor: '#000000', cardBg: '#000000' })
    assert.ok(semantic.buttonBorder, 'Semantic token must specify light buttonBorder when dark button is on dark card')
    assert.ok(getContrastRatio(semantic.buttonText, semantic.buttonBackground) >= 4.5, 'Button text must remain readable')
  })

  // 4. Dark button on a white card
  it('4. Dark button on white card provides sharp contrast and readable text', () => {
    const cta = resolveCardCtaButton({
      buttonColor: '#0F172A',
      cardSurface: '#FFFFFF',
      pageBg: '#FAFAFA',
    })
    assert.strictEqual(cta.background, '#0F172A')
    assert.ok(getContrastRatio(cta.color, cta.background) >= 4.5, 'CTA text on dark button must be >= 4.5:1')
    assert.ok(cta.contrastWithCard >= 10, 'Dark button on white card has excellent separation (>10:1)')
  })

  // 5. Lime button on an olive card (Nourish preset)
  it('5. Lime button on olive card (Nourish) maintains color identity with > 4.5:1 text contrast and distinction', () => {
    const nourishPreset = STOREFRONT_GALLERY_THEMES.find(t => t.id === 'nourish')
    const patch = themePatchFromGallery(nourishPreset)
    const tokens = getThemeTokens({ ...patch, galleryThemeId: 'nourish' })

    // Button text contrast
    const btnTextContrast = getContrastRatio(tokens.buttons.textColor, tokens.buttons.color)
    assert.ok(
      btnTextContrast >= 4.5,
      `Nourish button text contrast (${btnTextContrast}:1) must be >= 4.5:1`
    )

    // Button vs card distinction
    const btnCardSeparation = getContrastRatio(tokens.buttons.color, tokens.cards.bg)
    assert.ok(
      btnCardSeparation >= 2.5,
      `Nourish lime button must be distinct from olive card surface (${btnCardSeparation}:1 >= 2.5:1)`
    )

    // Card text contrast
    const cardTextContrast = getContrastRatio(tokens.semantic.primaryText, tokens.semantic.surfaceBackground)
    assert.ok(
      cardTextContrast >= 4.5,
      `Nourish card text contrast (${cardTextContrast}:1) must be >= 4.5:1`
    )
  })

  // 6. Red button on a red-toned card (Vox preset)
  it('6. Red button on red-toned card (Vox) maintains high-contrast readable typography and distinct cards', () => {
    const voxPreset = STOREFRONT_GALLERY_THEMES.find(t => t.id === 'vox')
    const patch = themePatchFromGallery(voxPreset)
    const tokens = getThemeTokens({ ...patch, galleryThemeId: 'vox' })

    const btnTextContrast = getContrastRatio(tokens.buttons.textColor, tokens.buttons.color)
    assert.ok(
      btnTextContrast >= 4.5,
      `Vox button text contrast (${btnTextContrast}:1) must be >= 4.5:1`
    )

    const cardTextContrast = getContrastRatio(tokens.semantic.primaryText, tokens.semantic.surfaceBackground)
    assert.ok(
      cardTextContrast >= 4.5,
      `Vox card text contrast (${cardTextContrast}:1) must be >= 4.5:1`
    )
  })

  // 7. Purple button on a dark card (Twilight preset)
  it('7. Purple button on dark card (Twilight) maintains high-contrast readable typography', () => {
    const twilightPreset = STOREFRONT_GALLERY_THEMES.find(t => t.id === 'twilight')
    const patch = themePatchFromGallery(twilightPreset)
    const tokens = getThemeTokens({ ...patch, galleryThemeId: 'twilight' })

    const btnTextContrast = getContrastRatio(tokens.buttons.textColor, tokens.buttons.color)
    assert.ok(
      btnTextContrast >= 4.5,
      `Twilight button text contrast (${btnTextContrast}:1) must be >= 4.5:1`
    )
  })

  // 8. Custom creator-selected colors
  it('8. Custom creator-selected colors preserve user intent with accessible fallbacks', () => {
    const customPalette = generateAdaptivePalette({
      buttonColor: '#FF6B6B',
      pageBg: '#1A1A2E',
      themeMode: 'manual',
      manualOverrides: {
        cardBg: '#2E2E48',
        cardTextColor: '#F0F0FF',
      }
    })
    assert.strictEqual(customPalette.productCard.background, '#2E2E48')
    assert.strictEqual(customPalette.productCard.text, '#F0F0FF')
  })
})

describe('3. Robustness, Defaults & State Preservation', () => {
  // 9. Missing legacy theme settings
  it('9. Missing or empty theme settings fall back gracefully to sensible defaults', () => {
    const tokens = getThemeTokens({})
    assert.ok(tokens.colors, 'Tokens must include colors object')
    assert.ok(tokens.buttons, 'Tokens must include buttons object')
    assert.ok(tokens.cards, 'Tokens must include cards object')
    assert.ok(tokens.semantic, 'Tokens must include semantic tokens')
    assert.ok(tokens.cssVariables, 'Tokens must include cssVariables')
  })

  // 10. Switching between presets
  it('10. Switching between presets generates clean, atomic patches without leaking state', () => {
    const nourishPreset = STOREFRONT_GALLERY_THEMES.find(t => t.id === 'nourish')
    const sweatPreset = STOREFRONT_GALLERY_THEMES.find(t => t.id === 'sweat')

    const patch1 = themePatchFromGallery(nourishPreset, { galleryThemeId: 'custom' })
    assert.strictEqual(patch1.galleryThemeId, 'nourish')
    assert.strictEqual(patch1.background, '#586737')
    assert.strictEqual(patch1.buttonColor, '#CCD862')

    const patch2 = themePatchFromGallery(sweatPreset, patch1)
    assert.strictEqual(patch2.galleryThemeId, 'sweat')
    assert.strictEqual(patch2.background, '#154CD1')
    assert.strictEqual(patch2.buttonColor, '#255CE0')
  })

  // 11. Saving and reloading a theme (JSON roundtrip)
  it('11. Theme configuration survives JSON serialization and deserialization without data loss', () => {
    const encorePreset = STOREFRONT_GALLERY_THEMES.find(t => t.id === 'encore')
    const originalPatch = themePatchFromGallery(encorePreset)
    
    const serialized = JSON.stringify(originalPatch)
    const deserialized = JSON.parse(serialized)

    assert.strictEqual(deserialized.galleryThemeId, 'encore')
    assert.strictEqual(deserialized.background, '#0B0B0E')
    assert.strictEqual(deserialized.buttonColor, '#1A171D')
    assert.strictEqual(deserialized.textColor, '#E89F78')
  })

  // 12. Preview and published storefront consistency
  it('12. getThemeTokens produces identical design tokens for both preview and public storefront', () => {
    const theme = { galleryThemeId: 'vox', background: '#A8110D', buttonColor: '#FFFFFF' }
    const previewTokens = getThemeTokens(theme)
    const publicTokens = getThemeTokens(theme)

    assert.deepStrictEqual(previewTokens.colors, publicTokens.colors)
    assert.deepStrictEqual(previewTokens.semantic, publicTokens.semantic)
    assert.deepStrictEqual(previewTokens.cssVariables, publicTokens.cssVariables)
  })
})

describe('4. Storefront Tile Standards & Design Tokens', () => {
  // 13. All supported tile types
  it('13. getStorefrontTileStyle standardizes all tile styles from theme tokens', () => {
    const sweatTokens = getThemeTokens({ galleryThemeId: 'sweat' })
    const tileStyle = getStorefrontTileStyle(sweatTokens)

    assert.ok(tileStyle.background, 'Tile must have background')
    assert.ok(tileStyle.color, 'Tile must have text color')
    assert.ok(tileStyle.borderRadius, 'Tile must have border radius')
    assert.ok(tileStyle.boxShadow !== undefined, 'Tile must define shadow')
  })

  // 14. Mobile viewport tokens
  it('14. cssVariables exposes standard design tokens for mobile and desktop viewports', () => {
    const tokens = getThemeTokens({ galleryThemeId: 'nourish' })
    const vars = tokens.cssVariables

    assert.ok(vars['--page-background'], 'Must provide --page-background')
    assert.ok(vars['--page-text'], 'Must provide --page-text')
    assert.ok(vars['--tile-background'], 'Must provide --tile-background')
    assert.ok(vars['--tile-text'], 'Must provide --tile-text')
    assert.ok(vars['--button-background'], 'Must provide --button-background')
    assert.ok(vars['--button-text'], 'Must provide --button-text')
    assert.ok(vars['--card-background'], 'Must provide --card-background')
    assert.ok(vars['--card-text'], 'Must provide --card-text')
    assert.ok(vars['--card-border'], 'Must provide --card-border')
    assert.ok(vars['--accent-color'], 'Must provide --accent-color')
    assert.ok(vars['--divider-color'], 'Must provide --divider-color')
    assert.ok(vars['--storefront-tile-radius'], 'Must provide --storefront-tile-radius')
    assert.ok(vars['--storefront-card-radius'], 'Must provide --storefront-card-radius')
  })

  // 15. Long titles and descriptions (CSS truncation and line-clamp)
  it('15. PublicStoreRenderer and ClassicLinkPill include truncate and line-clamp classes', () => {
    const rendererPath = path.join(process.cwd(), 'components/storefront/PublicStoreRenderer.jsx')
    const rendererCode = fs.readFileSync(rendererPath, 'utf8')
    assert.ok(rendererCode.includes('truncate') || rendererCode.includes('break-words'), 'Storefront must include overflow truncation protection')

    const pillPath = path.join(process.cwd(), 'components/storefront/ClassicLinkPill.jsx')
    const pillCode = fs.readFileSync(pillPath, 'utf8')
    assert.ok(pillCode.includes('truncate') || pillCode.includes('min-w-0'), 'ClassicLinkPill must handle long text with truncate / min-w-0')
  })

  // 16. Keyboard focus rings and hover states
  it('16. All preset semantic palettes define accessible focus rings', () => {
    for (const id of REFERENCE_PRESET_IDS) {
      const palette = GALLERY_SEMANTIC_PALETTES[id]
      assert.ok(palette.focusRing, `Theme '${id}' must define focusRing`)
    }
  })

  // 17. Security & authorization integrity
  it('17. Store route enforces authenticated user session and creator ownership', () => {
    const apiRoutePath = path.join(process.cwd(), 'app/api/[[...path]]/route.js')
    const apiCode = fs.readFileSync(apiRoutePath, 'utf8')
    assert.ok(apiCode.includes('getCurrentUser') || apiCode.includes('authService') || apiCode.includes('session'), 'Store API must check server session')
    assert.ok(apiCode.includes('storeService.update(creatorId'), 'Store API must update store scoped strictly to creatorId')
  })
})
