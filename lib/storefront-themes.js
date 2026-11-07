/**
 * Public storefront gallery themes.
 * Styles creatorstore.store/{username} and storefront preview.
 * 
 * Provides an authoritative, typed configuration model for reference-inspired
 * themes (Sweat, Nourish, Vox, Encore, Grid, Groove, Haven, Lake, Mineral,
 * Rise, Tress, Twilight, Agate, Air, Astrid, Aura, Bliss, Blocks, Bloom, Breeze)
 * and legacy presets (CreatorStore, Chalk, Flare, Tide, Afterglow, Lattice).
 */

import { getThemeTokens } from './themePresets.js'
import { THEME_ARTWORK, getThemeArtwork } from './storefront-theme-artwork.js'

export const STOREFRONT_GALLERY_THEMES = [
  {
    id: 'custom',
    name: 'Custom',
    isDefault: true,
  },

  // 1. GRID
  {
    id: 'grid',
    name: 'Grid',
    description: 'Light background with a subtle grid and contrasting pill buttons',
    wallpaper: { style: 'pattern', value: '#F2F6ED', pattern: 'grid' },
    text: { pageFont: 'Manrope', pageTextColor: '#1A2116', titleColor: '#1A2116', altTitleFont: false },
    colors: {
      background: '#F2F6ED',
      buttons: '#FFFFFF',
      buttonShadows: 'rgba(26, 33, 22, 0.12)',
      buttonText: '#1A2116',
      buttonBorder: '#1A2116',
      pageText: '#1A2116',
      title: '#1A2116',
      secondaryText: 'rgba(26, 33, 22, 0.72)',
      cardBg: '#FFFFFF',
      cardBorder: '#DCE4D3',
      cardText: '#1A2116',
      cardMutedText: 'rgba(26, 33, 22, 0.60)',
      accent: '#2D3B23',
      divider: '#DCE4D3',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1.5, borderColor: '#1A2116', color: '#FFFFFF', textColor: '#1A2116' },
    card: { radius: 18, borderWidth: 1, borderColor: '#DCE4D3', bg: '#FFFFFF', textColor: '#1A2116' },
  },

  // 2. GROOVE
  {
    id: 'groove',
    name: 'Groove',
    description: 'Expressive retro colors and bold contrast',
    wallpaper: { style: 'gradient', stops: ['#281E48', '#B83256', '#EA6D35', '#245C78'], angle: 145 },
    text: { pageFont: 'Manrope', pageTextColor: '#FFFFFF', titleColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#281E48',
      buttons: '#EA6D35',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#100620',
      buttonBorder: 'rgba(255, 255, 255, 0.35)',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.80)',
      cardBg: '#1D1135',
      cardBorder: 'rgba(255, 255, 255, 0.16)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.60)',
      accent: '#EA6D35',
      divider: 'rgba(255, 255, 255, 0.16)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)', color: '#EA6D35', textColor: '#100620' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', bg: '#1D1135', textColor: '#FFFFFF' },
  },

  // 3. HAVEN
  {
    id: 'haven',
    name: 'Haven',
    description: 'Warm neutral surfaces and understated borders',
    wallpaper: { style: 'gradient', stops: ['#3A322C', '#61554B 35%', '#EDE7DE 35%', '#F5F1EB'], angle: 180 },
    text: { pageFont: 'Manrope', pageTextColor: '#241F1B', titleColor: '#241F1B', altTitleFont: false },
    colors: {
      background: '#EDE7DE',
      buttons: '#DED5C7',
      buttonShadows: 'rgba(36, 31, 27, 0.08)',
      buttonText: '#241F1B',
      buttonBorder: '#C9BEAF',
      pageText: '#241F1B',
      title: '#241F1B',
      secondaryText: 'rgba(36, 31, 27, 0.74)',
      cardBg: '#FAF6F0',
      cardBorder: '#E2D9CC',
      cardText: '#241F1B',
      cardMutedText: 'rgba(36, 31, 27, 0.58)',
      accent: '#705E4F',
      divider: '#E2D9CC',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#C9BEAF', color: '#DED5C7', textColor: '#241F1B' },
    card: { radius: 18, borderWidth: 1, borderColor: '#E2D9CC', bg: '#FAF6F0', textColor: '#241F1B' },
  },

  // 4. LAKE
  {
    id: 'lake',
    name: 'Lake',
    description: 'Deep navy and near-black surfaces',
    wallpaper: { style: 'gradient', stops: ['#0A0F1D', '#121D33', '#1A2A47'], angle: 180 },
    text: { pageFont: 'Manrope', pageTextColor: '#F0F5FA', titleColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#0D1424',
      buttons: '#243A61',
      buttonShadows: 'rgba(0, 0, 0, 0.45)',
      buttonText: '#FFFFFF',
      buttonBorder: '#365182',
      pageText: '#F0F5FA',
      title: '#FFFFFF',
      secondaryText: 'rgba(240, 245, 250, 0.76)',
      cardBg: '#121D33',
      cardBorder: '#1E2F4F',
      cardText: '#F0F5FA',
      cardMutedText: 'rgba(240, 245, 250, 0.56)',
      accent: '#4B77BE',
      divider: '#1E2F4F',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#365182', color: '#243A61', textColor: '#FFFFFF' },
    card: { radius: 18, borderWidth: 1, borderColor: '#1E2F4F', bg: '#121D33', textColor: '#F0F5FA' },
  },

  // 5. MINERAL
  {
    id: 'mineral',
    name: 'Mineral',
    description: 'Soft cream and muted neutral tones',
    wallpaper: { style: 'fill', value: '#FAF5ED' },
    text: { pageFont: 'Manrope', pageTextColor: '#24201C', titleColor: '#24201C', altTitleFont: false },
    colors: {
      background: '#FAF5ED',
      buttons: '#EDE3D2',
      buttonShadows: 'rgba(36, 32, 28, 0.08)',
      buttonText: '#24201C',
      buttonBorder: '#D8CBB6',
      pageText: '#24201C',
      title: '#24201C',
      secondaryText: 'rgba(36, 32, 28, 0.74)',
      cardBg: '#FFFFFF',
      cardBorder: '#E8DDCF',
      cardText: '#24201C',
      cardMutedText: 'rgba(36, 32, 28, 0.58)',
      accent: '#8A7B6D',
      divider: '#E8DDCF',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#D8CBB6', color: '#EDE3D2', textColor: '#24201C' },
    card: { radius: 18, borderWidth: 1, borderColor: '#E8DDCF', bg: '#FFFFFF', textColor: '#24201C' },
  },

  // 6. NOURISH (Featured in Screenshot 2)
  {
    id: 'nourish',
    name: 'Nourish',
    description: 'Olive green with lime accents and citrus header',
    wallpaper: { style: 'fill', value: '#586737' },
    header: { treatment: 'photo-nourish', photoUrl: THEME_ARTWORK.nourish.svgDataUri },
    text: { pageFont: 'Manrope', pageTextColor: '#F5F9E6', titleColor: '#DCE976', altTitleFont: false },
    colors: {
      background: '#586737',
      buttons: '#CCD862',
      buttonShadows: 'rgba(0, 0, 0, 0.28)',
      buttonText: '#1E270A',
      buttonBorder: 'transparent',
      pageText: '#F5F9E6',
      title: '#DCE976',
      secondaryText: 'rgba(245, 249, 230, 0.78)',
      cardBg: '#465328',
      cardBorder: 'rgba(204, 216, 98, 0.22)',
      cardText: '#F5F9E6',
      cardMutedText: 'rgba(245, 249, 230, 0.60)',
      accent: '#CCD862',
      divider: 'rgba(204, 216, 98, 0.20)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#CCD862', textColor: '#1E270A' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(204, 216, 98, 0.22)', bg: '#465328', textColor: '#F5F9E6' },
  },

  // 7. RISE
  {
    id: 'rise',
    name: 'Rise',
    description: 'Warm, energetic sunrise colors',
    wallpaper: { style: 'gradient', stops: ['#D94532', '#EB6838', '#F5A245'], angle: 140 },
    text: { pageFont: 'Manrope', pageTextColor: '#FFFFFF', titleColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#D94532',
      buttons: '#FFFFFF',
      buttonShadows: 'rgba(0, 0, 0, 0.30)',
      buttonText: '#661910',
      buttonBorder: 'rgba(255, 255, 255, 0.75)',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.80)',
      cardBg: '#661910',
      cardBorder: 'rgba(255, 255, 255, 0.18)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.60)',
      accent: '#F5A245',
      divider: 'rgba(255, 255, 255, 0.18)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.75)', color: '#FFFFFF', textColor: '#661910' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.18)', bg: '#661910', textColor: '#FFFFFF' },
  },

  // 8. SWEAT (Featured in Screenshot 1)
  {
    id: 'sweat',
    name: 'Sweat',
    description: 'Blue tones and photographic athletic header styling',
    wallpaper: { style: 'gradient', stops: ['#1751D9', '#0E369E'], angle: 180 },
    header: { treatment: 'photo-sweat', photoUrl: THEME_ARTWORK.sweat.svgDataUri },
    text: { pageFont: 'Manrope', pageTextColor: '#FFFFFF', titleColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#154CD1',
      buttons: '#255CE0',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#FFFFFF',
      buttonBorder: 'rgba(255, 255, 255, 0.25)',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.80)',
      cardBg: '#0D2D82',
      cardBorder: 'rgba(255, 255, 255, 0.16)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.60)',
      accent: '#578EFA',
      divider: 'rgba(255, 255, 255, 0.16)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)', color: '#255CE0', textColor: '#FFFFFF' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', bg: '#0D2D82', textColor: '#FFFFFF' },
  },

  // 9. TRESS
  {
    id: 'tress',
    name: 'Tress',
    description: 'Dark botanical colors and warm neutral surfaces',
    wallpaper: { style: 'gradient', stops: ['#1E261B', '#2A3625'], angle: 180 },
    header: { treatment: 'photo-tress', photoUrl: THEME_ARTWORK.tress.svgDataUri },
    text: { pageFont: 'Manrope', pageTextColor: '#EDE7DD', titleColor: '#EDE7DD', altTitleFont: false },
    colors: {
      background: '#1E261B',
      buttons: '#C7BBA5',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#1E261B',
      buttonBorder: 'transparent',
      pageText: '#EDE7DD',
      title: '#EDE7DD',
      secondaryText: 'rgba(237, 231, 221, 0.76)',
      cardBg: '#2A3526',
      cardBorder: 'rgba(237, 231, 221, 0.14)',
      cardText: '#EDE7DD',
      cardMutedText: 'rgba(237, 231, 221, 0.58)',
      accent: '#C7BBA5',
      divider: 'rgba(237, 231, 221, 0.14)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#C7BBA5', textColor: '#1E261B' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(237, 231, 221, 0.14)', bg: '#2A3526', textColor: '#EDE7DD' },
  },

  // 10. TWILIGHT (Pro)
  {
    id: 'twilight',
    name: 'Twilight',
    description: 'Deep purple with soft pink accents',
    wallpaper: { style: 'gradient', stops: ['#351852', '#693278', '#99528E'], angle: 145 },
    text: { pageFont: 'Manrope', pageTextColor: '#FAF0F8', titleColor: '#FAF0F8', altTitleFont: false },
    colors: {
      background: '#351852',
      buttons: '#E2A8D8',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#240B38',
      buttonBorder: 'transparent',
      pageText: '#FAF0F8',
      title: '#FAF0F8',
      secondaryText: 'rgba(250, 240, 248, 0.78)',
      cardBg: '#260F3D',
      cardBorder: 'rgba(226, 168, 216, 0.22)',
      cardText: '#FAF0F8',
      cardMutedText: 'rgba(250, 240, 248, 0.60)',
      accent: '#E2A8D8',
      divider: 'rgba(226, 168, 216, 0.20)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#E2A8D8', textColor: '#240B38' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(226, 168, 216, 0.22)', bg: '#260F3D', textColor: '#FAF0F8' },
    pro: true,
  },

  // 11. VOX (Featured in Screenshot 3)
  {
    id: 'vox',
    name: 'Vox',
    description: 'Bold red with warm, high-contrast typography and on-air neon',
    wallpaper: { style: 'gradient', stops: ['#BA1410', '#8F0B08'], angle: 180 },
    header: { treatment: 'photo-vox', photoUrl: THEME_ARTWORK.vox.svgDataUri },
    text: { pageFont: 'Manrope', pageTextColor: '#FFFFFF', titleColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#A8110D',
      buttons: '#FFFFFF',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#5E0906',
      buttonBorder: 'rgba(255, 255, 255, 0.30)',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.80)',
      cardBg: '#5E0906',
      cardBorder: 'rgba(255, 255, 255, 0.16)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.60)',
      accent: '#FF5C54',
      divider: 'rgba(255, 255, 255, 0.16)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.30)', color: '#FFFFFF', textColor: '#5E0906' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', bg: '#5E0906', textColor: '#FFFFFF' },
  },

  // 12. AGATE
  {
    id: 'agate',
    name: 'Agate',
    description: 'Teal/green mineral imagery with bright accent buttons',
    wallpaper: { style: 'gradient', stops: ['#0B3E39', '#12635B', '#1E857B'], angle: 135 },
    text: { pageFont: 'Manrope', pageTextColor: '#E6FAF7', titleColor: '#E6FAF7', altTitleFont: false },
    colors: {
      background: '#0B3E39',
      buttons: '#32D4B2',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#041F1C',
      buttonBorder: 'transparent',
      pageText: '#E6FAF7',
      title: '#E6FAF7',
      secondaryText: 'rgba(230, 250, 247, 0.78)',
      cardBg: '#072A26',
      cardBorder: 'rgba(50, 212, 178, 0.25)',
      cardText: '#E6FAF7',
      cardMutedText: 'rgba(230, 250, 247, 0.60)',
      accent: '#32D4B2',
      divider: 'rgba(50, 212, 178, 0.20)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#32D4B2', textColor: '#041F1C' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(50, 212, 178, 0.25)', bg: '#072A26', textColor: '#E6FAF7' },
  },

  // 13. AIR
  {
    id: 'air',
    name: 'Air',
    description: 'Minimal, bright, spacious styling',
    wallpaper: { style: 'fill', value: '#FAFAFA' },
    text: { pageFont: 'Manrope', pageTextColor: '#0F172A', titleColor: '#0F172A', altTitleFont: false },
    colors: {
      background: '#FAFAFA',
      buttons: '#0F172A',
      buttonShadows: 'rgba(15, 23, 42, 0.08)',
      buttonText: '#FFFFFF',
      buttonBorder: '#0F172A',
      pageText: '#0F172A',
      title: '#0F172A',
      secondaryText: 'rgba(15, 23, 42, 0.74)',
      cardBg: '#FFFFFF',
      cardBorder: '#E2E8F0',
      cardText: '#0F172A',
      cardMutedText: 'rgba(15, 23, 42, 0.58)',
      accent: '#2563EB',
      divider: '#E2E8F0',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#0F172A', color: '#0F172A', textColor: '#FFFFFF' },
    card: { radius: 18, borderWidth: 1, borderColor: '#E2E8F0', bg: '#FFFFFF', textColor: '#0F172A' },
  },

  // 14. ASTRID (Pro)
  {
    id: 'astrid',
    name: 'Astrid',
    description: 'Dark cinematic surfaces with starlight bokeh',
    wallpaper: { style: 'gradient', stops: ['#0C0F17', '#141A26', '#1D2536'], angle: 180 },
    text: { pageFont: 'Manrope', pageTextColor: '#EBF0F7', titleColor: '#EBF0F7', altTitleFont: false },
    colors: {
      background: '#0C0F17',
      buttons: '#253047',
      buttonShadows: 'rgba(0, 0, 0, 0.45)',
      buttonText: '#FFFFFF',
      buttonBorder: 'rgba(255, 255, 255, 0.25)',
      pageText: '#EBF0F7',
      title: '#EBF0F7',
      secondaryText: 'rgba(235, 240, 247, 0.76)',
      cardBg: '#141A26',
      cardBorder: 'rgba(255, 255, 255, 0.12)',
      cardText: '#EBF0F7',
      cardMutedText: 'rgba(235, 240, 247, 0.58)',
      accent: '#88C0D0',
      divider: 'rgba(255, 255, 255, 0.12)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)', color: '#253047', textColor: '#FFFFFF' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)', bg: '#141A26', textColor: '#EBF0F7' },
    pro: true,
  },

  // 15. AURA
  {
    id: 'aura',
    name: 'Aura',
    description: 'Soft neutral porcelain and warm earth tones',
    wallpaper: { style: 'fill', value: '#EFEBE4' },
    text: { pageFont: 'Manrope', pageTextColor: '#29241E', titleColor: '#29241E', altTitleFont: false },
    colors: {
      background: '#EFEBE4',
      buttons: '#DFD7CB',
      buttonShadows: 'rgba(41, 36, 30, 0.08)',
      buttonText: '#29241E',
      buttonBorder: '#CFC5B5',
      pageText: '#29241E',
      title: '#29241E',
      secondaryText: 'rgba(41, 36, 30, 0.74)',
      cardBg: '#FAF7F2',
      cardBorder: '#E5DED2',
      cardText: '#29241E',
      cardMutedText: 'rgba(41, 36, 30, 0.58)',
      accent: '#8F7A65',
      divider: '#E5DED2',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#CFC5B5', color: '#DFD7CB', textColor: '#29241E' },
    card: { radius: 18, borderWidth: 1, borderColor: '#E5DED2', bg: '#FAF7F2', textColor: '#29241E' },
  },

  // 16. BLISS
  {
    id: 'bliss',
    name: 'Bliss',
    description: 'Monochrome, understated surfaces and editorial elegance',
    wallpaper: { style: 'fill', value: '#F4F4F4' },
    header: { treatment: 'photo-bliss', photoUrl: THEME_ARTWORK.bliss.svgDataUri },
    text: { pageFont: 'Manrope', pageTextColor: '#111111', titleColor: '#111111', altTitleFont: false },
    colors: {
      background: '#F4F4F4',
      buttons: '#111111',
      buttonShadows: 'rgba(0, 0, 0, 0.12)',
      buttonText: '#FFFFFF',
      buttonBorder: '#111111',
      pageText: '#111111',
      title: '#111111',
      secondaryText: 'rgba(17, 17, 17, 0.72)',
      cardBg: '#FFFFFF',
      cardBorder: '#E5E5E5',
      cardText: '#111111',
      cardMutedText: 'rgba(17, 17, 17, 0.58)',
      accent: '#111111',
      divider: '#E5E5E5',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#111111', color: '#111111', textColor: '#FFFFFF' },
    card: { radius: 18, borderWidth: 1, borderColor: '#E5E5E5', bg: '#FFFFFF', textColor: '#111111' },
  },

  // 17. BLOCKS
  {
    id: 'blocks',
    name: 'Blocks',
    description: 'Strong geometric color blocks and bold magenta accents',
    wallpaper: { style: 'gradient', stops: ['#242163', '#352E84'], angle: 180 },
    text: { pageFont: 'Manrope', pageTextColor: '#FFFFFF', titleColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#242163',
      buttons: '#D93288',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#FFFFFF',
      buttonBorder: 'transparent',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.78)',
      cardBg: '#171447',
      cardBorder: 'rgba(217, 50, 136, 0.35)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.58)',
      accent: '#D93288',
      divider: 'rgba(217, 50, 136, 0.25)',
    },
    button: { style: 'filled', shape: 'rounded', radius: 12, borderWidth: 0, borderColor: 'transparent', color: '#D93288', textColor: '#FFFFFF' },
    card: { radius: 14, borderWidth: 1, borderColor: 'rgba(217, 50, 136, 0.35)', bg: '#171447', textColor: '#FFFFFF' },
  },

  // 18. BLOOM (Pro)
  {
    id: 'bloom',
    name: 'Bloom',
    description: 'Pink and purple accents with floral vibrancy',
    wallpaper: { style: 'gradient', stops: ['#731745', '#9B2C63', '#4E1B5A'], angle: 140 },
    text: { pageFont: 'Manrope', pageTextColor: '#FFF0F7', titleColor: '#FFF0F7', altTitleFont: false },
    colors: {
      background: '#731745',
      buttons: '#F5B0D4',
      buttonShadows: 'rgba(0, 0, 0, 0.35)',
      buttonText: '#38061F',
      buttonBorder: 'transparent',
      pageText: '#FFF0F7',
      title: '#FFF0F7',
      secondaryText: 'rgba(255, 240, 247, 0.78)',
      cardBg: '#4C0D2C',
      cardBorder: 'rgba(245, 176, 212, 0.22)',
      cardText: '#FFF0F7',
      cardMutedText: 'rgba(255, 240, 247, 0.60)',
      accent: '#F5B0D4',
      divider: 'rgba(245, 176, 212, 0.20)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#F5B0D4', textColor: '#38061F' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(245, 176, 212, 0.22)', bg: '#4C0D2C', textColor: '#FFF0F7' },
    pro: true,
  },

  // 19. BREEZE (Pro)
  {
    id: 'breeze',
    name: 'Breeze',
    description: 'Soft pastel styling and airy gradient atmosphere',
    wallpaper: { style: 'gradient', stops: ['#CBE0F8', '#E2D8F5', '#F5DCE8'], angle: 135 },
    text: { pageFont: 'Manrope', pageTextColor: '#192433', titleColor: '#192433', altTitleFont: false },
    colors: {
      background: '#D8E6F7',
      buttons: '#FFFFFF',
      buttonShadows: 'rgba(25, 36, 51, 0.08)',
      buttonText: '#192433',
      buttonBorder: 'rgba(25, 36, 51, 0.15)',
      pageText: '#192433',
      title: '#192433',
      secondaryText: 'rgba(25, 36, 51, 0.74)',
      cardBg: '#FFFFFF',
      cardBorder: 'rgba(25, 36, 51, 0.10)',
      cardText: '#192433',
      cardMutedText: 'rgba(25, 36, 51, 0.58)',
      accent: '#6D84C7',
      divider: 'rgba(25, 36, 51, 0.10)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: 'rgba(25, 36, 51, 0.15)', color: '#FFFFFF', textColor: '#192433' },
    card: { radius: 18, borderWidth: 1, borderColor: 'rgba(25, 36, 51, 0.10)', bg: '#FFFFFF', textColor: '#192433' },
    pro: true,
  },

  // 20. ENCORE (Featured in Screenshot 4)
  {
    id: 'encore',
    name: 'Encore',
    description: 'Near-black surfaces with warm, outlined cards and spotlight header',
    wallpaper: { style: 'fill', value: '#0B0B0E' },
    header: { treatment: 'photo-encore', photoUrl: THEME_ARTWORK.encore.svgDataUri },
    text: { pageFont: 'Manrope', pageTextColor: '#E89F78', titleColor: '#E89F78', altTitleFont: false },
    colors: {
      background: '#0B0B0E',
      buttons: '#1A171D',
      buttonShadows: 'rgba(0, 0, 0, 0.5)',
      buttonText: '#E89F78',
      buttonBorder: '#B2623B',
      pageText: '#E89F78',
      title: '#E89F78',
      secondaryText: 'rgba(232, 159, 120, 0.78)',
      cardBg: '#141419',
      cardBorder: '#6E3B22',
      cardText: '#E89F78',
      cardMutedText: 'rgba(232, 159, 120, 0.60)',
      accent: '#E89F78',
      divider: '#6E3B22',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1.5, borderColor: '#B2623B', color: '#1A171D', textColor: '#E89F78' },
    card: { radius: 18, borderWidth: 1.5, borderColor: '#6E3B22', bg: '#141419', textColor: '#E89F78' },
  },

  // --- LEGACY PRESETS (Maintained for 100% backward compatibility) ---
  {
    id: 'creatorstore',
    name: 'CreatorStore',
    description: 'Signature platform dark theme with electric blue accents',
    wallpaper: { style: 'fill', value: '#000000' },
    text: { pageFont: 'Manrope', pageTextColor: '#F4F2EC', altTitleFont: false },
    colors: {
      background: '#000000',
      buttons: '#4D7CFF',
      buttonShadows: '#12141c',
      buttonText: '#000000',
      buttonBorder: 'transparent',
      pageText: '#F4F2EC',
      title: '#F4F2EC',
      secondaryText: 'rgba(244, 242, 236, 0.75)',
      cardBg: '#12141C',
      cardBorder: 'rgba(244, 242, 236, 0.12)',
      cardText: '#F4F2EC',
      cardMutedText: 'rgba(244, 242, 236, 0.55)',
      accent: '#4D7CFF',
      divider: 'rgba(244, 242, 236, 0.12)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#4D7CFF', textColor: '#000000' },
    card: { radius: 16, borderWidth: 1, borderColor: 'rgba(244, 242, 236, 0.12)', bg: '#12141C', textColor: '#F4F2EC' },
  },
  {
    id: 'chalk',
    name: 'Chalk',
    description: 'Soft cream with charcoal text and buttons',
    wallpaper: { style: 'fill', value: '#F3E9DC' },
    text: { pageFont: 'Manrope', pageTextColor: '#1A1A1A', altTitleFont: false },
    colors: {
      background: '#F3E9DC',
      buttons: '#F3E9DC',
      buttonShadows: '#1A1A1A',
      buttonText: '#1A1A1A',
      buttonBorder: '#1A1A1A',
      pageText: '#1A1A1A',
      title: '#1A1A1A',
      secondaryText: 'rgba(26, 26, 26, 0.74)',
      cardBg: '#FAF6F0',
      cardBorder: 'rgba(26, 26, 26, 0.14)',
      cardText: '#1A1A1A',
      cardMutedText: 'rgba(26, 26, 26, 0.52)',
      accent: '#1A1A1A',
      divider: 'rgba(26, 26, 26, 0.14)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 1, borderColor: '#1A1A1A', color: '#F3E9DC', textColor: '#1A1A1A' },
    card: { radius: 16, borderWidth: 1, borderColor: 'rgba(26, 26, 26, 0.14)', bg: '#FAF6F0', textColor: '#1A1A1A' },
  },
  {
    id: 'flare',
    name: 'Flare',
    description: 'Vibrant sunset violet to orange gradient',
    wallpaper: { style: 'gradient', stops: ['#6B4FBB', '#E0459E', '#F0441E'], angle: 135 },
    text: { pageFont: 'Manrope', pageTextColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#6B4FBB',
      buttons: '#FFFFFF',
      buttonShadows: '#1A1A1A',
      buttonText: '#1A1A1A',
      buttonBorder: 'transparent',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.78)',
      cardBg: '#2A164D',
      cardBorder: 'rgba(255, 255, 255, 0.14)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.58)',
      accent: '#F0441E',
      divider: 'rgba(255, 255, 255, 0.14)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#FFFFFF', textColor: '#1A1A1A' },
    card: { radius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)', bg: '#2A164D', textColor: '#FFFFFF' },
  },
  {
    id: 'tide',
    name: 'Tide',
    description: 'Deep ocean blues with luminous accents',
    wallpaper: { style: 'gradient', stops: ['#3B6FE0', '#2A4FA8'], angle: 160, accent: 'tide' },
    text: { pageFont: 'Link Sans', pageTextColor: '#FFFFFF', altTitleFont: false },
    colors: {
      background: '#3B6FE0',
      buttons: '#5B8CFF',
      buttonShadows: '#000000',
      buttonText: '#FFFFFF',
      buttonBorder: 'transparent',
      pageText: '#FFFFFF',
      title: '#FFFFFF',
      secondaryText: 'rgba(255, 255, 255, 0.78)',
      cardBg: '#1B3266',
      cardBorder: 'rgba(255, 255, 255, 0.14)',
      cardText: '#FFFFFF',
      cardMutedText: 'rgba(255, 255, 255, 0.58)',
      accent: '#5B8CFF',
      divider: 'rgba(255, 255, 255, 0.14)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#5B8CFF', textColor: '#FFFFFF' },
    card: { radius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)', bg: '#1B3266', textColor: '#FFFFFF' },
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    description: 'Warm obsidian with amber spotlight radiance',
    wallpaper: { style: 'fill', value: '#1A140F', overlay: 'spotlight' },
    text: { pageFont: 'Manrope', pageTextColor: '#F5E6D3', altTitleFont: false },
    colors: {
      background: '#1A140F',
      buttons: '#2C241C',
      buttonShadows: '#000000',
      buttonText: '#F5E6D3',
      buttonBorder: 'transparent',
      pageText: '#F5E6D3',
      title: '#F5E6D3',
      secondaryText: 'rgba(245, 230, 211, 0.75)',
      cardBg: '#282019',
      cardBorder: 'rgba(245, 230, 211, 0.12)',
      cardText: '#F5E6D3',
      cardMutedText: 'rgba(245, 230, 211, 0.55)',
      accent: '#C47A3A',
      divider: 'rgba(245, 230, 211, 0.12)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#2C241C', textColor: '#F5E6D3' },
    card: { radius: 16, borderWidth: 1, borderColor: 'rgba(245, 230, 211, 0.12)', bg: '#282019', textColor: '#F5E6D3' },
  },
  {
    id: 'lattice',
    name: 'Lattice',
    description: 'Crisp sage grid pattern with clean white pills',
    wallpaper: { style: 'pattern', value: '#E7F0C4', pattern: 'grid' },
    text: { pageFont: 'Manrope', pageTextColor: '#1A1A1A', altTitleFont: false },
    colors: {
      background: '#E7F0C4',
      buttons: '#FFFFFF',
      buttonShadows: '#1A1A1A',
      buttonText: '#1A1A1A',
      buttonBorder: 'transparent',
      pageText: '#1A1A1A',
      title: '#1A1A1A',
      secondaryText: 'rgba(26, 26, 26, 0.74)',
      cardBg: '#F4F8DE',
      cardBorder: 'rgba(26, 26, 26, 0.14)',
      cardText: '#1A1A1A',
      cardMutedText: 'rgba(26, 26, 26, 0.52)',
      accent: '#1A1A1A',
      divider: 'rgba(26, 26, 26, 0.14)',
    },
    button: { style: 'filled', shape: 'pill', radius: 9999, borderWidth: 0, borderColor: 'transparent', color: '#FFFFFF', textColor: '#1A1A1A' },
    card: { radius: 16, borderWidth: 1, borderColor: 'rgba(26, 26, 26, 0.14)', bg: '#F4F8DE', textColor: '#1A1A1A' },
  },
]

export const WALLPAPER_PATTERNS = [
  { id: 'noise', label: 'Noise', pro: false },
  { id: 'grid', label: 'Grid', pro: false },
  { id: 'blobs', label: 'Blobs', pro: true },
  { id: 'dots', label: 'Dots', pro: true },
]

export function getGalleryThemeId(theme = {}) {
  const id = theme.galleryThemeId
  if (STOREFRONT_GALLERY_THEMES.some((t) => t.id === id)) return id
  return 'custom'
}

export function getGalleryTheme(id) {
  return STOREFRONT_GALLERY_THEMES.find((t) => t.id === id) || STOREFRONT_GALLERY_THEMES[0]
}

export function wallpaperStyleFromTheme(theme = {}) {
  const t = theme.bgType || 'solid'
  if (t === 'solid' || t === 'fill') return 'fill'
  return t
}

export function snapshotManualTheme(theme = {}) {
  const tokens = getThemeTokens(theme)
  return {
    bgType: theme.bgType || tokens.wallpaper.bgType,
    background: theme.background || tokens.colors.background,
    gradientStart: theme.gradientStart || tokens.wallpaper.gradientStart,
    gradientEnd: theme.gradientEnd || tokens.wallpaper.gradientEnd,
    gradientDirection: theme.gradientDirection || tokens.wallpaper.gradientDirection,
    gradientStops: theme.gradientStops || null,
    wallpaperPattern: theme.wallpaperPattern || null,
    wallpaperOverlay: theme.wallpaperOverlay || null,
    wallpaperAccent: theme.wallpaperAccent || null,
    backgroundImage: theme.backgroundImage || '',
    backgroundVideo: theme.backgroundVideo || '',
    buttonStyle: theme.buttonStyle || tokens.buttons.style,
    buttonShape: theme.buttonShape || tokens.buttons.shape,
    buttonRadius: theme.buttonRadius !== undefined ? theme.buttonRadius : tokens.buttons.radius,
    buttonColor: theme.buttonColor || tokens.buttons.color,
    buttonTextColor: theme.buttonTextColor || tokens.buttons.textColor,
    buttonBorderColor: theme.buttonBorderColor || tokens.buttons.borderColor,
    buttonShadowColor: theme.buttonShadowColor || null,
    textColor: theme.textColor || tokens.colors.text,
    secondaryTextColor: theme.secondaryTextColor || tokens.colors.mutedText,
    primaryColor: theme.primaryColor || tokens.colors.primaryColor,
    titleColor: theme.titleColor || null,
    font: theme.font || tokens.typography.fontFamily,
    titleFont: theme.titleFont || null,
    altTitleFont: !!theme.altTitleFont,
    cardBg: theme.cardBg || tokens.cards.bg,
    cardBorderColor: theme.cardBorderColor || null,
    cardTextColor: theme.cardTextColor || null,
    cardRadius: theme.cardRadius !== undefined ? theme.cardRadius : tokens.cards.radius,
  }
}

function cssBackground(preset) {
  const w = preset.wallpaper
  if (!w) return '#000000'
  if (w.style === 'gradient' && w.stops?.length) {
    return `linear-gradient(${w.angle ?? 135}deg, ${w.stops.join(', ')})`
  }
  if (w.overlay === 'spotlight') {
    return `radial-gradient(ellipse at 50% 0%, #C47A3A 0%, ${w.value || '#1A140F'} 62%)`
  }
  if (w.style === 'pattern' && w.pattern === 'grid') {
    return w.value || '#E7F0C4'
  }
  return w.value || preset.colors?.background || '#000000'
}

export function gallerySwatchStyle(preset) {
  if (!preset || preset.id === 'custom') return { background: 'transparent' }
  if (preset.wallpaper?.style === 'pattern' && preset.wallpaper.pattern === 'grid') {
    return {
      backgroundColor: preset.wallpaper.value || '#E7F0C4',
      backgroundImage: 'linear-gradient(to right, rgba(26,26,26,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,26,26,0.12) 1px, transparent 1px)',
      backgroundSize: '16px 16px',
    }
  }
  return { background: cssBackground(preset) }
}

export function patternPreviewStyle(patternId, color = '#E7F0C4') {
  const base = { backgroundColor: color }
  if (patternId === 'grid') {
    return {
      ...base,
      backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.14) 1px, transparent 1px)',
      backgroundSize: '12px 12px',
    }
  }
  if (patternId === 'dots') {
    return {
      ...base,
      backgroundImage: 'radial-gradient(rgba(0,0,0,0.2) 1px, transparent 1px)',
      backgroundSize: '10px 10px',
    }
  }
  if (patternId === 'blobs') {
    return {
      ...base,
      backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(0,0,0,0.12) 0 28%, transparent 30%), radial-gradient(circle at 70% 70%, rgba(0,0,0,0.1) 0 22%, transparent 24%)',
    }
  }
  return {
    ...base,
    backgroundImage: 'repeating-linear-gradient(120deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 3px)',
  }
}

export function themePatchFromGallery(preset, currentTheme = {}) {
  if (!preset || preset.id === 'custom') {
    if (getGalleryThemeId(currentTheme) === 'custom') {
      return { galleryThemeId: 'custom' }
    }
    const snap = currentTheme.galleryManualSnapshot || {}
    return {
      galleryThemeId: 'custom',
      ...snap,
      gradientStops: snap.gradientStops || null,
    }
  }

  const leavingCustom = getGalleryThemeId(currentTheme) === 'custom'
  const patch = { galleryThemeId: preset.id }
  if (leavingCustom) {
    patch.galleryManualSnapshot = snapshotManualTheme(currentTheme)
  }

  const colors = preset.colors || {}
  const text = preset.text || {}
  const w = preset.wallpaper || {}
  const header = preset.header || {}
  const card = preset.card || {}
  const button = preset.button || {}

  patch.textColor = text.pageTextColor || colors.pageText
  patch.titleColor = text.titleColor || colors.title || patch.textColor
  patch.secondaryTextColor = colors.secondaryText || (
    text.pageTextColor === '#FFFFFF' || colors.pageText === '#FFFFFF'
      ? 'rgba(255,255,255,0.78)'
      : 'rgba(0, 0, 0, 0.65)'
  )
  patch.font = text.pageFont || 'Manrope'
  patch.altTitleFont = !!text.altTitleFont
  patch.titleFont = text.titleFont || null

  patch.background = colors.background
  patch.buttonColor = colors.buttons
  patch.buttonTextColor = colors.buttonText
  patch.buttonShadowColor = colors.buttonShadows || null
  patch.primaryColor = colors.buttons
  patch.buttonStyle = button.style || 'filled'
  patch.buttonShape = button.shape || 'pill'
  patch.buttonRadius = button.radius !== undefined ? button.radius : (button.shape === 'pill' ? 9999 : 8)
  patch.buttonBorderColor = button.borderColor || colors.buttonBorder || 'transparent'

  // Card configuration
  patch.cardBg = card.bg || colors.cardBg
  patch.cardBorderColor = card.borderColor || colors.cardBorder || 'transparent'
  patch.cardTextColor = card.textColor || colors.cardText || patch.textColor
  patch.cardRadius = card.radius !== undefined ? card.radius : 18

  // Header treatment & photo assets
  patch.headerTreatment = header.treatment || null
  patch.headerImageUrl = header.photoUrl || null

  patch.wallpaperPattern = w.pattern || null
  patch.wallpaperOverlay = w.overlay || null
  patch.wallpaperAccent = w.accent || null

  if (w.style === 'gradient') {
    const stops = w.stops || []
    patch.bgType = 'gradient'
    patch.gradientStops = stops
    patch.gradientStart = stops[0]
    patch.gradientEnd = stops[stops.length - 1]
    patch.gradientDirection = `${w.angle ?? 135}deg`
  } else if (w.style === 'pattern') {
    patch.bgType = 'pattern'
    patch.gradientStops = null
  } else if (w.style === 'blur') {
    patch.bgType = 'blur'
    patch.gradientStops = null
  } else {
    patch.bgType = 'solid'
    patch.gradientStops = null
  }

  return patch
}

export function parseGradientAngle(direction) {
  if (!direction) return 180
  const deg = String(direction).match(/(-?\d+(?:\.\d+)?)deg/)
  if (deg) return Number(deg[1])
  const map = {
    'to right': 90,
    'to left': 270,
    'to bottom': 180,
    'to top': 0,
    'to bottom right': 135,
    'to bottom left': 225,
    'to top right': 45,
    'to top left': 315,
  }
  return map[direction] ?? 180
}
