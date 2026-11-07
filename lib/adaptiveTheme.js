/**
 * Adaptive Theme Color System for CreatorStore
 * 
 * Deterministically generates coordinated, accessible storefront palettes
 * across link tiles, featured cards, product cards, bundle cards, and CTAs
 * based on the creator's chosen Button Color, Page Background, and Theme Mode.
 * 
 * Supports 3 Theme Modes:
 * 1. Adaptive (default): Automatically coordinates surfaces, text, borders, and CTAs
 *    from the button color and page background using color harmony and contrast math.
 * 2. Manual: Respects explicit creator choices for card surface, text, and button colors,
 *    providing live WCAG validation and safe rendered fallbacks for low-contrast combinations.
 * 3. Preset: Curated accessible palettes (Light, Dark, and Accent themes).
 */

import {
  parseColor,
  getRelativeLuminance,
  getContrastRatio,
  isLightColor,
  isDarkColor,
  getAccessibleTextColor,
  getAccessibleMutedTextColor,
} from './colorContrast.js'

/**
 * Convert RGB (0-255) to HSL ({ h: 0-360, s: 0-100, l: 0-100 })
 */
export function rgbToHsl({ r, g, b }) {
  const normR = r / 255
  const normG = g / 255
  const normB = b / 255

  const max = Math.max(normR, normG, normB)
  const min = Math.min(normR, normG, normB)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case normR:
        h = (normG - normB) / d + (normG < normB ? 6 : 0)
        break
      case normG:
        h = (normB - normR) / d + 2
        break
      case normB:
        h = (normR - normG) / d + 4
        break
      default:
        break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

/**
 * Convert HSL ({ h: 0-360, s: 0-100, l: 0-100 }) to 6-character Hex string
 */
export function hslToHex(h, s, l) {
  const normH = (((h % 360) + 360) % 360) / 360
  const normS = Math.max(0, Math.min(100, s)) / 100
  const normL = Math.max(0, Math.min(100, l)) / 100

  let r, g, b

  if (normS === 0) {
    r = g = b = normL
  } else {
    const hue2rgb = (p, q, t) => {
      let val = t
      if (val < 0) val += 1
      if (val > 1) val -= 1
      if (val < 1 / 6) return p + (q - p) * 6 * val
      if (val < 1 / 2) return q
      if (val < 2 / 3) return p + (q - p) * (2 / 3 - val) * 6
      return p
    }

    const q = normL < 0.5 ? normL * (1 + normS) : normL + normS - normL * normS
    const p = 2 * normL - q
    r = hue2rgb(p, q, normH + 1 / 3)
    g = hue2rgb(p, q, normH)
    b = hue2rgb(p, q, normH - 1 / 3)
  }

  const toHex = (x) => {
    const hex = Math.round(x * 255).toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/**
 * Safely normalizes any color input to uppercase 6-character hex.
 * Falls back to defaultFallback if invalid.
 */
export function normalizeHexColor(input, defaultFallback = '#000000') {
  if (!input || typeof input !== 'string') return defaultFallback
  const trimmed = input.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const r = trimmed[1]
      const g = trimmed[2]
      const b = trimmed[3]
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
    }
    return trimmed.toUpperCase()
  }

  // Reject arbitrary non-color strings immediately
  const lower = trimmed.toLowerCase()
  const validNamed = ['black', 'white', 'transparent', 'red', 'green', 'blue', 'gray', 'grey', 'silver', 'darkgray', 'lightgray']
  if (!validNamed.includes(lower) && !lower.startsWith('rgb') && !lower.startsWith('hsl')) {
    return defaultFallback
  }

  try {
    const parsed = parseColor(trimmed)
    const toHex = (n) => {
      const h = Math.round(n).toString(16)
      return h.length === 1 ? `0${h}` : h
    }
    return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}`.toUpperCase()
  } catch {
    return defaultFallback
  }
}

/**
 * Validates WCAG contrast between foreground and background.
 * Target >= 4.5:1 for body/normal text, >= 3.0:1 for large text/icons.
 */
export function validateContrast({ foreground, background, minContrast = 4.5, label = 'Text' }) {
  const fg = normalizeHexColor(foreground, '#FFFFFF')
  const bg = normalizeHexColor(background, '#000000')
  const ratio = getContrastRatio(fg, bg)
  const passed = ratio >= minContrast

  return {
    passed,
    ratio: Math.round(ratio * 10) / 10,
    minContrast,
    label,
    warning: passed
      ? null
      : `${label} (${fg}) has insufficient contrast (${Math.round(ratio * 10) / 10}:1) against background (${bg}). Target is >= ${minContrast}:1.`,
    safeForeground: passed ? fg : getAccessibleTextColor(bg, fg, minContrast),
  }
}

/**
 * Curated Preset Palettes for Preset Mode
 */
export const THEME_PALETTE_PRESETS = [
  {
    id: 'light-minimal',
    name: 'Light Minimal',
    description: 'Clean crisp white with deep slate buttons',
    pageBg: '#FFFFFF',
    buttonColor: '#0F172A',
    buttonTextColor: '#FFFFFF',
    cardBg: '#F8FAFC',
    textColor: '#0F172A',
  },
  {
    id: 'midnight-dark',
    name: 'Midnight Dark',
    description: 'Deep black with electric blue accent buttons',
    pageBg: '#090A0F',
    buttonColor: '#4D7CFF',
    buttonTextColor: '#FFFFFF',
    cardBg: '#12141C',
    textColor: '#F8FAFC',
  },
  {
    id: 'purple-velvet',
    name: 'Purple Velvet',
    description: 'Royal purple with vibrant lavender accents',
    pageBg: '#130B24',
    buttonColor: '#8B5CF6',
    buttonTextColor: '#FFFFFF',
    cardBg: '#1E1436',
    textColor: '#FAF5FF',
  },
  {
    id: 'emerald-slate',
    name: 'Emerald Slate',
    description: 'Dark slate with emerald green CTAs',
    pageBg: '#0B1313',
    buttonColor: '#10B981',
    buttonTextColor: '#022C22',
    cardBg: '#13201F',
    textColor: '#ECFDF5',
  },
  {
    id: 'warm-cream',
    name: 'Warm Cream',
    description: 'Warm chalk cream with rich coffee buttons',
    pageBg: '#F5EBE1',
    buttonColor: '#2D2319',
    buttonTextColor: '#F5EBE1',
    cardBg: '#FFFFFF',
    textColor: '#2D2319',
  },
  {
    id: 'amber-noir',
    name: 'Amber Noir',
    description: 'Charcoal backdrop with radiant amber CTA buttons',
    pageBg: '#14120C',
    buttonColor: '#F59E0B',
    buttonTextColor: '#1C1504',
    cardBg: '#211D14',
    textColor: '#FFFBEB',
  },
]

/**
 * Derives an adaptive card surface from the page background and button color.
 * Uses color temperature harmony (tinting the card surface with subtle button hue)
 * while strictly adhering to WCAG luminance and contrast boundaries.
 */
export function deriveAdaptiveCardSurface(pageBg, buttonColor) {
  const normPage = normalizeHexColor(pageBg, '#0A0A0A')
  const normBtn = normalizeHexColor(buttonColor, '#4D7CFF')

  const isBgLight = isLightColor(normPage)
  const btnRgb = parseColor(normBtn)
  const btnHsl = rgbToHsl(btnRgb)

  if (isBgLight) {
    // Light page background:
    // If the page is already pure white or near white, use pure white with border or soft warm off-white
    const pageLuminance = getRelativeLuminance(normPage)
    if (pageLuminance > 0.9) {
      // Pure or near pure white page: card is #FFFFFF with subtle neutral border
      return '#FFFFFF'
    }
    // Off-white / cream / pastel page: create elevated white or tinted card
    return '#FFFFFF'
  }

  // Dark page background:
  // We want an elevated surface that is darker than the button (if button is light)
  // or distinct from the button, subtly tinted with the button's hue (saturation 4-10%, lightness 8-12%)
  const pageHsl = rgbToHsl(parseColor(normPage))
  const cardHue = btnHsl.s > 15 ? btnHsl.h : pageHsl.h
  const cardSat = Math.min(10, Math.max(3, Math.round(btnHsl.s * 0.12)))
  
  // Ensure the card surface is slightly lighter than the page background for elevation depth
  const pageL = pageHsl.l
  const cardLightness = Math.max(8, Math.min(16, pageL + 5))

  const derivedSurface = hslToHex(cardHue, cardSat, cardLightness)

  // Verify that the derived surface is truly dark
  if (isDarkColor(derivedSurface)) {
    return derivedSurface
  }

  return '#18181B'
}

/**
 * Resolves CTA button styling for cards (featured cards, product & bundle cards)
 * ensuring that the CTA button NEVER blends into the card surface.
 */
export function resolveCardCtaButton({
  buttonColor,
  buttonTextColor = null,
  cardSurface,
  pageBg,
  buttonStyle = 'filled',
}) {
  const normBtn = normalizeHexColor(buttonColor, '#4D7CFF')
  const normCard = normalizeHexColor(cardSurface, '#18181B')
  const isCardLight = isLightColor(normCard)

  const contrastWithCard = getContrastRatio(normBtn, normCard)

  // Case 1: Button color has healthy contrast with card surface (>= 2.5:1)
  if (contrastWithCard >= 2.5) {
    const accessibleText = getAccessibleTextColor(normBtn, buttonTextColor, 4.5)
    const needsBorder = contrastWithCard < 3.2
    const border = needsBorder
      ? (isLightColor(normBtn) ? '1px solid rgba(0, 0, 0, 0.20)' : '1px solid rgba(255, 255, 255, 0.25)')
      : '1px solid transparent'

    const btnHsl = rgbToHsl(parseColor(normBtn))
    const hoverBg = hslToHex(
      btnHsl.h,
      btnHsl.s,
      isLightColor(normBtn) ? Math.max(0, btnHsl.l - 8) : Math.min(100, btnHsl.l + 8)
    )

    return {
      background: normBtn,
      hoverBackground: hoverBg,
      activeBackground: normBtn,
      color: accessibleText,
      iconColor: accessibleText,
      border,
      shadow: isCardLight ? '0 2px 8px rgba(0, 0, 0, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.30)',
      isDistinct: true,
      contrastWithCard: Math.round(contrastWithCard * 10) / 10,
    }
  }

  // Case 2: Button color blends into card surface (e.g. white on white card, black on dark card)
  // Intelligently fallback to high-contrast surface so the purchase action is never lost
  if (isCardLight) {
    // Card is light: use high-contrast dark CTA button
    const darkCta = '#111827'
    const darkCtaText = '#FFFFFF'
    return {
      background: darkCta,
      hoverBackground: '#1F2937',
      activeBackground: '#0F172A',
      color: darkCtaText,
      iconColor: darkCtaText,
      border: '1px solid #111827',
      shadow: '0 2px 8px rgba(0, 0, 0, 0.16)',
      isDistinct: true,
      fallbackApplied: true,
      contrastWithCard: Math.round(getContrastRatio(darkCta, normCard) * 10) / 10,
    }
  }

  // Card is dark: use high-contrast light CTA button
  const lightCta = '#FFFFFF'
  const lightCtaText = '#0F172A'
  return {
    background: lightCta,
    hoverBackground: '#F1F5F9',
    activeBackground: '#E2E8F0',
    color: lightCtaText,
    iconColor: lightCtaText,
    border: '1px solid #E2E8F0',
    shadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
    isDistinct: true,
    fallbackApplied: true,
    contrastWithCard: Math.round(getContrastRatio(lightCta, normCard) * 10) / 10,
  }
}

/**
 * Resolves standard link tile styling (ClassicLinkPill).
 * Respects Solid, Outline, and Soft styles while guaranteeing accessible contrast.
 */
export function resolveTileStyle({
  buttonColor,
  buttonTextColor = null,
  buttonStyle = 'filled',
  pageBg,
}) {
  const normBtn = normalizeHexColor(buttonColor, '#4D7CFF')
  const normPage = normalizeHexColor(pageBg, '#0A0A0A')
  const isPageLight = isLightColor(normPage)

  const contrastWithPage = getContrastRatio(normBtn, normPage)

  if (buttonStyle === 'outline' || buttonStyle === 'editorial-outline') {
    // Outline style: transparent background with buttonColor border
    // If button color has low contrast on page, adapt border to page text color
    const effectiveBorderColor = contrastWithPage >= 2.5
      ? normBtn
      : (isPageLight ? '#0F172A' : '#FFFFFF')
    const accessibleText = getAccessibleTextColor(normPage, effectiveBorderColor, 4.5)

    return {
      background: 'transparent',
      hoverBackground: isPageLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      activeBackground: isPageLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)',
      color: accessibleText,
      iconColor: accessibleText,
      border: `2px solid ${effectiveBorderColor}`,
      mutedText: getAccessibleMutedTextColor(normPage),
      style: 'outline',
    }
  }

  if (buttonStyle === 'soft') {
    // Soft style: subtle neutral surface with button color text
    const softBg = isPageLight ? '#F1F5F9' : '#1E2028'
    const softBorder = isPageLight ? '#E2E8F0' : '#2D313E'
    const accessibleText = getAccessibleTextColor(softBg, normBtn, 4.5)

    return {
      background: softBg,
      hoverBackground: isPageLight ? '#E2E8F0' : '#282B36',
      activeBackground: isPageLight ? '#CBD5E1' : '#333745',
      color: accessibleText,
      iconColor: accessibleText,
      border: `1px solid ${softBorder}`,
      mutedText: getAccessibleMutedTextColor(softBg),
      style: 'soft',
    }
  }

  // Solid ('filled') style:
  // Tile background = buttonColor
  let tileBg = normBtn
  let tileBorder = '1px solid transparent'

  // If button color has low contrast against the page (e.g. white button on white page, black on black)
  if (contrastWithPage < 1.8) {
    tileBorder = isPageLight ? '1px solid #CBD5E1' : '1px solid #334155'
  }

  const accessibleText = getAccessibleTextColor(tileBg, buttonTextColor, 4.5)
  const accessibleMuted = getAccessibleMutedTextColor(tileBg)

  const btnHsl = rgbToHsl(parseColor(tileBg))
  const hoverBg = hslToHex(
    btnHsl.h,
    btnHsl.s,
    isLightColor(tileBg) ? Math.max(0, btnHsl.l - 6) : Math.min(100, btnHsl.l + 6)
  )

  return {
    background: tileBg,
    hoverBackground: hoverBg,
    activeBackground: tileBg,
    color: accessibleText,
    iconColor: accessibleText,
    border: tileBorder,
    mutedText: accessibleMuted,
    style: 'filled',
  }
}

/**
 * Main Palette-Generation Utility.
 * 
 * Reusable and deterministic: accepts buttonColor, pageBg, themeMode, manualOverrides, buttonStyle.
 * Returns semantic design tokens for all storefront components.
 */
export function generateAdaptivePalette({
  buttonColor = '#4D7CFF',
  pageBg = '#000000',
  themeMode = 'adaptive',
  buttonStyle = 'filled',
  manualOverrides = {},
} = {}) {
  const normPage = normalizeHexColor(pageBg, '#000000')
  const normBtn = normalizeHexColor(buttonColor, '#4D7CFF')
  const isPageLight = isLightColor(normPage)

  const warnings = []

  // 1. Resolve Mode & Backward Compatibility
  const effectiveMode = (themeMode === 'manual' || themeMode === 'preset') ? themeMode : 'adaptive'

  // 2. Resolve Card Surface
  let cardSurface
  let isCardOverridden = false

  if (effectiveMode === 'manual' && manualOverrides.cardBg) {
    cardSurface = normalizeHexColor(manualOverrides.cardBg, isPageLight ? '#FFFFFF' : '#18181B')
    isCardOverridden = true
  } else if (effectiveMode === 'adaptive' && manualOverrides.cardBg && manualOverrides.cardBgOverride) {
    // Creator chose to customize card background while in Adaptive mode
    cardSurface = normalizeHexColor(manualOverrides.cardBg, isPageLight ? '#FFFFFF' : '#18181B')
    isCardOverridden = true
  } else {
    // Pure Adaptive derivation
    cardSurface = deriveAdaptiveCardSurface(normPage, normBtn)
    isCardOverridden = false
  }

  const isCardLight = isLightColor(cardSurface)

  // 3. Resolve Card Typography (Title, Body, Muted)
  let cardTitleColor = getAccessibleTextColor(cardSurface, manualOverrides.cardTextColor || null, 4.5)
  let cardMutedColor = getAccessibleMutedTextColor(cardSurface, manualOverrides.cardMutedTextColor || null)

  // Check contrast warnings if manual overrides were provided
  if (manualOverrides.cardTextColor) {
    const val = validateContrast({
      foreground: manualOverrides.cardTextColor,
      background: cardSurface,
      minContrast: 4.5,
      label: 'Card Text',
    })
    if (!val.passed) {
      warnings.push(val.warning)
      // Provide safe rendered fallback while preserving user preference in overrides
      cardTitleColor = val.safeForeground
    }
  }

  // 4. Resolve Page Typography
  let pageTitleColor = getAccessibleTextColor(normPage, manualOverrides.titleColor || manualOverrides.textColor, 4.5)
  let pageTextColor = getAccessibleTextColor(normPage, manualOverrides.textColor, 4.5)
  let pageMutedText = getAccessibleMutedTextColor(normPage, manualOverrides.secondaryTextColor || manualOverrides.mutedText)

  if (manualOverrides.textColor) {
    const pageVal = validateContrast({
      foreground: manualOverrides.textColor,
      background: normPage,
      minContrast: 4.5,
      label: 'Page Text',
    })
    if (!pageVal.passed) {
      warnings.push(pageVal.warning)
      pageTextColor = pageVal.safeForeground
    }
  }

  // 5. Standard Link Tiles (ClassicLinkPill)
  const tileTokens = resolveTileStyle({
    buttonColor: normBtn,
    buttonTextColor: manualOverrides.buttonTextColor,
    buttonStyle,
    pageBg: normPage,
  })

  // 6. Card CTA Button (distinct from card surface)
  const ctaTokens = resolveCardCtaButton({
    buttonColor: normBtn,
    buttonTextColor: manualOverrides.buttonTextColor,
    cardSurface,
    pageBg: normPage,
    buttonStyle,
  })

  // 7. Card Borders & Shadows
  const cardBorder = isCardLight
    ? '1px solid rgba(0, 0, 0, 0.08)'
    : '1px solid rgba(255, 255, 255, 0.10)'
  const cardShadow = isCardLight
    ? '0 4px 16px rgba(0, 0, 0, 0.06)'
    : '0 4px 16px rgba(0, 0, 0, 0.35)'

  const dividerColor = isCardLight
    ? 'rgba(0, 0, 0, 0.06)'
    : 'rgba(255, 255, 255, 0.08)'

  // 8. Bundle & Product Card Extras
  const badgeBg = isCardLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)'
  const badgeText = isCardLight ? '#0F172A' : '#F8FAFC'
  const priceColor = cardTitleColor

  return {
    themeMode: effectiveMode,
    isCardOverridden,
    pageBg: normPage,
    pageText: pageTextColor,
    pageTitle: pageTitleColor,
    pageMutedText,
    isPageLight,
    buttonColor: normBtn,

    // Standard Link Tiles
    tile: {
      background: tileTokens.background,
      text: tileTokens.color,
      iconColor: tileTokens.iconColor,
      border: tileTokens.border,
      hoverBackground: tileTokens.hoverBackground,
      activeBackground: tileTokens.activeBackground,
      mutedText: tileTokens.mutedText,
      style: tileTokens.style,
    },

    // Featured Cards
    featuredCard: {
      background: cardSurface,
      text: cardTitleColor,
      mutedText: cardMutedColor,
      border: cardBorder,
      shadow: cardShadow,
      divider: dividerColor,
      ctaBackground: ctaTokens.background,
      ctaText: ctaTokens.color,
      ctaBorder: ctaTokens.border,
      ctaHoverBackground: ctaTokens.hoverBackground,
      ctaShadow: ctaTokens.shadow,
    },

    // Product & Bundle Cards
    productCard: {
      background: cardSurface,
      text: cardTitleColor,
      mutedText: cardMutedColor,
      border: cardBorder,
      shadow: cardShadow,
      divider: dividerColor,
      badgeBg,
      badgeText,
      priceText: priceColor,
      originalPriceText: cardMutedColor,
      ctaBackground: ctaTokens.background,
      ctaText: ctaTokens.color,
      ctaBorder: ctaTokens.border,
      ctaHoverBackground: ctaTokens.hoverBackground,
      ctaShadow: ctaTokens.shadow,
    },

    // Shared CTA button
    cta: ctaTokens,

    // Common Borders
    borders: {
      border: cardBorder,
      divider: dividerColor,
    },

    // Contrast metadata
    contrast: {
      isAccessible: warnings.length === 0,
      warnings,
      tileContrast: getContrastRatio(tileTokens.color, tileTokens.background),
      cardTextContrast: getContrastRatio(cardTitleColor, cardSurface),
      cardCtaContrast: getContrastRatio(ctaTokens.color, ctaTokens.background),
      ctaSeparationContrast: getContrastRatio(ctaTokens.background, cardSurface),
    },

    manualOverrides,
  }
}
