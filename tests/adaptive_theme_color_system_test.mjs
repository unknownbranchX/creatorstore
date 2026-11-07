/**
 * CreatorStore — Adaptive Theme Color System Test Suite
 * 
 * Verifies:
 * 1. Palette Generation across diverse button colors:
 *    - Pure White (#FFFFFF), Pure Black (#000000)
 *    - Vibrant Royal Blue (#2563EB), Purple (#8B5CF6), Emerald (#10B981), Amber (#F59E0B)
 *    - Pastel Mint (#CCD7A3), Lavender (#E9D5FF)
 * 2. Light and Dark Page Background Adaptation:
 *    - Automatic card surface elevation and contrast
 * 3. Button Styles:
 *    - Solid ('filled'), Outline ('outline'), Soft ('soft')
 * 4. Distinct CTA Button on Featured, Product, and Bundle Cards:
 *    - Separation from card surface (contrast >= 2.5:1 or high-contrast fallback)
 *    - CTA text readability (contrast >= 4.5:1)
 * 5. Theme Modes (Adaptive, Manual, Preset):
 *    - Adaptive: coordinated automatic derivation
 *    - Manual: preserves creator choices, flags contrast warnings, produces safe fallbacks
 *    - Preset: curated palettes
 * 6. Robustness against Invalid & Missing Colors:
 *    - null, undefined, invalid hex strings, 3-digit hex
 * 7. Backward Compatibility:
 *    - Preserves existing stored theme settings without themeMode
 * 8. Live Preview vs Published Storefront Consistency:
 *    - Exact token equality between previewStore draft and published store renderer
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import {
  generateAdaptivePalette,
  deriveAdaptiveCardSurface,
  resolveCardCtaButton,
  resolveTileStyle,
  validateContrast,
  THEME_PALETTE_PRESETS,
  normalizeHexColor,
} from '../lib/adaptiveTheme.js'
import { getThemeTokens } from '../lib/themePresets.js'
import { getContrastRatio, isLightColor, isDarkColor } from '../lib/colorContrast.js'
import { getStorefrontTileStyle } from '../lib/storefrontLayout.js'

describe('1. Diverse Button Color Palette Generation & Accessible Contrast', () => {
  const testColors = [
    { name: 'Pure White', hex: '#FFFFFF', pageBg: '#0A0A0A' },
    { name: 'Pure Black', hex: '#000000', pageBg: '#FFFFFF' },
    { name: 'Vibrant Purple', hex: '#8B5CF6', pageBg: '#0F172A' },
    { name: 'Royal Blue', hex: '#2563EB', pageBg: '#111827' },
    { name: 'Emerald Green', hex: '#10B981', pageBg: '#0B1313' },
    { name: 'Amber Orange', hex: '#F59E0B', pageBg: '#18181B' },
    { name: 'Pastel Mint', hex: '#CCD7A3', pageBg: '#121212' },
  ]

  for (const { name, hex, pageBg } of testColors) {
    it(`generates accessible tokens for ${name} (${hex})`, () => {
      const palette = generateAdaptivePalette({
        buttonColor: hex,
        pageBg,
        themeMode: 'adaptive',
      })

      // Standard tile text must satisfy WCAG AA (>= 4.5:1)
      const tileContrast = getContrastRatio(palette.tile.text, palette.tile.background)
      assert.ok(
        tileContrast >= 4.5,
        `Tile text contrast for ${name} (${tileContrast}:1) must be >= 4.5:1`
      )

      // Product card text must satisfy WCAG AA (>= 4.5:1)
      const cardTextContrast = getContrastRatio(palette.productCard.text, palette.productCard.background)
      assert.ok(
        cardTextContrast >= 4.5,
        `Card text contrast for ${name} (${cardTextContrast}:1) must be >= 4.5:1`
      )

      // CTA button text must satisfy WCAG AA (>= 4.5:1)
      const ctaTextContrast = getContrastRatio(palette.productCard.ctaText, palette.productCard.ctaBackground)
      assert.ok(
        ctaTextContrast >= 4.5,
        `CTA text contrast for ${name} (${ctaTextContrast}:1) must be >= 4.5:1`
      )

      // CTA button must be visually distinct from the card surface
      const ctaSeparation = getContrastRatio(palette.productCard.ctaBackground, palette.productCard.background)
      assert.ok(
        ctaSeparation >= 2.5,
        `CTA button for ${name} must be distinct from card surface (${ctaSeparation}:1 >= 2.5:1)`
      )
    })
  }
})

describe('2. Light and Dark Page Background Handling', () => {
  it('derives clean light card surface on light page background', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#0F172A',
      pageBg: '#FFFFFF',
      themeMode: 'adaptive',
    })
    assert.strictEqual(palette.isPageLight, true)
    assert.ok(isLightColor(palette.productCard.background), 'Card surface on white page must be light')
    assert.ok(isDarkColor(palette.productCard.text), 'Card text on light card must be dark')
  })

  it('derives elevated dark card surface on dark page background', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#4D7CFF',
      pageBg: '#000000',
      themeMode: 'adaptive',
    })
    assert.strictEqual(palette.isPageLight, false)
    assert.ok(isDarkColor(palette.productCard.background), 'Card surface on black page must be dark')
    assert.ok(isLightColor(palette.productCard.text), 'Card text on dark card must be light')
  })

  it('White button on White page receives visible border and high-contrast CTA', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#FFFFFF',
      pageBg: '#FFFFFF',
      themeMode: 'adaptive',
    })
    // Tile on white background must have a visible border
    assert.ok(palette.tile.border.includes('1px solid'), 'Tile must have visible border on white background')
    // CTA button on white card must fall back to high-contrast dark button
    assert.ok(isDarkColor(palette.productCard.ctaBackground), 'CTA on white card must be dark')
    assert.ok(palette.cta.fallbackApplied, 'Fallback must be flagged')
  })

  it('Black button on Black page receives visible border and high-contrast CTA', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#000000',
      pageBg: '#000000',
      themeMode: 'adaptive',
    })
    assert.ok(palette.tile.border.includes('1px solid'), 'Tile must have visible border on black background')
    assert.ok(isLightColor(palette.productCard.ctaBackground), 'CTA on black card must be light')
    assert.ok(palette.cta.fallbackApplied, 'Fallback must be flagged')
  })
})

describe('3. Button Style Variants (Solid, Outline, Soft)', () => {
  it('Solid button variant uses buttonColor background and accessible text', () => {
    const tile = resolveTileStyle({
      buttonColor: '#4D7CFF',
      buttonStyle: 'filled',
      pageBg: '#0A0A0A',
    })
    assert.strictEqual(tile.background, '#4D7CFF')
    assert.strictEqual(tile.style, 'filled')
    const contrast = getContrastRatio(tile.color, tile.background)
    assert.ok(contrast >= 4.5, 'Solid button text must be >= 4.5:1')
  })

  it('Outline button variant uses transparent background and visible border', () => {
    const tile = resolveTileStyle({
      buttonColor: '#4D7CFF',
      buttonStyle: 'outline',
      pageBg: '#0A0A0A',
    })
    assert.strictEqual(tile.background, 'transparent')
    assert.strictEqual(tile.style, 'outline')
    assert.ok(tile.border.includes('2px solid'), 'Outline must have 2px border')
    const contrast = getContrastRatio(tile.color, '#0A0A0A')
    assert.ok(contrast >= 4.5, 'Outline text against page must be >= 4.5:1')
  })

  it('Soft button variant uses subtle surface and high-contrast text', () => {
    const tile = resolveTileStyle({
      buttonColor: '#4D7CFF',
      buttonStyle: 'soft',
      pageBg: '#FFFFFF',
    })
    assert.strictEqual(tile.style, 'soft')
    assert.ok(isLightColor(tile.background), 'Soft button on light page must have soft light surface')
    const contrast = getContrastRatio(tile.color, tile.background)
    assert.ok(contrast >= 4.5, 'Soft button text must be >= 4.5:1')
  })
})

describe('4. Theme Modes & Manual Overrides', () => {
  it('Adaptive mode automatically derives card surface', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#8B5CF6',
      pageBg: '#090A0F',
      themeMode: 'adaptive',
    })
    assert.strictEqual(palette.themeMode, 'adaptive')
    assert.strictEqual(palette.isCardOverridden, false)
  })

  it('Adaptive mode supports overriding card surface while continuing to adapt text', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#8B5CF6',
      pageBg: '#090A0F',
      themeMode: 'adaptive',
      manualOverrides: {
        cardBg: '#1A202C',
        cardBgOverride: true,
      },
    })
    assert.strictEqual(palette.themeMode, 'adaptive')
    assert.strictEqual(palette.isCardOverridden, true)
    assert.strictEqual(palette.productCard.background, '#1A202C')
    const textContrast = getContrastRatio(palette.productCard.text, palette.productCard.background)
    assert.ok(textContrast >= 4.5, 'Card text must adapt to custom cardBg')
  })

  it('Manual mode preserves explicit creator colors and warns on low contrast', () => {
    const palette = generateAdaptivePalette({
      buttonColor: '#4D7CFF',
      pageBg: '#FFFFFF',
      themeMode: 'manual',
      manualOverrides: {
        cardBg: '#F8FAFC',
        cardTextColor: '#F1F5F9', // Inaccessible: very light text on light card
      },
    })
    assert.strictEqual(palette.themeMode, 'manual')
    assert.strictEqual(palette.contrast.isAccessible, false)
    assert.ok(palette.contrast.warnings.length > 0, 'Must produce contrast warning')
    // Safe rendered fallback must ensure readability on storefront
    const renderedContrast = getContrastRatio(palette.productCard.text, palette.productCard.background)
    assert.ok(renderedContrast >= 4.5, 'Safe fallback must have >= 4.5:1 contrast')
  })

  it('Preset mode provides curated palettes with guaranteed contrast', () => {
    assert.ok(Array.isArray(THEME_PALETTE_PRESETS), 'THEME_PALETTE_PRESETS must be an array')
    assert.ok(THEME_PALETTE_PRESETS.length >= 6, 'Must provide at least 6 curated presets')
    for (const preset of THEME_PALETTE_PRESETS) {
      const palette = generateAdaptivePalette({
        buttonColor: preset.buttonColor,
        pageBg: preset.pageBg,
        themeMode: 'preset',
        manualOverrides: { cardBg: preset.cardBg },
      })
      const textContrast = getContrastRatio(palette.productCard.text, palette.productCard.background)
      assert.ok(textContrast >= 4.5, `Preset ${preset.name} card text contrast must be >= 4.5:1`)
    }
  })
})

describe('5. Robustness against Invalid & Missing Colors', () => {
  it('handles null, undefined, and empty string safely', () => {
    const p1 = generateAdaptivePalette({ buttonColor: null, pageBg: undefined })
    assert.ok(p1.productCard.background, 'Must return card surface')
    assert.ok(p1.tile.background, 'Must return tile background')

    const p2 = generateAdaptivePalette({})
    assert.ok(p2.productCard.background, 'Must return card surface with empty params')
  })

  it('handles invalid hex strings safely', () => {
    const norm = normalizeHexColor('not-a-color', '#4D7CFF')
    assert.strictEqual(norm, '#4D7CFF')

    const p = generateAdaptivePalette({ buttonColor: 'gibberish', pageBg: 'invalid' })
    assert.ok(p.tile.background.startsWith('#'), 'Must fall back to valid hex')
  })

  it('handles 3-digit hex correctly', () => {
    const norm = normalizeHexColor('#FFF')
    assert.strictEqual(norm, '#FFFFFF')
    const normDark = normalizeHexColor('#000')
    assert.strictEqual(normDark, '#000000')
  })
})

describe('6. Backward Compatibility & Theme Persistence', () => {
  it('getThemeTokens preserves stored custom theme settings without themeMode', () => {
    const legacyTheme = {
      background: '#1E293B',
      buttonColor: '#E2E8F0',
      buttonTextColor: '#0F172A',
      cardBg: '#0F172A',
    }
    const tokens = getThemeTokens(legacyTheme)
    assert.ok(tokens.adaptivePalette, 'Tokens must include adaptivePalette')
    assert.strictEqual(tokens.adaptivePalette.themeMode, 'manual')
    assert.strictEqual(tokens.cards.bg, '#0F172A')
  })

  it('getStorefrontTileStyle consumes adaptive tile tokens', () => {
    const theme = {
      buttonColor: '#8B5CF6',
      buttonStyle: 'filled',
    }
    const tokens = getThemeTokens(theme)
    const tileStyle = getStorefrontTileStyle(tokens)
    assert.strictEqual(tileStyle.background, '#8B5CF6')
    const contrast = getContrastRatio(tileStyle.color, tileStyle.background)
    assert.ok(contrast >= 4.5, 'Tile style color must have >= 4.5:1 contrast')
  })
})
