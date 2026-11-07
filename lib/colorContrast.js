/**
 * Color Contrast & Accessibility Engine for CreatorStore Storefronts
 * 
 * Provides WCAG 2.1 standard relative luminance calculation, contrast ratios,
 * and background-aware contrast resolution so storefronts automatically remain
 * crystal clear and legible across any custom background color.
 */

// Basic named color map for fallback parsing
const NAMED_COLORS = {
  black: '#000000',
  white: '#ffffff',
  transparent: 'rgba(0,0,0,0)',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  darkgray: '#a9a9a9',
  lightgray: '#d3d3d3',
}

/**
 * Parse any CSS color (hex, rgb, rgba, hsl, hsla, named) into { r, g, b, a }
 * Normalized to 0-255 for RGB and 0-1 for Alpha.
 */
export function parseColor(input) {
  if (!input || typeof input !== 'string') {
    return { r: 0, g: 0, b: 0, a: 1 }
  }

  let str = input.trim().toLowerCase()
  if (NAMED_COLORS[str]) {
    str = NAMED_COLORS[str]
  }

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (str.startsWith('#')) {
    const hex = str.slice(1)
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      }
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      }
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      }
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      }
    }
  }

  // RGB / RGBA: rgb(255, 255, 255), rgba(0, 0, 0, 0.5)
  const rgbaMatch = str.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (rgbaMatch) {
    return {
      r: Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10))),
      g: Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10))),
      b: Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10))),
      a: rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4]))) : 1,
    }
  }

  // HSL / HSLA: hsl(200, 50%, 50%), hsla(200, 50%, 50%, 0.8)
  const hslaMatch = str.match(/^hsla?\s*\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (hslaMatch) {
    const h = parseInt(hslaMatch[1], 10) / 360
    const s = parseFloat(hslaMatch[2]) / 100
    const l = parseFloat(hslaMatch[3]) / 100
    const a = hslaMatch[4] !== undefined ? parseFloat(hslaMatch[4]) : 1

    let r, g, b
    if (s === 0) {
      r = g = b = l
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
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1 / 3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1 / 3)
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
      a,
    }
  }

  // Default fallback: dark
  return { r: 0, g: 0, b: 0, a: 1 }
}

/**
 * Compute WCAG 2.1 relative luminance (0 to 1).
 */
export function getRelativeLuminance(color) {
  const { r, g, b } = parseColor(color)
  const toLinear = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Compute contrast ratio between two colors (1 to 21).
 */
export function getContrastRatio(color1, color2) {
  const l1 = getRelativeLuminance(color1)
  const l2 = getRelativeLuminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Returns true if the color is light (luminance > 0.40).
 */
export function isLightColor(color) {
  return getRelativeLuminance(color) > 0.40
}

/**
 * Returns true if the color is dark (luminance <= 0.40).
 */
export function isDarkColor(color) {
  return !isLightColor(color)
}

/**
 * Returns a high-contrast text color against the given background.
 * If preferredColor satisfies minContrast, it is preserved.
 * Otherwise returns #0F172A / #000000 for light bg or #FFFFFF for dark bg.
 */
export function getAccessibleTextColor(backgroundColor, preferredColor = null, minContrast = 4.5) {
  if (preferredColor) {
    const preferredRatio = getContrastRatio(backgroundColor, preferredColor)
    if (preferredRatio >= minContrast) {
      return preferredColor
    }
  }

  const whiteRatio = getContrastRatio(backgroundColor, '#FFFFFF')
  const darkRatio = getContrastRatio(backgroundColor, '#0F172A')
  const blackRatio = getContrastRatio(backgroundColor, '#000000')

  if (whiteRatio >= minContrast) return '#FFFFFF'
  if (darkRatio >= minContrast) return '#0F172A'
  if (blackRatio >= minContrast) return '#000000'

  // If none strictly hit minContrast, choose whichever has greatest contrast
  if (blackRatio >= whiteRatio) {
    return darkRatio >= 4.0 ? '#0F172A' : '#000000'
  }
  return '#FFFFFF'
}

/**
 * Returns an accessible secondary/muted text color with minimum 3.0 contrast.
 */
export function getAccessibleMutedTextColor(backgroundColor, preferredColor = null) {
  if (preferredColor) {
    const preferredRatio = getContrastRatio(backgroundColor, preferredColor)
    if (preferredRatio >= 3.0) {
      return preferredColor
    }
  }

  return isLightColor(backgroundColor) ? '#475569' : '#94A3B8'
}

/**
 * Returns a color that contrasts well against the background, falling back if preferredColor is poor.
 */
export function getContrastingColor(backgroundColor, preferredColor, fallbackLight = '#FFFFFF', fallbackDark = '#0F172A') {
  if (preferredColor) {
    const ratio = getContrastRatio(backgroundColor, preferredColor)
    if (ratio >= 3.0) return preferredColor
  }
  return isLightColor(backgroundColor) ? fallbackDark : fallbackLight
}

/**
 * Generate background-aware styles for PageSwitcherPills (Navigation Tabs).
 */
export function getPagePillStyles(backgroundColor, activeBgColor = '#4D7CFF', isActive = false) {
  const isBgLight = isLightColor(backgroundColor)

  if (isActive) {
    const effectiveActiveBg = activeBgColor || '#4D7CFF'
    const activeText = getAccessibleTextColor(effectiveActiveBg, null, 4.5)
    const bgContrast = getContrastRatio(backgroundColor, effectiveActiveBg)
    
    // If the active pill background has low contrast against the page background, add a crisp border
    const border = bgContrast < 2.5
      ? (isBgLight ? '1px solid rgba(0, 0, 0, 0.25)' : '1px solid rgba(255, 255, 255, 0.35)')
      : '1px solid transparent'

    const boxShadow = isBgLight
      ? '0 2px 8px rgba(0, 0, 0, 0.12)'
      : '0 2px 8px rgba(77, 124, 255, 0.30)'

    return {
      background: effectiveActiveBg,
      color: activeText,
      border,
      boxShadow,
      opacity: 1,
    }
  }

  // Inactive Pill Button
  if (isBgLight) {
    return {
      background: 'rgba(0, 0, 0, 0.06)',
      color: 'rgba(0, 0, 0, 0.75)',
      border: '1px solid rgba(0, 0, 0, 0.12)',
      boxShadow: 'none',
      opacity: 0.9,
    }
  }

  return {
    background: 'rgba(255, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.70)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: 'none',
    opacity: 0.9,
  }
}

/**
 * Returns effective primary background color of a theme/tokens.
 */
export function getEffectiveBackgroundColor(tokens) {
  if (!tokens) return '#000000'
  const wallpaper = tokens.wallpaper || {}
  const colors = tokens.colors || {}

  if (wallpaper.bgType === 'gradient' && wallpaper.gradientStart) {
    return wallpaper.gradientStart
  }
  return colors.background || wallpaper.gradientStart || '#000000'
}

/**
/**
 * Unified semantic token palettes for gallery themes.
 * Semantic tokens guarantee consistency across all cards, tiles, embeds, and controls.
 */
export const GALLERY_SEMANTIC_PALETTES = {
  creatorstore: {
    pageBackground: '#000000',
    surfaceBackground: '#12141C',
    surfaceElevated: '#1A1D27',
    primaryText: '#F4F2EC',
    secondaryText: 'rgba(244, 242, 236, 0.75)',
    mutedText: 'rgba(244, 242, 236, 0.55)',
    borderColor: 'rgba(244, 242, 236, 0.12)',
    accentColor: '#4D7CFF',
    accentText: '#000000',
    buttonBackground: '#4D7CFF',
    buttonText: '#000000',
    iconColor: '#F4F2EC',
    inputBackground: '#181B24',
    inputText: '#F4F2EC',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(77, 124, 255, 0.5)',
  },
  chalk: {
    pageBackground: '#F3E9DC',
    surfaceBackground: '#FAF6F0',
    surfaceElevated: '#FFFFFF',
    primaryText: '#1A1A1A',
    secondaryText: 'rgba(26, 26, 26, 0.74)',
    mutedText: 'rgba(26, 26, 26, 0.52)',
    borderColor: 'rgba(26, 26, 26, 0.14)',
    accentColor: '#1A1A1A',
    accentText: '#FAF6F0',
    buttonBackground: '#F3E9DC',
    buttonText: '#1A1A1A',
    iconColor: '#1A1A1A',
    inputBackground: '#FFFFFF',
    inputText: '#1A1A1A',
    cardShadow: '0 8px 24px 0 rgba(26, 26, 26, 0.08)',
    focusRing: 'rgba(26, 26, 26, 0.35)',
  },
  flare: {
    pageBackground: '#6B4FBB',
    surfaceBackground: '#2A164D',
    surfaceElevated: '#3D206E',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.78)',
    mutedText: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    accentColor: '#F0441E',
    accentText: '#FFFFFF',
    buttonBackground: '#FFFFFF',
    buttonText: '#1A1A1A',
    iconColor: '#FFFFFF',
    inputBackground: '#3D206E',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.35)',
    focusRing: 'rgba(255, 255, 255, 0.5)',
  },
  tide: {
    pageBackground: '#3B6FE0',
    surfaceBackground: '#1B3266',
    surfaceElevated: '#244185',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.78)',
    mutedText: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    accentColor: '#5B8CFF',
    accentText: '#FFFFFF',
    buttonBackground: '#5B8CFF',
    buttonText: '#FFFFFF',
    iconColor: '#FFFFFF',
    inputBackground: '#244185',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.35)',
    focusRing: 'rgba(91, 140, 255, 0.5)',
  },
  afterglow: {
    pageBackground: '#1A140F',
    surfaceBackground: '#282019',
    surfaceElevated: '#352B22',
    primaryText: '#F5E6D3',
    secondaryText: 'rgba(245, 230, 211, 0.75)',
    mutedText: 'rgba(245, 230, 211, 0.55)',
    borderColor: 'rgba(245, 230, 211, 0.12)',
    accentColor: '#C47A3A',
    accentText: '#1A140F',
    buttonBackground: '#2C241C',
    buttonText: '#F5E6D3',
    iconColor: '#F5E6D3',
    inputBackground: '#352B22',
    inputText: '#F5E6D3',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(196, 122, 58, 0.5)',
  },
  lattice: {
    pageBackground: '#E7F0C4',
    surfaceBackground: '#F4F8DE',
    surfaceElevated: '#FFFFFF',
    primaryText: '#1A1A1A',
    secondaryText: 'rgba(26, 26, 26, 0.74)',
    mutedText: 'rgba(26, 26, 26, 0.52)',
    borderColor: 'rgba(26, 26, 26, 0.14)',
    accentColor: '#1A1A1A',
    accentText: '#F4F8DE',
    buttonBackground: '#FFFFFF',
    buttonText: '#1A1A1A',
    iconColor: '#1A1A1A',
    inputBackground: '#FFFFFF',
    inputText: '#1A1A1A',
    cardShadow: '0 8px 24px 0 rgba(26, 26, 26, 0.08)',
    focusRing: 'rgba(26, 26, 26, 0.35)',
  },

  // 1. Grid
  grid: {
    pageBackground: '#F2F6ED',
    surfaceBackground: '#FFFFFF',
    surfaceElevated: '#F8FAF2',
    primaryText: '#1A2116',
    secondaryText: 'rgba(26, 33, 22, 0.72)',
    mutedText: 'rgba(26, 33, 22, 0.60)',
    borderColor: '#DCE4D3',
    accentColor: '#2D3B23',
    accentText: '#FFFFFF',
    buttonBackground: '#FFFFFF',
    buttonText: '#1A2116',
    iconColor: '#1A2116',
    inputBackground: '#F8FAF2',
    inputText: '#1A2116',
    cardShadow: '0 8px 24px 0 rgba(26, 33, 22, 0.06)',
    focusRing: 'rgba(45, 59, 35, 0.4)',
  },

  // 2. Groove
  groove: {
    pageBackground: '#281E48',
    surfaceBackground: '#1D1135',
    surfaceElevated: '#2C1B4E',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.80)',
    mutedText: 'rgba(255, 255, 255, 0.60)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    accentColor: '#EA6D35',
    accentText: '#100620',
    buttonBackground: '#EA6D35',
    buttonText: '#100620',
    iconColor: '#FFFFFF',
    inputBackground: '#2C1B4E',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(234, 109, 53, 0.5)',
  },

  // 3. Haven
  haven: {
    pageBackground: '#EDE7DE',
    surfaceBackground: '#FAF6F0',
    surfaceElevated: '#FFFFFF',
    primaryText: '#241F1B',
    secondaryText: 'rgba(36, 31, 27, 0.74)',
    mutedText: 'rgba(36, 31, 27, 0.58)',
    borderColor: '#E2D9CC',
    accentColor: '#705E4F',
    accentText: '#FFFFFF',
    buttonBackground: '#DED5C7',
    buttonText: '#241F1B',
    iconColor: '#241F1B',
    inputBackground: '#FFFFFF',
    inputText: '#241F1B',
    cardShadow: '0 8px 24px 0 rgba(36, 31, 27, 0.08)',
    focusRing: 'rgba(112, 94, 79, 0.4)',
  },

  // 4. Lake
  lake: {
    pageBackground: '#0D1424',
    surfaceBackground: '#121D33',
    surfaceElevated: '#1A2947',
    primaryText: '#F0F5FA',
    secondaryText: 'rgba(240, 245, 250, 0.76)',
    mutedText: 'rgba(240, 245, 250, 0.56)',
    borderColor: '#1E2F4F',
    accentColor: '#4B77BE',
    accentText: '#FFFFFF',
    buttonBackground: '#243A61',
    buttonText: '#FFFFFF',
    iconColor: '#F0F5FA',
    inputBackground: '#1A2947',
    inputText: '#F0F5FA',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(75, 119, 190, 0.5)',
  },

  // 5. Mineral
  mineral: {
    pageBackground: '#FAF5ED',
    surfaceBackground: '#FFFFFF',
    surfaceElevated: '#F4EDE2',
    primaryText: '#24201C',
    secondaryText: 'rgba(36, 32, 28, 0.74)',
    mutedText: 'rgba(36, 32, 28, 0.58)',
    borderColor: '#E8DDCF',
    accentColor: '#8A7B6D',
    accentText: '#FFFFFF',
    buttonBackground: '#EDE3D2',
    buttonText: '#24201C',
    iconColor: '#24201C',
    inputBackground: '#F4EDE2',
    inputText: '#24201C',
    cardShadow: '0 8px 24px 0 rgba(36, 32, 28, 0.08)',
    focusRing: 'rgba(138, 123, 109, 0.4)',
  },

  // 6. Nourish
  nourish: {
    pageBackground: '#586737',
    surfaceBackground: '#465328',
    surfaceElevated: '#546333',
    primaryText: '#F5F9E6',
    secondaryText: 'rgba(245, 249, 230, 0.78)',
    mutedText: 'rgba(245, 249, 230, 0.60)',
    borderColor: 'rgba(204, 216, 98, 0.22)',
    accentColor: '#CCD862',
    accentText: '#1E270A',
    buttonBackground: '#CCD862',
    buttonText: '#1E270A',
    iconColor: '#F5F9E6',
    inputBackground: '#546333',
    inputText: '#F5F9E6',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.35)',
    focusRing: 'rgba(204, 216, 98, 0.5)',
  },

  // 7. Rise
  rise: {
    pageBackground: '#D94532',
    surfaceBackground: '#661910',
    surfaceElevated: '#7D2117',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.80)',
    mutedText: 'rgba(255, 255, 255, 0.60)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    accentColor: '#F5A245',
    accentText: '#661910',
    buttonBackground: '#FFFFFF',
    buttonText: '#661910',
    iconColor: '#FFFFFF',
    inputBackground: '#7D2117',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.35)',
    focusRing: 'rgba(245, 162, 69, 0.5)',
  },

  // 8. Sweat
  sweat: {
    pageBackground: '#154CD1',
    surfaceBackground: '#0D2D82',
    surfaceElevated: '#133AA0',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.80)',
    mutedText: 'rgba(255, 255, 255, 0.60)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    accentColor: '#578EFA',
    accentText: '#FFFFFF',
    buttonBackground: '#255CE0',
    buttonText: '#FFFFFF',
    iconColor: '#FFFFFF',
    inputBackground: '#133AA0',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(87, 142, 250, 0.5)',
  },

  // 9. Tress
  tress: {
    pageBackground: '#1E261B',
    surfaceBackground: '#2A3526',
    surfaceElevated: '#374432',
    primaryText: '#EDE7DD',
    secondaryText: 'rgba(237, 231, 221, 0.76)',
    mutedText: 'rgba(237, 231, 221, 0.58)',
    borderColor: 'rgba(237, 231, 221, 0.14)',
    accentColor: '#C7BBA5',
    accentText: '#1E261B',
    buttonBackground: '#C7BBA5',
    buttonText: '#1E261B',
    iconColor: '#EDE7DD',
    inputBackground: '#374432',
    inputText: '#EDE7DD',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.35)',
    focusRing: 'rgba(199, 187, 165, 0.5)',
  },

  // 10. Twilight
  twilight: {
    pageBackground: '#351852',
    surfaceBackground: '#260F3D',
    surfaceElevated: '#3A1B59',
    primaryText: '#FAF0F8',
    secondaryText: 'rgba(250, 240, 248, 0.78)',
    mutedText: 'rgba(250, 240, 248, 0.60)',
    borderColor: 'rgba(226, 168, 216, 0.22)',
    accentColor: '#E2A8D8',
    accentText: '#240B38',
    buttonBackground: '#E2A8D8',
    buttonText: '#240B38',
    iconColor: '#FAF0F8',
    inputBackground: '#3A1B59',
    inputText: '#FAF0F8',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(226, 168, 216, 0.5)',
  },

  // 11. Vox
  vox: {
    pageBackground: '#A8110D',
    surfaceBackground: '#5E0906',
    surfaceElevated: '#730D0A',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.80)',
    mutedText: 'rgba(255, 255, 255, 0.60)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    accentColor: '#FF5C54',
    accentText: '#FFFFFF',
    buttonBackground: '#FFFFFF',
    buttonText: '#5E0906',
    iconColor: '#FFFFFF',
    inputBackground: '#730D0A',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(255, 92, 84, 0.5)',
  },

  // 12. Agate
  agate: {
    pageBackground: '#0B3E39',
    surfaceBackground: '#072A26',
    surfaceElevated: '#0D423D',
    primaryText: '#E6FAF7',
    secondaryText: 'rgba(230, 250, 247, 0.78)',
    mutedText: 'rgba(230, 250, 247, 0.60)',
    borderColor: 'rgba(50, 212, 178, 0.25)',
    accentColor: '#32D4B2',
    accentText: '#041F1C',
    buttonBackground: '#32D4B2',
    buttonText: '#041F1C',
    iconColor: '#E6FAF7',
    inputBackground: '#0D423D',
    inputText: '#E6FAF7',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(50, 212, 178, 0.5)',
  },

  // 13. Air
  air: {
    pageBackground: '#FAFAFA',
    surfaceBackground: '#FFFFFF',
    surfaceElevated: '#F4F4F5',
    primaryText: '#0F172A',
    secondaryText: 'rgba(15, 23, 42, 0.74)',
    mutedText: 'rgba(15, 23, 42, 0.58)',
    borderColor: '#E2E8F0',
    accentColor: '#2563EB',
    accentText: '#FFFFFF',
    buttonBackground: '#0F172A',
    buttonText: '#FFFFFF',
    iconColor: '#0F172A',
    inputBackground: '#F4F4F5',
    inputText: '#0F172A',
    cardShadow: '0 8px 24px 0 rgba(15, 23, 42, 0.08)',
    focusRing: 'rgba(37, 99, 235, 0.4)',
  },

  // 14. Astrid
  astrid: {
    pageBackground: '#0C0F17',
    surfaceBackground: '#141A26',
    surfaceElevated: '#1D2536',
    primaryText: '#EBF0F7',
    secondaryText: 'rgba(235, 240, 247, 0.76)',
    mutedText: 'rgba(235, 240, 247, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    accentColor: '#88C0D0',
    accentText: '#0C0F17',
    buttonBackground: '#253047',
    buttonText: '#FFFFFF',
    iconColor: '#EBF0F7',
    inputBackground: '#1D2536',
    inputText: '#EBF0F7',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(136, 192, 208, 0.5)',
  },

  // 15. Aura
  aura: {
    pageBackground: '#EFEBE4',
    surfaceBackground: '#FAF7F2',
    surfaceElevated: '#FFFFFF',
    primaryText: '#29241E',
    secondaryText: 'rgba(41, 36, 30, 0.74)',
    mutedText: 'rgba(41, 36, 30, 0.58)',
    borderColor: '#E5DED2',
    accentColor: '#8F7A65',
    accentText: '#FFFFFF',
    buttonBackground: '#DFD7CB',
    buttonText: '#29241E',
    iconColor: '#29241E',
    inputBackground: '#FFFFFF',
    inputText: '#29241E',
    cardShadow: '0 8px 24px 0 rgba(41, 36, 30, 0.08)',
    focusRing: 'rgba(143, 122, 101, 0.4)',
  },

  // 16. Bliss
  bliss: {
    pageBackground: '#F4F4F4',
    surfaceBackground: '#FFFFFF',
    surfaceElevated: '#EAEAEA',
    primaryText: '#111111',
    secondaryText: 'rgba(17, 17, 17, 0.72)',
    mutedText: 'rgba(17, 17, 17, 0.58)',
    borderColor: '#E5E5E5',
    accentColor: '#111111',
    accentText: '#FFFFFF',
    buttonBackground: '#111111',
    buttonText: '#FFFFFF',
    iconColor: '#111111',
    inputBackground: '#EAEAEA',
    inputText: '#111111',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.12)',
    focusRing: 'rgba(17, 17, 17, 0.4)',
  },

  // 17. Blocks
  blocks: {
    pageBackground: '#242163',
    surfaceBackground: '#171447',
    surfaceElevated: '#2B2673',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255, 255, 255, 0.78)',
    mutedText: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(217, 50, 136, 0.35)',
    accentColor: '#D93288',
    accentText: '#FFFFFF',
    buttonBackground: '#D93288',
    buttonText: '#FFFFFF',
    iconColor: '#FFFFFF',
    inputBackground: '#2B2673',
    inputText: '#FFFFFF',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(217, 50, 136, 0.5)',
  },

  // 18. Bloom
  bloom: {
    pageBackground: '#731745',
    surfaceBackground: '#4C0D2C',
    surfaceElevated: '#611339',
    primaryText: '#FFF0F7',
    secondaryText: 'rgba(255, 240, 247, 0.78)',
    mutedText: 'rgba(255, 240, 247, 0.60)',
    borderColor: 'rgba(245, 176, 212, 0.22)',
    accentColor: '#F5B0D4',
    accentText: '#38061F',
    buttonBackground: '#F5B0D4',
    buttonText: '#38061F',
    iconColor: '#FFF0F7',
    inputBackground: '#611339',
    inputText: '#FFF0F7',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    focusRing: 'rgba(245, 176, 212, 0.5)',
  },

  // 19. Breeze
  breeze: {
    pageBackground: '#D8E6F7',
    surfaceBackground: '#FFFFFF',
    surfaceElevated: '#EDF4FC',
    primaryText: '#192433',
    secondaryText: 'rgba(25, 36, 51, 0.74)',
    mutedText: 'rgba(25, 36, 51, 0.58)',
    borderColor: 'rgba(25, 36, 51, 0.10)',
    accentColor: '#6D84C7',
    accentText: '#FFFFFF',
    buttonBackground: '#FFFFFF',
    buttonText: '#192433',
    iconColor: '#192433',
    inputBackground: '#EDF4FC',
    inputText: '#192433',
    cardShadow: '0 8px 24px 0 rgba(25, 36, 51, 0.08)',
    focusRing: 'rgba(109, 132, 199, 0.4)',
  },

  // 20. Encore
  encore: {
    pageBackground: '#0B0B0E',
    surfaceBackground: '#141419',
    surfaceElevated: '#1F1F26',
    primaryText: '#E89F78',
    secondaryText: 'rgba(232, 159, 120, 0.78)',
    mutedText: 'rgba(232, 159, 120, 0.60)',
    borderColor: '#6E3B22',
    accentColor: '#E89F78',
    accentText: '#0B0B0E',
    buttonBackground: '#1A171D',
    buttonText: '#E89F78',
    iconColor: '#E89F78',
    inputBackground: '#1F1F26',
    inputText: '#E89F78',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.55)',
    focusRing: 'rgba(232, 159, 120, 0.5)',
  },
}

/**
 * Resolves full semantic tokens for any theme (gallery presets or custom).
 * WCAG AA contrast rules are strictly applied.
 */
export function resolveUnifiedSemanticTokens(tokens = {}, storeTheme = {}) {
  const effectiveBg = getEffectiveBackgroundColor(tokens)
  const isLight = isLightColor(effectiveBg)

  // 1. Check if an explicit gallery theme matches
  const galleryThemeId = (storeTheme?.galleryThemeId || tokens?.galleryThemeId || storeTheme?.presetId || tokens?.presetId || '').toLowerCase().trim()
  const basePalette = GALLERY_SEMANTIC_PALETTES[galleryThemeId]

  let semantic
  if (basePalette) {
    semantic = { ...basePalette }
    // If background was customized away from preset default, update pageBackground
    if (storeTheme?.background && storeTheme.background !== basePalette.pageBackground) {
      semantic.pageBackground = storeTheme.background
    }
    // If cardBg was customized, respect creator override
    if (storeTheme?.cardBg && storeTheme.cardBg !== basePalette.surfaceBackground) {
      semantic.surfaceBackground = storeTheme.cardBg
      semantic.primaryText = getAccessibleTextColor(semantic.surfaceBackground, storeTheme?.cardTextColor || storeTheme?.textColor || basePalette.primaryText, 4.5)
      semantic.secondaryText = getAccessibleMutedTextColor(semantic.surfaceBackground, storeTheme?.cardMutedTextColor || storeTheme?.secondaryTextColor || basePalette.secondaryText)
      semantic.mutedText = getAccessibleMutedTextColor(semantic.surfaceBackground)
    }
    // If buttonColor was customized, respect creator override and check contrast
    if (storeTheme?.buttonColor && storeTheme.buttonColor !== basePalette.buttonBackground) {
      semantic.buttonBackground = storeTheme.buttonColor
      semantic.buttonText = getAccessibleTextColor(semantic.buttonBackground, storeTheme?.buttonTextColor, 4.5)
    }
  } else {
    // Custom or standard theme
    const userCardBg = storeTheme?.cardBg || tokens?.colors?.cardBg || tokens?.cards?.bg
    const surfaceBackground = userCardBg || (isLight ? '#FFFFFF' : '#18181B')
    const surfaceElevated = isLight ? '#FFFFFF' : '#242427'
    const primaryText = getAccessibleTextColor(surfaceBackground, storeTheme?.cardTextColor || storeTheme?.textColor || tokens?.colors?.text, 4.5)
    const secondaryText = getAccessibleMutedTextColor(surfaceBackground, storeTheme?.cardMutedTextColor || storeTheme?.secondaryTextColor || tokens?.colors?.mutedText)
    const mutedText = getAccessibleMutedTextColor(surfaceBackground, isLight ? '#64748B' : '#71717A')
    const borderColor = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)'
    const accentColor = storeTheme?.primaryColor || tokens?.colors?.primaryColor || tokens?.buttons?.color || (isLight ? '#0F172A' : '#4D7CFF')
    const accentText = getAccessibleTextColor(accentColor, null, 4.5)
    const buttonBackground = storeTheme?.buttonColor || tokens?.buttons?.color || tokens?.colors?.buttonColor || accentColor
    const buttonText = getAccessibleTextColor(buttonBackground, storeTheme?.buttonTextColor || tokens?.buttons?.textColor || tokens?.colors?.buttonText, 4.5)
    const iconColor = primaryText
    const inputBackground = isLight ? '#F4F4F4' : '#242424'
    const inputText = primaryText
    const cardShadow = isLight ? '0 8px 24px 0 rgba(0, 0, 0, 0.08)' : '0 8px 24px 0 rgba(0, 0, 0, 0.45)'
    const focusRing = isLight ? 'rgba(0, 0, 0, 0.35)' : 'rgba(77, 124, 255, 0.5)'

    semantic = {
      pageBackground: effectiveBg,
      surfaceBackground,
      surfaceElevated,
      primaryText,
      secondaryText,
      mutedText,
      borderColor,
      accentColor,
      accentText,
      buttonBackground,
      buttonText,
      iconColor,
      inputBackground,
      inputText,
      cardShadow,
      focusRing,
    }
  }

  // Dynamic button & card separation guard:
  // If button and card backgrounds have low contrast (< 2.0:1), ensure clear separation
  const btnCardRatio = getContrastRatio(semantic.buttonBackground, semantic.surfaceBackground)
  if (btnCardRatio < 2.0) {
    if (isLightColor(semantic.surfaceBackground)) {
      // Light button on light card (e.g. white on white): enforce high-contrast border
      semantic.buttonBorder = '1.5px solid #0F172A'
      semantic.buttonText = getAccessibleTextColor(semantic.buttonBackground, '#0F172A', 4.5)
    } else {
      // Dark button on dark card (e.g. black on black): enforce high-contrast light border
      semantic.buttonBorder = '1.5px solid rgba(255, 255, 255, 0.45)'
      semantic.buttonText = getAccessibleTextColor(semantic.buttonBackground, '#FFFFFF', 4.5)
    }
  }

  // Double check WCAG AA guarantees
  semantic.primaryText = getAccessibleTextColor(semantic.surfaceBackground, semantic.primaryText, 4.5)
  semantic.buttonText = getAccessibleTextColor(semantic.buttonBackground, semantic.buttonText, 4.5)
  semantic.inputText = getAccessibleTextColor(semantic.inputBackground, semantic.inputText, 4.5)

  return semantic
}

/**
 * Automatically calculates contrast adjustments on resolved tokens without mutating original saved choices.
 */
export function applyAutoContrastTokens(tokens, storeTheme = {}) {
  if (!tokens) return tokens

  const bg = getEffectiveBackgroundColor(tokens)
  const isBgLight = isLightColor(bg)
  const colors = { ...(tokens.colors || {}) }
  const buttons = { ...(tokens.buttons || {}) }
  const cards = { ...(tokens.cards || {}) }

  // 1. Text & Title contrast against Background
  const accessibleText = getAccessibleTextColor(bg, colors.text, 3.8)
  const accessibleTitle = getAccessibleTextColor(bg, colors.title || colors.text, 4.0)
  const accessibleMuted = getAccessibleMutedTextColor(bg, colors.mutedText)

  colors.text = accessibleText
  colors.title = accessibleTitle
  colors.mutedText = accessibleMuted

  // 2. Button Text contrast against Button Background
  const btnBg = buttons.color || colors.buttonColor || colors.primaryColor || '#4D7CFF'
  const accessibleBtnText = getAccessibleTextColor(btnBg, buttons.textColor || colors.buttonText, 4.5)
  buttons.textColor = accessibleBtnText
  colors.buttonText = accessibleBtnText

  // 3. Button Border / Soft / Outline styles contrast against Background
  if (buttons.style === 'outline' || buttons.style === 'editorial-outline' || buttons.style === 'soft') {
    const btnContrast = getContrastRatio(bg, btnBg)
    if (btnContrast < 2.5) {
      buttons.borderColor = isBgLight ? '#0F172A' : '#FFFFFF'
      buttons.textColor = isBgLight ? '#0F172A' : '#FFFFFF'
    }
  }

  // 4. Resolve unified semantic design tokens
  const semantic = resolveUnifiedSemanticTokens(tokens, storeTheme)

  const adaptivePalette = tokens?.adaptivePalette || null
  if (adaptivePalette) {
    if (tokens?.themeMode === 'adaptive' || !storeTheme?.galleryThemeId || storeTheme?.galleryThemeId === 'custom') {
      semantic.surfaceBackground = adaptivePalette.productCard.background
      semantic.primaryText = adaptivePalette.productCard.text
      semantic.secondaryText = adaptivePalette.productCard.mutedText
      semantic.mutedText = adaptivePalette.productCard.mutedText
      semantic.buttonBackground = adaptivePalette.tile.background
      semantic.buttonText = adaptivePalette.tile.text
      semantic.cardShadow = adaptivePalette.productCard.shadow
    }
  }

  // Align card surface and border to semantic design tokens
  cards.bg = semantic.surfaceBackground
  colors.cardBg = semantic.surfaceBackground
  colors.border = semantic.borderColor
  cards.border = `1px solid ${semantic.borderColor}`
  cards.shadow = semantic.cardShadow

  // Centralized Design Tokens (CSS Custom Properties)
  const tileBg = adaptivePalette?.tile?.background || buttons.color || colors.buttonColor || semantic.buttonBackground
  const tileText = adaptivePalette?.tile?.text || buttons.textColor || colors.buttonText || semantic.buttonText
  const tileBorder = adaptivePalette?.tile?.border || (buttons.borderColor && buttons.borderColor !== 'transparent' ? `1px solid ${buttons.borderColor}` : 'transparent')
  const ctaBg = adaptivePalette?.cta?.background || buttons.color || colors.buttonColor || semantic.buttonBackground
  const ctaText = adaptivePalette?.cta?.color || buttons.textColor || colors.buttonText || semantic.buttonText
  const ctaBorder = adaptivePalette?.cta?.border || (buttons.borderColor && buttons.borderColor !== 'transparent' ? `1px solid ${buttons.borderColor}` : 'transparent')
  const cardBorderCss = cards.border || `1px solid ${semantic.borderColor}`

  const cssVariables = {
    '--page-background': bg,
    '--page-text': accessibleText,
    '--secondary-text': accessibleMuted,
    '--title-color': accessibleTitle,
    '--tile-background': tileBg,
    '--tile-text': tileText,
    '--tile-border': tileBorder,
    '--button-background': ctaBg,
    '--button-text': ctaText,
    '--button-border': ctaBorder,
    '--card-background': semantic.surfaceBackground,
    '--card-text': semantic.primaryText,
    '--card-border': cardBorderCss,
    '--accent-color': semantic.accentColor,
    '--divider-color': semantic.borderColor,
    '--header-background': tokens.header?.background || bg,
    '--storefront-tile-radius': `${buttons.radius ?? 9999}px`,
    '--storefront-card-radius': `${cards.radius ?? 18}px`,
  }

  return {
    ...tokens,
    colors,
    buttons,
    cards,
    semantic,
    adaptivePalette,
    cssVariables,
    contrast: {
      isLight: isBgLight,
      bg,
      accessibleText,
      accessibleTitle,
      accessibleMuted,
      semantic,
      adaptivePalette,
      pagePills: {
        active: getPagePillStyles(bg, buttons.color || colors.buttonColor || '#4D7CFF', true),
        inactive: getPagePillStyles(bg, buttons.color || colors.buttonColor || '#4D7CFF', false),
      }
    }
  }
}

/**
 * Contrast theme for storefront cards. Surfaces are fully opaque —
 * no glass, blur, or alpha-bleed through the page background.
 * Seamlessly resolves from unified semantic tokens when available.
 */
export function getContrastColor(bgHex, tokensOrSemantic = null) {
  // 1. If tokens with semantic tokens or direct semantic palette is passed:
  const semantic = tokensOrSemantic?.semantic || (tokensOrSemantic?.surfaceBackground ? tokensOrSemantic : null)
  if (semantic) {
    const isLight = isLightColor(semantic.surfaceBackground)
    return {
      luminance: getRelativeLuminance(semantic.surfaceBackground),
      isLight,
      cardBg: semantic.surfaceBackground,
      cardBorder: semantic.borderColor,
      cardShadow: semantic.cardShadow,
      heading: semantic.primaryText,
      textHeading: semantic.primaryText,
      text: semantic.primaryText,
      muted: semantic.secondaryText,
      textMuted: semantic.mutedText,
      label: semantic.secondaryText,
      placeholder: semantic.mutedText,
      inputBg: semantic.inputBackground,
      inputBorder: semantic.borderColor,
      inputFocusBorder: semantic.focusRing,
      inputText: semantic.inputText,
      iconBg: semantic.surfaceElevated,
      iconColor: semantic.iconColor,
      divider: semantic.borderColor,
    }
  }

  // 2. Fallback to background luminance-based resolution
  const { r, g, b } = parseColor(bgHex || '#0A0A0A')
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const isHighLuminance = luminance > 0.45

  if (isHighLuminance) {
    return {
      luminance,
      isLight: true,
      cardBg: '#FFFFFF',
      cardBorder: '#E5E5E5',
      cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.12)',
      heading: '#111111',
      textHeading: '#111111',
      text: '#111111',
      muted: '#6B6B6B',
      textMuted: '#6B6B6B',
      label: '#525252',
      placeholder: '#A3A3A3',
      inputBg: '#F4F4F4',
      inputBorder: '#D4D4D4',
      inputFocusBorder: '#111111',
      inputText: '#111111',
      iconBg: '#F4F4F4',
      iconColor: '#111111',
      divider: '#E5E5E5',
    }
  }

  return {
    luminance,
    isLight: false,
    cardBg: '#1A1A1A',
    cardBorder: '#2E2E2E',
    cardShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
    heading: '#F5F5F5',
    textHeading: '#F5F5F5',
    text: '#F5F5F5',
    muted: '#96969D',
    textMuted: '#96969D',
    label: '#D4D4D8',
    placeholder: '#6B6B6B',
    inputBg: '#242424',
    inputBorder: '#2E2E2E',
    inputFocusBorder: '#4D7CFF',
    inputText: '#F5F5F5',
    iconBg: '#242424',
    iconColor: '#D4D4D8',
    divider: '#2E2E2E',
  }
}

/**
 * Resolves accessible styles for resource / PDF CTA buttons ("View", "Download", "Open", etc.)
 * based on the storefront background, card surface, and creator's preferred button color.
 * 
 * - Preserves creator's chosen button color whenever it has sufficient contrast.
 * - If contrast is insufficient (e.g. white button on white background, black on black),
 *   automatically selects an accessible fallback background.
 * - Computes dynamic WCAG 2.1 accessible text and icon colors (never white-on-white or black-on-black).
 * - Generates consistent, high-contrast hover treatments.
 */
export function getResourceButtonStyles(backgroundColor, preferredColor = null, cardBg = null) {
  const bg = backgroundColor || '#0A0A0A'
  const isBgLight = isLightColor(bg)
  const surface = cardBg || (isBgLight ? '#FFFFFF' : '#000000')

  let buttonBg = preferredColor || (isBgLight ? '#0F172A' : '#4D7CFF')

  // Check contrast against both card surface and page background
  const contrastWithSurface = getContrastRatio(surface, buttonBg)
  const contrastWithPage = getContrastRatio(bg, buttonBg)

  // If preferred color blends into the surface (< 2.4 contrast ratio)
  // or if background is light and button is also light with low contrast:
  if (contrastWithSurface < 2.4 || (isBgLight && isLightColor(buttonBg) && contrastWithSurface < 3.2)) {
    buttonBg = isBgLight ? '#0F172A' : '#FFFFFF'
  } else if (!isBgLight && !isLightColor(buttonBg) && contrastWithSurface < 2.4) {
    buttonBg = '#FFFFFF'
  }

  // Calculate accessible text & icon color on top of the resolved buttonBg (minimum 4.5:1 WCAG AA)
  const buttonTextColor = getAccessibleTextColor(buttonBg, null, 4.5)

  // Border separation if button contrast against surface is under 3.5:1
  const effectiveContrast = getContrastRatio(surface, buttonBg)
  const needsBorder = effectiveContrast < 3.5
  const buttonBorder = needsBorder
    ? (isLightColor(buttonBg) ? '1px solid rgba(0, 0, 0, 0.20)' : '1px solid rgba(255, 255, 255, 0.25)')
    : '1px solid transparent'

  return {
    buttonBg,
    buttonTextColor,
    buttonBorder,
    isLightButton: isLightColor(buttonBg),
  }
}

/**
 * Extracts the primary theme / accent color from a theme object or string.
 */
export function extractThemeAccentColor(themeOrColor) {
  if (!themeOrColor) return '#4D7CFF'
  if (typeof themeOrColor === 'string') {
    const trimmed = themeOrColor.trim()
    return trimmed ? trimmed : '#4D7CFF'
  }
  if (typeof themeOrColor === 'object') {
    return (
      themeOrColor.buttonColor ||
      themeOrColor.primaryColor ||
      themeOrColor.accentColor ||
      themeOrColor.colors?.buttonColor ||
      themeOrColor.colors?.primaryColor ||
      themeOrColor.buttons?.color ||
      themeOrColor.button?.color ||
      themeOrColor.button?.backgroundColor ||
      '#4D7CFF'
    )
  }
  return '#4D7CFF'
}

/**
 * Computes accessible colors for the Preview / View Store button on the dark dashboard.
 *
 * Rules:
 * 1. Dark theme/accent (luminance < 0.14): Light button surface, dark text/icon.
 * 2. Light monochrome theme/accent (luminance > 0.70 & low saturation): Dark elevated button surface, light text.
 * 3. Saturated accent color (purple, lime, blue, orange, etc.): Dynamic tinted elevated surface,
 *    accent-colored border/icon, high-contrast text, accent hover/focus.
 *
 * @param {string|Object} themeOrColor - Active theme object or hex color string
 * @returns {Object} Accessible color values and CSS custom property map
 */
export function getAccessiblePreviewColors(themeOrColor) {
  const accentHex = extractThemeAccentColor(themeOrColor)
  const { r, g, b } = parseColor(accentHex)
  const lum = getRelativeLuminance(accentHex)

  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  const chroma = (maxC - minC) / 255

  let background = ''
  let hoverBackground = ''
  let activeBackground = ''
  let color = ''
  let iconColor = ''
  let border = ''
  let hoverBorder = ''
  let focusRing = ''
  let shadow = ''

  // 1. Dark theme / Dark accent (black, dark navy, dark charcoal)
  if (lum < 0.14) {
    background = '#F4F4F5'
    hoverBackground = '#FFFFFF'
    activeBackground = '#E4E4E7'
    color = '#09090B'
    iconColor = '#09090B'
    border = '#E4E4E7'
    hoverBorder = '#FFFFFF'
    focusRing = 'rgba(255, 255, 255, 0.60)'
    shadow = '0 2px 8px rgba(0, 0, 0, 0.25)'
  }
  // 2. Light monochrome theme/accent (pure white, chalk cream, light gray)
  else if (lum > 0.70 && chroma < 0.18) {
    background = '#222226'
    hoverBackground = '#2C2C32'
    activeBackground = '#18181B'
    color = '#FFFFFF'
    iconColor = '#FFFFFF'
    border = 'rgba(255, 255, 255, 0.28)'
    hoverBorder = 'rgba(255, 255, 255, 0.65)'
    focusRing = 'rgba(255, 255, 255, 0.45)'
    shadow = '0 2px 8px rgba(0, 0, 0, 0.35)'
  }
  // 3. Saturated / Chromatic accent color (Lavender, Lime, Blue, Orange, Cyan, etc.)
  else {
    background = `rgba(${r}, ${g}, ${b}, 0.12)`
    hoverBackground = `rgba(${r}, ${g}, ${b}, 0.22)`
    activeBackground = `rgba(${r}, ${g}, ${b}, 0.30)`
    color = '#F5F5F5'
    iconColor = `rgb(${r}, ${g}, ${b})`
    border = `rgba(${r}, ${g}, ${b}, 0.40)`
    hoverBorder = `rgb(${r}, ${g}, ${b})`
    focusRing = `rgb(${r}, ${g}, ${b})`
    shadow = `0 2px 10px rgba(${r}, ${g}, ${b}, 0.18)`
  }

  const cssVariables = {
    '--preview-bg': background,
    '--preview-hover-bg': hoverBackground,
    '--preview-active-bg': activeBackground,
    '--preview-text': color,
    '--preview-icon': iconColor,
    '--preview-border': border,
    '--preview-hover-border': hoverBorder,
    '--preview-focus-ring': focusRing,
    '--preview-shadow': shadow,
  }

  return {
    background,
    hoverBackground,
    activeBackground,
    color,
    textColor: color,
    iconColor,
    border,
    borderColor: border,
    hoverBorder,
    focusRing,
    shadow,
    accentColor: accentHex,
    isDarkAccent: lum < 0.14,
    isLightAccent: lum > 0.70 && chroma < 0.18,
    cssVariables,
  }
}

/**
 * Returns dynamic styles and CSS variables for the Preview / View Store button.
 */
export function getPreviewButtonStyles(themeOrColor, options = {}) {
  const colors = getAccessiblePreviewColors(themeOrColor)
  return {
    colors,
    style: {
      ...colors.cssVariables,
      ...(options.style || {}),
    },
    className:
      'h-10 px-4 rounded-full border font-semibold text-xs inline-flex items-center gap-1.5 transition-all duration-200 cursor-pointer ' +
      'bg-[var(--preview-bg)] hover:bg-[var(--preview-hover-bg)] active:bg-[var(--preview-active-bg)] text-[var(--preview-text)] ' +
      'border-[var(--preview-border)] hover:border-[var(--preview-hover-border)] shadow-[var(--preview-shadow)] ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--preview-focus-ring)] active:scale-[0.98] ' +
      (options.className || ''),
  }
}

/**
 * Resolves high-contrast, accessible styles for Product Card CTA buttons.
 *
 * Rules:
 * - Dark product card (luminance <= 0.40):
 *     CTA background = #FFFFFF
 *     CTA text & arrow = #111318
 *     CTA border = #E5E7EB
 * - Light product card (luminance > 0.40):
 *     CTA background = #111318
 *     CTA text & arrow = #FFFFFF
 *     CTA border = #111318
 * - Always ensures WCAG AAA/AA strong contrast between button surface and button text.
 */
export function getProductCtaStyles(cardBackground, tokens = null) {
  if (tokens?.adaptivePalette?.cta) {
    const cta = tokens.adaptivePalette.cta
    const resolvedCardBg = cardBackground || tokens.adaptivePalette.productCard?.background || (tokens?.contrast?.isLight ? '#FFFFFF' : '#12141C')
    const isResolvedCardLight = isLightColor(resolvedCardBg)
    return {
      background: cta.background,
      hoverBackground: cta.hoverBackground,
      activeBackground: cta.activeBackground,
      color: cta.color,
      iconColor: cta.iconColor,
      border: cta.border,
      hoverBorder: cta.border,
      shadow: cta.shadow,
      hoverShadow: cta.shadow,
      isLightCard: isResolvedCardLight,
      cssVariables: {
        '--cta-bg': cta.background,
        '--cta-hover-bg': cta.hoverBackground,
        '--cta-text': cta.color,
        '--cta-icon': cta.iconColor,
        '--cta-border': cta.border,
        '--cta-hover-border': cta.border,
      }
    }
  }

  const cardBg = cardBackground || (tokens?.contrast?.isLight ? '#FFFFFF' : '#12141C')
  const isCardLight = isLightColor(cardBg)

  const preferredBtnBg = tokens?.semantic?.buttonBackground || tokens?.buttons?.color || tokens?.colors?.buttonColor
  const preferredBtnText = tokens?.semantic?.buttonText || tokens?.buttons?.textColor || tokens?.colors?.buttonText

  if (preferredBtnBg) {
    const contrastWithCard = getContrastRatio(cardBg, preferredBtnBg)
    // If the theme's button color has sufficient separation from the card surface
    if (contrastWithCard >= 2.5) {
      const btnTextColor = getAccessibleTextColor(preferredBtnBg, preferredBtnText, 4.5)
      const needsBorder = contrastWithCard < 3.2
      const btnBorder = needsBorder
        ? (isLightColor(preferredBtnBg) ? '1px solid rgba(0, 0, 0, 0.20)' : '1px solid rgba(255, 255, 255, 0.25)')
        : '1px solid transparent'

      return {
        background: preferredBtnBg,
        hoverBackground: preferredBtnBg,
        activeBackground: preferredBtnBg,
        color: btnTextColor,
        iconColor: btnTextColor,
        border: btnBorder,
        hoverBorder: btnBorder,
        shadow: isCardLight ? '0 2px 8px rgba(0, 0, 0, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.25)',
        hoverShadow: '0 4px 14px rgba(0, 0, 0, 0.22)',
        isLightCard: isCardLight,
        cssVariables: {
          '--cta-bg': preferredBtnBg,
          '--cta-hover-bg': preferredBtnBg,
          '--cta-text': btnTextColor,
          '--cta-icon': btnTextColor,
          '--cta-border': btnBorder,
          '--cta-hover-border': btnBorder,
        }
      }
    }
  }

  if (isCardLight) {
    return {
      background: '#111318',
      hoverBackground: '#1F242F',
      activeBackground: '#0B0D11',
      color: '#FFFFFF',
      iconColor: '#FFFFFF',
      border: '1px solid #111318',
      hoverBorder: '#1F242F',
      shadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
      hoverShadow: '0 4px 14px rgba(0, 0, 0, 0.22)',
      isLightCard: true,
      cssVariables: {
        '--cta-bg': '#111318',
        '--cta-hover-bg': '#1F242F',
        '--cta-text': '#FFFFFF',
        '--cta-icon': '#FFFFFF',
        '--cta-border': '#111318',
        '--cta-hover-border': '#1F242F',
      }
    }
  }

  return {
    background: '#FFFFFF',
    hoverBackground: '#F4F4F5',
    activeBackground: '#E4E4E7',
    color: '#111318',
    iconColor: '#111318',
    border: '1px solid #E5E7EB',
    hoverBorder: '#D1D5DB',
    shadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    hoverShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
    isLightCard: false,
    cssVariables: {
      '--cta-bg': '#FFFFFF',
      '--cta-hover-bg': '#F4F4F5',
      '--cta-text': '#111318',
      '--cta-icon': '#111318',
      '--cta-border': '#E5E7EB',
      '--cta-hover-border': '#D1D5DB',
    }
  }
}
