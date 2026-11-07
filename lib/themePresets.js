/**
 * CreatorStore Storefront Theme System & Design Engine
 * Defines complete visual design presets, layout structure tokens, and hero controls for storefront themes.
 */

import { resolveFontFamily } from './storefrontFonts.js'
import { applyAutoContrastTokens } from './colorContrast.js'
import { generateAdaptivePalette } from './adaptiveTheme.js'

export const STORE_LAYOUTS = {
  'classic': {
    id: 'classic',
    name: 'Classic Stack',
    tagline: 'Product-First Standard',
    description: 'Clean sequential layout: profile avatar header followed by product list and socials.',
    isHeroLayout: false,
  },
  'full-hero': {
    id: 'full-hero',
    name: 'Full Hero',
    tagline: '70% Viewport Cover',
    description: 'Creator image dominates the viewport with product cards overlapping the lower image section.',
    isHeroLayout: true,
    defaultOverlap: 'medium',
  },
  'floating-cards': {
    id: 'floating-cards',
    name: 'Floating Cards',
    tagline: 'Floating Over Photo',
    description: 'Full creator photo background with floating product cards featuring elevated shadows.',
    isHeroLayout: true,
    defaultOverlap: 'strong',
  },
  'creator-canvas': {
    id: 'creator-canvas',
    name: 'Creator Canvas',
    tagline: 'Bottom Product Sheet',
    description: 'Full-width hero header with product cards visually emerging from the bottom sheet.',
    isHeroLayout: true,
    defaultOverlap: 'subtle',
  },
  'immersive-portrait': {
    id: 'immersive-portrait',
    name: 'Immersive Portrait',
    tagline: 'Web Hero Portrait',
    description: 'Large web hero portrait frame with creator identity over image and floating products.',
    isHeroLayout: true,
    defaultOverlap: 'medium',
  },
  'editorial-overlay': {
    id: 'editorial-overlay',
    name: 'Editorial Overlay',
    tagline: 'Magazine Serif Hero',
    description: 'Large serif creator title, crisp photo hero, and asymmetric magazine product cards.',
    isHeroLayout: true,
    defaultOverlap: 'subtle',
  },
  'glass-creator': {
    id: 'glass-creator',
    name: 'Studio Creator',
    tagline: 'Solid layered cards',
    description: 'Dark creator hero with opaque grey product cards — no glass or blur.',
    isHeroLayout: true,
    defaultOverlap: 'medium',
  },
}

export const STORE_PRESETS = {
  // THEME 1: Minimal
  'minimal': {
    id: 'minimal',
    name: 'Minimal',
    tagline: 'Clean, Universal & High-Conversion',
    description: 'Generous whitespace, restrained neutral tones, strong typography, flat clean cards, and direct CTAs.',
    colorSwatches: ['#FFFFFF', '#F8FAFC', '#0F172A', '#64748B'],
    colors: {
      background: '#FFFFFF',
      surface: '#F8FAFC',
      text: '#0F172A',
      mutedText: '#64748B',
      primaryColor: '#0F172A',
      buttonColor: '#0F172A',
      buttonText: '#FFFFFF',
      secondaryAccent: '#E2E8F0',
      border: '#E2E8F0',
      cardBg: '#FFFFFF',
      badgeBg: '#F1F5F9',
      badgeText: '#0F172A',
    },
    typography: {
      headingFont: 'Manrope, sans-serif',
      bodyFont: 'Manrope, sans-serif',
      titleWeight: 'font-bold tracking-tight',
      headingStyle: 'normal',
    },
    layout: {
      profileStyle: 'minimal',
      productCardStyle: 'flat-minimal',
      containerWidth: 'w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto',
      profileAlignment: 'center',
    },
    cards: {
      radius: 8,
      border: '1px solid #E2E8F0',
      shadow: 'none',
      bg: '#FFFFFF',
      variant: 'minimal',
    },
    buttons: {
      style: 'solid',
      radius: 8,
      textTransform: 'font-bold tracking-wide',
      iconArrow: true,
    },
    profile: {
      imageShape: 'circle',
      imageSize: 'w-24 h-24',
      badgeStyle: 'subtle-pill',
    },
    social: {
      style: 'icon-only',
    },
  },

  // THEME 2: Creator
  'creator': {
    id: 'creator',
    name: 'Creator',
    tagline: 'Signature, Creative & Creator-First',
    description: 'CreatorStore signature dark charcoal theme with Electric Blue CTAs, Amber highlights, and Chalk typography.',
    colorSwatches: ['#000000', '#12141c', '#4D7CFF', '#F5A623'],
    colors: {
      background: '#000000',
      surface: '#12141c',
      text: '#F4F2EC',
      mutedText: 'rgba(244, 242, 236, 0.68)',
      primaryColor: '#4D7CFF',
      buttonColor: '#4D7CFF',
      buttonText: '#000000',
      secondaryAccent: '#CBE957',
      border: 'rgba(244, 242, 236, 0.12)',
      cardBg: '#12141c',
      badgeBg: 'rgba(77, 124, 255, 0.15)',
      badgeText: '#4D7CFF',
    },
    typography: {
      headingFont: 'Manrope, sans-serif',
      bodyFont: 'Manrope, sans-serif',
      titleWeight: 'font-bold tracking-tight',
      headingStyle: 'normal',
    },
    layout: {
      profileStyle: 'creator',
      productCardStyle: 'creator-card',
      containerWidth: 'w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto',
      profileAlignment: 'center',
    },
    cards: {
      radius: 12,
      border: '1px solid rgba(244, 242, 236, 0.12)',
      shadow: '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
      bg: '#12141c',
      variant: 'modern',
    },
    buttons: {
      style: 'solid',
      radius: 8,
      textTransform: 'font-bold tracking-wide',
      iconArrow: true,
    },
    profile: {
      imageShape: 'rounded',
      imageSize: 'w-28 h-28',
      badgeStyle: 'lavender-pill',
    },
    social: {
      style: 'pills',
    },
  },

  // THEME 3: Editorial
  'editorial': {
    id: 'editorial',
    name: 'Editorial',
    tagline: 'Serif Magazine Elegance',
    description: 'Serif typography, magazine-inspired whitespace, small editorial portrait, and soft neutral cards.',
    colorSwatches: ['#F7F5F0', '#FFFFFF', '#1C1917', '#D6C7B2'],
    colors: {
      background: '#F7F5F0',
      surface: '#FFFFFF',
      text: '#1C1917',
      mutedText: '#78716C',
      primaryColor: '#1C1917',
      buttonColor: '#1C1917',
      buttonText: '#FFFFFF',
      secondaryAccent: '#D6C7B2',
      border: '#E7E5E4',
      cardBg: '#FFFFFF',
      badgeBg: '#F2EFE9',
      badgeText: '#1C1917',
    },
    typography: {
      headingFont: "'Playfair Display', Georgia, serif",
      bodyFont: 'Manrope, sans-serif',
      titleWeight: 'font-normal italic',
      headingStyle: 'italic',
    },
    layout: {
      profileStyle: 'editorial',
      productCardStyle: 'editorial-asymmetric',
      containerWidth: 'w-full max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto',
      profileAlignment: 'center',
    },
    cards: {
      radius: 8,
      border: '1px solid #E7E5E4',
      shadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
      bg: '#FFFFFF',
      variant: 'premium',
    },
    buttons: {
      style: 'outline',
      radius: 8,
      textTransform: 'font-medium tracking-wide',
      iconArrow: true,
    },
    profile: {
      imageShape: 'portrait',
      imageSize: 'w-full h-72',
      badgeStyle: 'serif-tag',
    },
    social: {
      style: 'editorial-ring',
    },
  },

  // THEME 4: Dark
  'dark': {
    id: 'dark',
    name: 'Dark',
    tagline: 'Pitch Black & Star Badges',
    description: 'Pitch black background, elevated dark surfaces, fine subtle borders, star ratings, and high-contrast CTAs.',
    colorSwatches: ['#09090B', '#18181B', '#FAFAFA', '#A1A1AA'],
    colors: {
      background: '#09090B',
      surface: '#18181B',
      text: '#FAFAFA',
      mutedText: '#A1A1AA',
      primaryColor: '#FFFFFF',
      buttonColor: '#FFFFFF',
      buttonText: '#09090B',
      secondaryAccent: '#27272A',
      border: '#27272A',
      cardBg: '#18181B',
      badgeBg: '#27272A',
      badgeText: '#FAFAFA',
    },
    typography: {
      headingFont: 'Manrope, sans-serif',
      bodyFont: 'Manrope, sans-serif',
      titleWeight: 'font-extrabold tracking-tight',
      headingStyle: 'normal',
    },
    layout: {
      profileStyle: 'dark',
      productCardStyle: 'midnight-dark',
      containerWidth: 'w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto',
      profileAlignment: 'center',
    },
    cards: {
      radius: 12,
      border: '1px solid #27272A',
      shadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
      bg: '#18181B',
      variant: 'modern',
    },
    buttons: {
      style: 'solid',
      radius: 8,
      textTransform: 'font-bold uppercase tracking-wider',
      iconArrow: true,
    },
    profile: {
      imageShape: 'circle',
      imageSize: 'w-28 h-28',
      badgeStyle: 'dark-border',
    },
    social: {
      style: 'outlined-dark',
    },
  },

  // THEME 5: Luxury
  'luxury': {
    id: 'luxury',
    name: 'Luxury',
    tagline: 'High-End Personal Brand',
    description: 'Rich dark slate background with warm gold accents, spacious cards, refined typography, and high-end elegance.',
    colorSwatches: ['#0B0F19', '#111827', '#D4AF37', '#F3F4F6'],
    colors: {
      background: '#0B0F19',
      surface: '#111827',
      text: '#F3F4F6',
      mutedText: '#9CA3AF',
      primaryColor: '#D4AF37',
      buttonColor: '#D4AF37',
      buttonText: '#000000',
      secondaryAccent: '#1F2937',
      border: '#1F2937',
      cardBg: '#111827',
      badgeBg: '#1F2937',
      badgeText: '#D4AF37',
    },
    typography: {
      headingFont: "'Playfair Display', Georgia, serif",
      bodyFont: 'Manrope, sans-serif',
      titleWeight: 'font-bold tracking-normal',
      headingStyle: 'normal',
    },
    layout: {
      profileStyle: 'luxury',
      productCardStyle: 'luxury-card',
      containerWidth: 'w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto',
      profileAlignment: 'center',
    },
    cards: {
      radius: 10,
      border: '1px solid #1F2937',
      shadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
      bg: '#111827',
      variant: 'premium',
    },
    buttons: {
      style: 'solid',
      radius: 8,
      textTransform: 'font-bold uppercase tracking-wider',
      iconArrow: true,
    },
    profile: {
      imageShape: 'circle',
      imageSize: 'w-28 h-28',
      badgeStyle: 'gold-tag',
    },
    social: {
      style: 'editorial-ring',
    },
  },
}

// Backward compatibility alias map for legacy theme IDs
export const LEGACY_THEME_ALIASES = {
  'creator-classic': 'creator',
  'creator-hero': 'creator',
  'slate-pro': 'dark',
  'midnight': 'dark',
  'midnight-dark': 'dark',
  'neon-dark': 'dark',
  'paper-minimal': 'minimal',
  'minimal-mono': 'minimal',
  'mono-grid': 'minimal',
  'midnight-gold': 'luxury',
  'luxury-gold': 'luxury',
  'ivory-rose': 'editorial',
  'editorial-overlay': 'editorial',
  'electric': 'creator',
  'bold-brand': 'creator',
  'ocean-calm': 'luxury',
  'soft-studio': 'editorial',
  'warm-personal': 'luxury',
  'playful-pop': 'creator',
  'glass-morphism': 'dark',
  'executive': 'luxury',
}

/**
 * Resolves full design system tokens and layout controls by combining Layout Presets + Theme Style Presets + Overrides.
 * Safe Migration: Automatically maps any legacy/unknown theme ID to valid presets.
 * @param {Object} storeTheme - The theme object stored in store.theme
 */
export function getThemeTokens(storeTheme = {}) {
  let rawPresetId = storeTheme.presetId || storeTheme.id || storeTheme.themeId || storeTheme.name || 'creator'
  let cleanId = String(rawPresetId).toLowerCase().trim().replace(/_theme$/, '').replace(/-theme$/, '')
  if (LEGACY_THEME_ALIASES[cleanId]) {
    cleanId = LEGACY_THEME_ALIASES[cleanId]
  }
  const presetId = STORE_PRESETS[cleanId] ? cleanId : 'creator'
  const preset = STORE_PRESETS[presetId]

  const presetDefaultLayout = preset.layout?.defaultLayoutPreset ||
    (preset.layout?.profileStyle === 'hero-overlay' ? 'full-hero' :
      preset.layout?.profileStyle === 'editorial' ? 'editorial-overlay' :
        preset.layout?.profileStyle === 'warm-header' ? 'creator-canvas' :
          preset.layout?.profileStyle === 'fitness-header' ? 'full-hero' : 'classic')

  const rawLayoutPreset = storeTheme.layoutPreset || presetDefaultLayout || (storeTheme.hero?.enabled ? 'full-hero' : 'classic')
  const layoutPreset = STORE_LAYOUTS[rawLayoutPreset] ? rawLayoutPreset : 'classic'
  const layoutInfo = STORE_LAYOUTS[layoutPreset]

  const heroSettings = {
    enabled: layoutInfo.isHeroLayout || !!storeTheme.hero?.enabled,
    position: storeTheme.hero?.position || 'center',
    height: storeTheme.hero?.height || 'large',
    overlay: storeTheme.hero?.overlay !== undefined ? storeTheme.hero.overlay : true,
    overlayStrength: storeTheme.hero?.overlayStrength !== undefined ? Number(storeTheme.hero.overlayStrength) : 60,
    overlapDepth: storeTheme.hero?.overlapDepth || layoutInfo.defaultOverlap || 'medium',
  }

  // If a presetId is explicitly set, use preset defaults as baseline unless explicitly customized
  const wallpaper = {
    bgType: storeTheme.bgType || 'solid',
    gradientStart: storeTheme.gradientStart || storeTheme.background || preset.colors.background,
    gradientEnd: storeTheme.gradientEnd || '#121212',
    gradientDirection: storeTheme.gradientDirection || 'to bottom',
    gradientStops: Array.isArray(storeTheme.gradientStops) && storeTheme.gradientStops.length >= 2
      ? storeTheme.gradientStops
      : null,
    backgroundImage: storeTheme.backgroundImage || '',
    backgroundVideo: storeTheme.backgroundVideo || '',
    backgroundFit: storeTheme.backgroundFit || 'cover',
    backgroundPosition: storeTheme.backgroundPosition || 'center',
    backgroundOverlay: storeTheme.backgroundOverlay !== undefined ? Number(storeTheme.backgroundOverlay) : 0.4,
    pattern: storeTheme.wallpaperPattern || null,
    overlay: storeTheme.wallpaperOverlay || null,
    accent: storeTheme.wallpaperAccent || null,
  }

  const colors = {
    ...preset.colors,
    background: storeTheme.background || preset.colors.background,
    surface: storeTheme.cardBg || storeTheme.surface || preset.colors.surface,
    cardBg: storeTheme.cardBg || preset.colors.cardBg,
    text: storeTheme.textColor || storeTheme.text || preset.colors.text,
    mutedText: storeTheme.secondaryTextColor || storeTheme.mutedText || preset.colors.mutedText,
    primaryColor: storeTheme.primaryColor || preset.colors.primaryColor,
    buttonColor: storeTheme.buttonColor || storeTheme.primaryColor || preset.colors.buttonColor,
    buttonText: storeTheme.buttonTextColor || storeTheme.buttonText || preset.colors.buttonText,
    buttonBorder: storeTheme.buttonBorderColor || storeTheme.border || preset.colors.border,
    border: storeTheme.border || preset.colors.border,
    title: storeTheme.titleColor || storeTheme.textColor || storeTheme.text || preset.colors.text,
  }

  const pageFontFamily = resolveFontFamily(storeTheme.font || 'Manrope')
  const titleFontFamily = storeTheme.altTitleFont && storeTheme.titleFont
    ? resolveFontFamily(storeTheme.titleFont)
    : pageFontFamily

  const typography = {
    ...preset.typography,
    headingFont: storeTheme.font || storeTheme.titleFont ? titleFontFamily : preset.typography.headingFont,
    bodyFont: storeTheme.font ? pageFontFamily : preset.typography.bodyFont,
    fontFamily: storeTheme.font || 'Manrope',
    headingSize: storeTheme.headingSize || 'md',
    headingWeight: storeTheme.headingWeight || preset.typography.titleWeight || 'font-bold',
    bodySize: storeTheme.bodySize || 'md',
    bodyWeight: storeTheme.bodyWeight || 'font-normal',
  }

  const cards = {
    ...preset.cards,
    bg: storeTheme.cardBg || preset.cards?.bg || preset.colors.cardBg,
    border: storeTheme.border || preset.cards?.border || preset.colors.border,
    radius: storeTheme.cardRadius !== undefined ? Number(storeTheme.cardRadius) : preset.cards.radius,
    style: storeTheme.cardStyle || preset.cards.variant || 'modern',
  }

  const buttons = {
    ...preset.buttons,
    style: storeTheme.buttonStyle || preset.buttons.style || 'filled',
    shape: storeTheme.buttonShape || (storeTheme.buttonRadius === 9999 ? 'pill' : storeTheme.buttonRadius === 0 ? 'square' : 'rounded'),
    radius: storeTheme.buttonRadius !== undefined ? Number(storeTheme.buttonRadius) : preset.buttons.radius,
    color: storeTheme.buttonColor || preset.colors.buttonColor,
    textColor: storeTheme.buttonTextColor || preset.colors.buttonText,
    borderColor: storeTheme.buttonBorderColor || preset.colors.border,
    shadow: storeTheme.buttonShadow || 'soft',
    shadowColor: storeTheme.buttonShadowColor || null,
  }

  const header = {
    layout: storeTheme.headerLayout === 'immersive' ? 'immersive' : storeTheme.headerLayout === 'hero' ? 'hero' : 'classic',
    title: storeTheme.headerTitle !== undefined && storeTheme.headerTitle !== null ? storeTheme.headerTitle : null,
    bio: storeTheme.headerBio !== undefined ? storeTheme.headerBio : null,
    titleStyle: storeTheme.titleStyle || 'text',
    logoUrl: storeTheme.headerLogoUrl || '',
    avatarUrl: storeTheme.avatarUrl || '',
    avatarSize: storeTheme.avatarSize || 'md',
    showUsername: storeTheme.showUsername !== undefined ? storeTheme.showUsername : true,
    showBio: storeTheme.showBio !== undefined ? storeTheme.showBio : true,
    showSocials: storeTheme.showSocials !== undefined ? storeTheme.showSocials : true,
    showAvatar: storeTheme.showAvatar !== undefined ? storeTheme.showAvatar : true,
  }

  const footer = {
    showBranding: storeTheme.showFooterBranding !== undefined ? storeTheme.showFooterBranding : true,
    showSocials: storeTheme.showFooterSocials !== undefined ? storeTheme.showFooterSocials : true,
  }

  const isGalleryPreset = storeTheme.galleryThemeId && storeTheme.galleryThemeId !== 'custom'
  const rawThemeMode = storeTheme.themeMode
  const themeMode = rawThemeMode || (isGalleryPreset ? 'preset' : (storeTheme.cardBg ? 'manual' : 'adaptive'))

  const adaptivePalette = generateAdaptivePalette({
    buttonColor: buttons.color || colors.buttonColor || colors.primaryColor,
    pageBg: colors.background,
    themeMode,
    buttonStyle: buttons.style || 'filled',
    manualOverrides: {
      cardBg: storeTheme.cardBg,
      cardBgOverride: storeTheme.cardBgOverride,
      cardTextColor: storeTheme.cardTextColor,
      cardMutedTextColor: storeTheme.cardMutedTextColor,
      textColor: storeTheme.textColor,
      titleColor: storeTheme.titleColor,
      buttonTextColor: storeTheme.buttonTextColor,
      secondaryTextColor: storeTheme.secondaryTextColor,
    },
  })

  // In adaptive mode, align cards and colors with the generated adaptive palette
  if (themeMode === 'adaptive' || !isGalleryPreset) {
    cards.bg = adaptivePalette.productCard.background
    colors.cardBg = adaptivePalette.productCard.background
    cards.border = adaptivePalette.borders.border
    cards.shadow = adaptivePalette.productCard.shadow
    if (adaptivePalette.tile.text && !storeTheme.buttonTextColor) {
      buttons.textColor = adaptivePalette.tile.text
      colors.buttonText = adaptivePalette.tile.text
    }
  }

  return applyAutoContrastTokens({
    presetId,
    name: preset.name,
    tagline: preset.tagline,
    layoutPreset,
    layoutInfo,
    hero: heroSettings,
    wallpaper,
    colors,
    typography,
    layout: preset.layout,
    cards,
    buttons,
    header,
    footer,
    profile: preset.profile,
    social: preset.social,
    galleryThemeId: storeTheme.galleryThemeId || null,
    themeMode,
    adaptivePalette,
  }, storeTheme)
}

export const STORE_TEMPLATES = [
  {
    id: 'digital-products',
    name: 'Digital Products',
    tagline: 'Best for Ebooks, Downloads & Guides',
    description: 'Hero creator profile followed by a featured product spotlight, product catalog grid, and social links.',
    sections: [
      { id: 'sec-profile-1', type: 'profile', hidden: false, props: {} },
      { id: 'sec-heading-1', type: 'heading', hidden: false, props: { text: 'Featured Digital Guide', align: 'center' } },
      { id: 'sec-product-1', type: 'product', hidden: false, props: {} },
      { id: 'sec-divider-1', type: 'divider', hidden: false, props: {} },
      { id: 'sec-heading-2', type: 'heading', hidden: false, props: { text: 'All Products & Resources', align: 'center' } },
      { id: 'sec-grid-1', type: 'product_grid', hidden: false, props: { source: 'all' } },
      { id: 'sec-social-1', type: 'social_links', hidden: false, props: {} },
    ]
  },
  {
    id: 'personal-brand',
    name: 'Personal Brand',
    tagline: 'Best for Influencers & Thought Leaders',
    description: 'Clean bio header, introduction text, action buttons, social links, and digital product grid.',
    sections: [
      { id: 'sec-profile-1', type: 'profile', hidden: false, props: {} },
      { id: 'sec-text-1', type: 'text', hidden: false, props: { text: 'Helping creators build, launch, and monetize digital products with ease.', align: 'center' } },
      { id: 'sec-social-1', type: 'social_links', hidden: false, props: {} },
      { id: 'sec-divider-1', type: 'divider', hidden: false, props: {} },
      { id: 'sec-heading-1', type: 'heading', hidden: false, props: { text: 'Popular Products & Downloads', align: 'center' } },
      { id: 'sec-grid-1', type: 'product_grid', hidden: false, props: { source: 'all' } },
    ]
  },
  {
    id: 'creator-spotlight',
    name: 'Creator Spotlight',
    tagline: 'High Conversion Product Launcher',
    description: 'Focus heavily on 1 main product with custom text, high contrast button, and minimal layout.',
    sections: [
      { id: 'sec-profile-1', type: 'profile', hidden: false, props: {} },
      { id: 'sec-product-1', type: 'product', hidden: false, props: {} },
      { id: 'sec-text-1', type: 'text', hidden: false, props: { text: 'Instant access sent to your email right after checkout.', align: 'center' } },
      { id: 'sec-social-1', type: 'social_links', hidden: false, props: {} },
    ]
  },
  {
    id: 'education',
    name: 'Education & Guides',
    tagline: 'Best for Teachers & Mentors',
    description: 'Profile banner, guide headings, full product grid, and clear CTA contact buttons.',
    sections: [
      { id: 'sec-profile-1', type: 'profile', hidden: false, props: {} },
      { id: 'sec-heading-1', type: 'heading', hidden: false, props: { text: 'Masterclasses & Guides', align: 'center' } },
      { id: 'sec-text-1', type: 'text', hidden: false, props: { text: 'Step-by-step frameworks to level up your skills.', align: 'center' } },
      { id: 'sec-grid-1', type: 'product_grid', hidden: false, props: { source: 'all' } },
      { id: 'sec-divider-1', type: 'divider', hidden: false, props: {} },
      { id: 'sec-social-1', type: 'social_links', hidden: false, props: {} },
    ]
  },
  {
    id: 'minimal',
    name: 'Minimal Link-in-Bio',
    tagline: 'Ultra Clean & Direct',
    description: 'Compact profile, clean product list, direct action buttons, and footer links.',
    sections: [
      { id: 'sec-profile-1', type: 'profile', hidden: false, props: {} },
      { id: 'sec-grid-1', type: 'product_grid', hidden: false, props: { source: 'all' } },
      { id: 'sec-social-1', type: 'social_links', hidden: false, props: {} },
    ]
  }
]
