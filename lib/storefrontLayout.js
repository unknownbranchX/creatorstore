/** Per-link layout stored on section.props.layout: "classic" | "featured". */

export function normalizeSectionLayout(sectionType, layout) {
  if (layout === 'featured') return 'featured'
  if (layout === 'classic' || layout === 'compact') return 'classic'
  return 'classic'
}

export function faviconForUrl(url) {
  if (!url || url === '#') return null
  try {
    const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    const host = new URL(href).hostname
    if (!host) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
  } catch {
    return null
  }
}

export function leadingMedia({ thumbnail, url, title }) {
  if (thumbnail) return { type: 'image', src: thumbnail }
  const favicon = faviconForUrl(url)
  if (favicon) return { type: 'image', src: favicon }
  const letter = String(title || '?').trim().charAt(0).toUpperCase() || '?'
  return { type: 'letter', letter }
}

export function buttonRadiusCss(buttons = {}) {
  const radius = Number(buttons.radius)
  if (buttons.shape === 'pill' || radius >= 90) return '9999px'
  if (buttons.shape === 'square' && (!Number.isFinite(radius) || radius === 0)) return '0px'
  if (Number.isFinite(radius)) return `${radius}px`
  return '8px'
}

export function buttonShadowCss(shadow = 'soft', shadowColor = '#000000') {
  if (shadow === 'none') return 'none'
  const col = shadowColor || '#000000'
  switch (shadow) {
    case 'none':
      return 'none'
    case 'hard':
      return `0 6px 0 ${col}`
    case 'strong':
    case 'medium':
      return `0 5px 0 ${col === '#000000' ? 'rgba(0,0,0,0.22)' : col}`
    case 'soft':
    default:
      return '0 2px 6px rgba(0,0,0,0.10)'
  }
}

export function storefrontTileRadiusCss(buttons = {}) {
  const btn = buttons?.buttons || buttons
  const radius = Number(btn?.radius)
  if (btn?.shape === 'pill' || radius >= 90) return '9999px'
  if (btn?.shape === 'square' || radius === 0) return '0px'
  if (Number.isFinite(radius)) return `${radius}px`
  return '8px'
}

/**
 * Standard rectangular card border-radius calculation.
 * Ensures multi-line content cards (bundles, products, media embeds) maintain
 * a proportionate rectangular shape with moderately rounded corners (0-24px),
 * preventing pill/oval/circular distortion when creator selects 'Full' pill buttons.
 */
export function storefrontCardRadiusCss(tokens = {}) {
  const cardRadius = tokens?.cards?.radius
  if (cardRadius !== undefined && cardRadius !== null) {
    const num = Number(cardRadius)
    if (Number.isFinite(num)) {
      if (num === 0) return '0px'
      return `${Math.min(Math.max(num, 0), 24)}px`
    }
  }

  const btn = tokens?.buttons || tokens
  const r = Number(btn?.radius)
  if (btn?.shape === 'square' || r === 0) return '4px'
  if (r <= 6) return '8px'
  if (r <= 10) return '12px'
  if (r <= 16) return '16px'
  return '20px'
}

export function storefrontTileShadowCss(buttons = {}) {
  const btn = buttons?.buttons || buttons
  const shadow = btn?.shadow || 'soft'
  const shadowColor = btn?.shadowColor || '#000000'
  return buttonShadowCss(shadow, shadowColor)
}

export function buttonFaceStyle(tokens) {
  return getStorefrontTileStyle(tokens)
}

export function getStorefrontTileStyle(tokens) {
  const { colors = {}, buttons = {}, contrast = {}, semantic = {}, adaptivePalette = null } = tokens || {}
  const isLight = contrast.isLight ?? (colors.background ? colors.background.toLowerCase() === '#ffffff' || colors.background.toLowerCase() === '#f5f5f5' : false)
  const radius = storefrontTileRadiusCss(buttons)
  const boxShadow = buttons.shadow === 'none'
    ? 'none'
    : buttonShadowCss(buttons.shadow, buttons.shadowColor)

  if (adaptivePalette?.tile) {
    const tile = adaptivePalette.tile
    return {
      borderRadius: radius,
      background: tile.background,
      color: tile.text,
      border: tile.border,
      boxShadow,
    }
  }

  const btnBg = buttons.color || colors.buttonColor || colors.primaryColor || semantic.surfaceElevated || (isLight ? '#FFFFFF' : '#1F1F1F')
  const btnTxt = buttons.textColor || colors.buttonText || semantic.primaryText || (isLight ? '#0F172A' : '#FFFFFF')
  const style = buttons.style

  let border = isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)'
  if (semantic.borderColor) border = `1px solid ${semantic.borderColor}`
  if (buttons.borderColor && buttons.borderColor !== 'transparent') border = `1px solid ${buttons.borderColor}`

  if (style === 'outline' || style === 'editorial-outline') {
    const outlineBorder = buttons.borderColor || (isLight ? (btnBg === '#FFFFFF' ? '#0F172A' : btnBg) : (btnBg === '#000000' ? '#FFFFFF' : btnBg))
    const outlineText = buttons.textColor || outlineBorder
    return {
      borderRadius: radius,
      border: `2px solid ${outlineBorder}`,
      color: outlineText,
      background: 'transparent',
      boxShadow,
    }
  }

  if (style === 'glass') {
    return {
      borderRadius: radius,
      background: isLight ? '#F4F4F4' : '#1A1A1A',
      border: isLight ? '1px solid #E5E5E5' : '1px solid #2E2E2E',
      color: isLight ? '#0F172A' : (btnTxt || '#F5F5F5'),
      boxShadow,
    }
  }

  if (style === 'soft') {
    return {
      borderRadius: radius,
      background: isLight ? '#F4F4F4' : '#242424',
      color: isLight ? '#0F172A' : (btnTxt || btnBg),
      border: isLight ? '1px solid #E5E5E5' : '1px solid #2E2E2E',
      boxShadow,
    }
  }

  return {
    borderRadius: radius,
    background: btnBg,
    color: btnTxt,
    border,
    boxShadow,
  }
}


export const ROUNDNESS_PRESETS = [
  { key: 'sharp', radius: 4, shape: 'rounded', label: 'Sharp' },
  { key: 'medium', radius: 8, shape: 'rounded', label: 'Medium' },
  { key: 'soft', radius: 12, shape: 'rounded', label: 'Soft' },
  { key: 'full', radius: 9999, shape: 'pill', label: 'Full' },
]

export function roundnessKeyFromTheme(theme) {
  const r = Number(theme.buttonRadius)
  if (theme.buttonShape === 'pill' || r >= 90) return 'full'
  if (theme.buttonShape === 'square' || r === 0) return 'sharp'
  if (!Number.isFinite(r)) return 'medium'
  if (r >= 10) return 'soft'
  if (r >= 6) return 'medium'
  return 'sharp'
}

export function shadowKeyFromTheme(theme) {
  const s = theme.buttonShadow || 'soft'
  if (s === 'medium') return 'strong'
  if (s === 'none' || s === 'soft' || s === 'strong' || s === 'hard') return s
  return 'soft'
}

export function styleKeyFromTheme(theme) {
  const s = theme?.buttonStyle || 'filled'
  if (s === 'outline' || s === 'editorial-outline') return 'outline'
  if (s === 'soft' || s === 'glass') return 'soft'
  return 'filled'
}
