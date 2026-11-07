/**
 * CreatorStore Storefront Theme Artwork & Photographic Header Assets
 * 
 * Provides crisp, high-performance inline SVG artwork and photographic representations
 * for reference-inspired themes (Sweat, Nourish, Vox, Encore, Tress, Bliss).
 * Works offline, in tests, in SSR, and on retina displays without network latency.
 */

export const THEME_ARTWORK = {
  sweat: {
    id: 'sweat',
    title: 'Sweat Neon Athletic Header',
    // SVG data URI for reliable display in <img> or CSS background
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="%231E58EB"/>
          <stop offset="60%" stop-color="%2310328E"/>
          <stop offset="100%" stop-color="%230A1F5C"/>
        </radialGradient>
        <radialGradient id="neonGlow" cx="65%" cy="35%" r="45%">
          <stop offset="0%" stop-color="%23E024C3" stop-opacity="0.85"/>
          <stop offset="40%" stop-color="%23A818B0" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="%231E58EB" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cyanRim" cx="35%" cy="40%" r="40%">
          <stop offset="0%" stop-color="%2306B6D4" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="%231E58EB" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%231751D9" stop-opacity="0"/>
          <stop offset="85%" stop-color="%231751D9" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="%231751D9" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(%23bgGrad)"/>
      <rect width="400" height="240" fill="url(%23neonGlow)"/>
      <rect width="400" height="240" fill="url(%23cyanRim)"/>
      <!-- Athletic torso / shoulder silhouette -->
      <path d="M120 240 C120 180 150 130 190 100 C205 90 220 85 240 85 C270 85 300 110 320 160 C335 195 340 220 345 240 Z" fill="%230B1736" opacity="0.95"/>
      <!-- Magenta neon specular rim highlight -->
      <path d="M225 87 C255 87 285 110 305 160 C318 190 324 220 328 240" stroke="%23F43F5E" stroke-width="5" fill="none" opacity="0.9" stroke-linecap="round" filter="drop-shadow(0 0 6px %23E11D48)"/>
      <path d="M185 105 C150 135 130 180 128 240" stroke="%2338BDF8" stroke-width="3.5" fill="none" opacity="0.8" stroke-linecap="round" filter="drop-shadow(0 0 5px %230EA5E9)"/>
      <!-- Specular droplets / sparkles -->
      <circle cx="245" cy="115" r="2.5" fill="%23FFFFFF" opacity="0.9"/>
      <circle cx="260" cy="135" r="2" fill="%23FDA4AF" opacity="0.85"/>
      <circle cx="230" cy="140" r="1.5" fill="%23FFFFFF" opacity="0.8"/>
      <circle cx="275" cy="165" r="2.5" fill="%2338BDF8" opacity="0.9"/>
      <rect width="400" height="240" fill="url(%23fadeBottom)"/>
    </svg>`,
  },

  nourish: {
    id: 'nourish',
    title: 'Nourish Citrus Header',
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
      <defs>
        <radialGradient id="nourishBg" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="%23687842"/>
          <stop offset="70%" stop-color="%23566535"/>
          <stop offset="100%" stop-color="%23435028"/>
        </radialGradient>
        <radialGradient id="bowlGrad" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stop-color="%23EFECE6"/>
          <stop offset="85%" stop-color="%23CFCAC0"/>
          <stop offset="100%" stop-color="%239D988E"/>
        </radialGradient>
        <linearGradient id="nourishFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%23586737" stop-opacity="0"/>
          <stop offset="85%" stop-color="%23586737" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="%23586737" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(%23nourishBg)"/>
      <!-- Ceramic Bowl Shadow -->
      <ellipse cx="200" cy="120" rx="92" ry="74" fill="%232D371A" opacity="0.45"/>
      <!-- Ceramic Bowl -->
      <ellipse cx="200" cy="115" rx="88" ry="70" fill="url(%23bowlGrad)" stroke="%23FAF7F0" stroke-width="2.5"/>
      <!-- Inner bowl surface -->
      <ellipse cx="200" cy="115" rx="78" ry="60" fill="%23D8D3C8"/>
      <!-- Sliced orange (bottom left) -->
      <circle cx="165" cy="118" r="24" fill="%23EA580C" stroke="%23FDBA74" stroke-width="2"/>
      <circle cx="165" cy="118" r="20" fill="%23FB923C"/>
      <circle cx="165" cy="118" r="6" fill="%23FFEDD5"/>
      <!-- Sliced lemon (center top) -->
      <circle cx="198" cy="98" r="22" fill="%23EAB308" stroke="%23FEF08A" stroke-width="2"/>
      <circle cx="198" cy="98" r="18" fill="%23FACC15"/>
      <circle cx="198" cy="98" r="5" fill="%23FEF9C3"/>
      <!-- Sliced lime (right) -->
      <circle cx="232" cy="116" r="20" fill="%2365A30D" stroke="%23BEF264" stroke-width="2"/>
      <circle cx="232" cy="116" r="16" fill="%2384CC16"/>
      <circle cx="232" cy="116" r="4.5" fill="%23ECFCCB"/>
      <!-- Half grapefruit / lemon wedge -->
      <path d="M175 138 A 18 18 0 0 0 215 138 Z" fill="%23F43F5E" stroke="%23FECDD3" stroke-width="1.5"/>
      <!-- Bowl rim highlight -->
      <ellipse cx="200" cy="113" rx="86" ry="67" fill="none" stroke="%23FFFFFF" stroke-width="1.5" opacity="0.6"/>
      <rect width="400" height="240" fill="url(%23nourishFade)"/>
    </svg>`,
  },

  vox: {
    id: 'vox',
    title: 'Vox On-Air Neon Header',
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
      <defs>
        <radialGradient id="voxBg" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stop-color="%23C21A15"/>
          <stop offset="60%" stop-color="%23940F0B"/>
          <stop offset="100%" stop-color="%23610906"/>
        </radialGradient>
        <radialGradient id="neonHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="%23FF4D42" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="%23DC2626" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="%237F1D1D" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="voxFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%23A8110D" stop-opacity="0"/>
          <stop offset="85%" stop-color="%23A8110D" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="%23A8110D" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(%23voxBg)"/>
      <!-- Studio acoustic wall texture lines -->
      <line x1="0" y1="40" x2="400" y2="40" stroke="%234A0604" stroke-width="1.5" opacity="0.5"/>
      <line x1="0" y1="80" x2="400" y2="80" stroke="%234A0604" stroke-width="1.5" opacity="0.5"/>
      <line x1="0" y1="120" x2="400" y2="120" stroke="%234A0604" stroke-width="1.5" opacity="0.5"/>
      <line x1="0" y1="160" x2="400" y2="160" stroke="%234A0604" stroke-width="1.5" opacity="0.5"/>
      <line x1="0" y1="200" x2="400" y2="200" stroke="%234A0604" stroke-width="1.5" opacity="0.5"/>
      <!-- Glow behind On-Air sign -->
      <circle cx="200" cy="115" r="95" fill="url(%23neonHalo)"/>
      <!-- Metallic Sign Box Shadow -->
      <rect x="116" y="86" width="168" height="64" rx="8" fill="%232B0302" opacity="0.85"/>
      <!-- Sign Outer Frame -->
      <rect x="118" y="84" width="164" height="60" rx="7" fill="%231A0505" stroke="%23380B0A" stroke-width="3"/>
      <!-- Inner Dark Plate -->
      <rect x="124" y="90" width="152" height="48" rx="4" fill="%23240201"/>
      <!-- Neon ON AIR Text with Intense Specular Glow -->
      <text x="200" y="125" font-family="Arial Black, Impact, sans-serif" font-size="28" font-weight="900" fill="%23FFF5F5" text-anchor="middle" letter-spacing="4" filter="drop-shadow(0 0 8px %23FF382E) drop-shadow(0 0 18px %23EF4444)">ON AIR</text>
      <rect width="400" height="240" fill="url(%23voxFade)"/>
    </svg>`,
  },

  encore: {
    id: 'encore',
    title: 'Encore Stage Spotlight Header',
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
      <defs>
        <radialGradient id="encoreBg" cx="65%" cy="30%" r="70%">
          <stop offset="0%" stop-color="%23241A14"/>
          <stop offset="50%" stop-color="%23151210"/>
          <stop offset="100%" stop-color="%230B0B0E"/>
        </radialGradient>
        <linearGradient id="spotlightBeam" x1="0.85" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stop-color="%23F59E0B" stop-opacity="0.85"/>
          <stop offset="40%" stop-color="%23D97706" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="%23B45309" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="encoreFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%230B0B0E" stop-opacity="0"/>
          <stop offset="85%" stop-color="%230B0B0E" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="%230B0B0E" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(%23encoreBg)"/>
      <!-- Cinematic Angled Spotlight Cone -->
      <polygon points="340,0 370,0 240,240 80,240" fill="url(%23spotlightBeam)"/>
      <!-- Stage Haze Particles -->
      <circle cx="260" cy="70" r="1.5" fill="%23FDE68A" opacity="0.7"/>
      <circle cx="230" cy="100" r="2" fill="%23FDE68A" opacity="0.6"/>
      <circle cx="280" cy="130" r="1.5" fill="%23FDE68A" opacity="0.8"/>
      <circle cx="190" cy="150" r="2.5" fill="%23FDE68A" opacity="0.5"/>
      <!-- Performer silhouette holding vintage microphone -->
      <path d="M150 240 C150 180 180 145 205 130 C215 125 220 115 220 105 C220 90 205 78 190 85 C175 92 172 105 168 120 C162 145 140 180 135 240 Z" fill="%23060608"/>
      <!-- Microphone Stand -->
      <line x1="225" y1="120" x2="225" y2="240" stroke="%231E1E24" stroke-width="3"/>
      <!-- Vintage Mic Capsule with warm rim glow -->
      <ellipse cx="225" cy="115" rx="7" ry="10" fill="%2318181B" stroke="%23F59E0B" stroke-width="1.5"/>
      <!-- Warm rim lighting on silhouette head & shoulder -->
      <path d="M190 85 C205 78 220 90 220 105 C220 115 215 125 205 130" stroke="%23F59E0B" stroke-width="2.5" fill="none" opacity="0.85"/>
      <rect width="400" height="240" fill="url(%23encoreFade)"/>
    </svg>`,
  },

  tress: {
    id: 'tress',
    title: 'Tress Botanical Foliage Header',
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
      <defs>
        <radialGradient id="tressBg" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="%232D3A28"/>
          <stop offset="70%" stop-color="%231E271B"/>
          <stop offset="100%" stop-color="%23141B12"/>
        </radialGradient>
        <linearGradient id="tressFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%231E261B" stop-opacity="0"/>
          <stop offset="85%" stop-color="%231E261B" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="%231E261B" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(%23tressBg)"/>
      <!-- Palm / Monstera Leaves Silhouette -->
      <path d="M260 240 Q 230 140 160 80 Q 210 100 240 140 Q 270 90 310 60 Q 290 120 280 170 Z" fill="%230F140D" opacity="0.85"/>
      <path d="M120 240 Q 150 160 210 110 Q 180 130 160 160 Q 140 190 135 240 Z" fill="%230B0F0A" opacity="0.9"/>
      <!-- Soft sunlight dappled beam -->
      <circle cx="200" cy="70" r="80" fill="%23FBBF24" opacity="0.08"/>
      <rect width="400" height="240" fill="url(%23tressFade)"/>
    </svg>`,
  },

  bliss: {
    id: 'bliss',
    title: 'Bliss Monochrome Editorial Header',
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
      <defs>
        <radialGradient id="blissBg" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="%23FFFFFF"/>
          <stop offset="60%" stop-color="%23EAEAEA"/>
          <stop offset="100%" stop-color="%23D4D4D4"/>
        </radialGradient>
        <linearGradient id="blissFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%23F4F4F4" stop-opacity="0"/>
          <stop offset="85%" stop-color="%23F4F4F4" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="%23F4F4F4" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(%23blissBg)"/>
      <!-- Minimalist monochrome sculpture / arch geometry -->
      <path d="M130 240 C130 140 170 100 200 100 C230 100 270 140 270 240 Z" fill="%231C1C1C" opacity="0.95"/>
      <path d="M150 240 C150 160 180 125 200 125 C220 125 250 160 250 240 Z" fill="%23FFFFFF" opacity="0.95"/>
      <ellipse cx="200" cy="180" rx="30" ry="40" fill="%232E2E2E"/>
      <rect width="400" height="240" fill="url(%23blissFade)"/>
    </svg>`,
  },
}

/**
 * Helper to get header artwork for a preset
 */
export function getThemeArtwork(themeId) {
  if (!themeId) return null
  const key = String(themeId).toLowerCase().trim()
  return THEME_ARTWORK[key] || null
}
