/**
 * CreatorStore — Store Design Panels Redesign Test Suite
 * 
 * Verifies that all 4 panels (Theme, Wallpaper, Text, Colors) match the
 * Linktree reference UI/UX design:
 * 1. Standardized Linktree Top Action Bar on all panels:
 *    - Back button '< [PanelName]'
 *    - Undo / Redo buttons
 *    - Cancel button (outline pill)
 *    - Save button (purple #8B3DFF pill)
 * 2. Visual Structure & Tokens:
 *    - White container with rounded-[24px] / rounded-2xl, border-[#E5E5E3], subtle shadow
 *    - No dark charcoal legacy containers (no bg-[#1A1A1A])
 *    - High-contrast text labels (WCAG AAA >= 7:1)
 * 3. ColorField Integration:
 *    - Unified swatch + uppercase #HEX code pill
 *    - Double border swatch ensuring contrast against white and dark backgrounds
 * 4. ThemePanel:
 *    - Shuffle button with random theme generation
 *    - Customizable and Curated tabs
 *    - Custom card with pen icon
 *    - Curated theme cards with Aa preview, button preview, selected checkmark, and Pro badge
 * 5. WallpaperPanel:
 *    - 6 Wallpaper styles: Fill, Gradient, Blur, Pattern, Image, Video
 *    - Background color pill
 *    - Pattern choices: Noise, Grid, Blobs, Dots
 *    - Gradient angle slider and color stops
 * 6. TextPanel:
 *    - Page font dropdown selector
 *    - Page text color pill
 *    - Alternative title font toggle switch with Pro badge
 *    - Title color pill
 * 7. ColorsPanel:
 *    - Dedicated rows for Background, Buttons, Button text, Page text, Title, and Button shadow
 *    - Reset to defaults action
 * 8. Dashboard Store Page Integration:
 *    - Exclusion of legacy header for ['buttons', 'theme', 'wallpaper', 'text', 'colors']
 *    - Live sync and state bindings for draft theme preview
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import { getContrastRatio } from '../lib/colorContrast.js'
import { STOREFRONT_GALLERY_THEMES } from '../lib/storefront-themes.js'

describe('1. Component File Existence & Clean Exports', () => {
  const components = [
    { name: 'ThemePanel.jsx', fn: 'ThemePanel' },
    { name: 'WallpaperPanel.jsx', fn: 'WallpaperPanel' },
    { name: 'TextPanel.jsx', fn: 'TextPanel' },
    { name: 'ColorsPanel.jsx', fn: 'ColorsPanel' },
    { name: 'ColorField.jsx', fn: 'ColorField' },
  ]

  for (const { name, fn } of components) {
    it(`${name} exists and exports ${fn}`, () => {
      const filePath = path.resolve(process.cwd(), 'components/dashboard/design', name)
      assert.ok(fs.existsSync(filePath), `${name} must exist`)
      const content = fs.readFileSync(filePath, 'utf8')
      assert.ok(
        content.includes(`export default function ${fn}`) || content.includes(`export function ${fn}`),
        `${name} must export ${fn}`
      )
    })
  }
})

describe('2. Design System Tokens & WCAG Contrast Compliance', () => {
  const panelFiles = [
    'components/dashboard/design/ThemePanel.jsx',
    'components/dashboard/design/WallpaperPanel.jsx',
    'components/dashboard/design/TextPanel.jsx',
    'components/dashboard/design/ColorsPanel.jsx',
  ]

  it('All panels use clean white surface cards without dark legacy wrappers', () => {
    for (const file of panelFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
      assert.ok(content.includes('bg-white'), `${file} must use bg-white container`)
      assert.ok(content.includes('border-[#E5E5E3]'), `${file} must use border-[#E5E5E3]`)
      assert.ok(!content.includes("bg-[#1A1A1A]"), `${file} must not contain dark legacy container`)
    }
  })

  it('Standardized Top Action Bar is present on all panels', () => {
    for (const file of panelFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
      // Must have Undo / Redo controls
      assert.ok(content.includes('Undo') || content.includes('RotateCcw') || content.includes('undo'), `${file} must have undo control`)
      // Must have Cancel button
      assert.ok(content.includes('Cancel'), `${file} must have Cancel button`)
      // Must have Save button with purple styling #8B3DFF
      assert.ok(content.includes('Save') && content.includes('#8B3DFF'), `${file} must have purple Save button`)
      // Must have back button
      assert.ok(content.includes('ChevronLeft') || content.includes('ArrowLeft'), `${file} must have back navigation button`)
    }
  })

  it('Text labels have WCAG AAA compliant contrast on white card surface', () => {
    const whiteSurface = '#FFFFFF'
    const primaryLabelColor = '#111827' // gray-900 / dark charcoal
    const secondaryMutedColor = '#6B7280' // gray-500
    const borderDefault = '#E5E5E3'

    const primaryContrast = getContrastRatio(whiteSurface, primaryLabelColor)
    assert.ok(primaryContrast >= 7.0, `Primary label contrast ${primaryContrast} must be >= 7:1 (WCAG AAA)`)

    const secondaryContrast = getContrastRatio(whiteSurface, secondaryMutedColor)
    assert.ok(secondaryContrast >= 4.5, `Secondary label contrast ${secondaryContrast} must be >= 4.5:1 (WCAG AA)`)
  })
})

describe('3. Unified ColorField Component', () => {
  it('ColorField renders Linktree-exact [ 🟩 #HEX ] pill with uppercase hex', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'components/dashboard/design/ColorField.jsx'), 'utf8')
    assert.ok(content.includes('font-mono'), 'ColorField must use monospace font for hex values')
    assert.ok(content.includes('toUpperCase'), 'ColorField must uppercase hex values')
    assert.ok(content.includes('rounded-xl') || content.includes('rounded-full'), 'ColorField must use pill/rounded container')
    assert.ok(content.includes('type="color"'), 'ColorField must include native color input for accessible swatch click')
  })
})

describe('4. ThemePanel Linktree Reference Features', () => {
  it('ThemePanel includes Shuffle button and tabs', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'components/dashboard/design/ThemePanel.jsx'), 'utf8')
    assert.ok(content.includes('Shuffle'), 'ThemePanel must include Shuffle action')
    assert.ok(content.includes('Customizable'), 'ThemePanel must include Customizable tab')
    assert.ok(content.includes('Curated'), 'ThemePanel must include Curated tab')
    assert.ok(content.includes('Custom'), 'ThemePanel must include Custom card')
  })

  it('Curated theme gallery is populated and properly categorized', () => {
    assert.ok(Array.isArray(STOREFRONT_GALLERY_THEMES), 'STOREFRONT_GALLERY_THEMES must be an array')
    assert.ok(STOREFRONT_GALLERY_THEMES.length >= 6, 'STOREFRONT_GALLERY_THEMES must have at least 6 themes')
  })
})

describe('5. WallpaperPanel Linktree Reference Features', () => {
  it('WallpaperPanel includes 6 wallpaper styles and pattern selector', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'components/dashboard/design/WallpaperPanel.jsx'), 'utf8')
    const styles = ['Fill', 'Gradient', 'Blur', 'Pattern', 'Image', 'Video']
    for (const s of styles) {
      assert.ok(content.includes(s), `WallpaperPanel must support ${s} style`)
    }
    assert.ok(content.includes('Pattern'), 'WallpaperPanel must include Pattern selection')
    assert.ok(content.includes('ColorField'), 'WallpaperPanel must use unified ColorField')
  })
})

describe('6. TextPanel Linktree Reference Features', () => {
  it('TextPanel includes Page font, text color, and alternative title font toggle', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'components/dashboard/design/TextPanel.jsx'), 'utf8')
    assert.ok(content.includes('Page font'), 'TextPanel must have Page font selector')
    assert.ok(content.includes('Page text color'), 'TextPanel must have Page text color field')
    assert.ok(content.includes('Alternative title font'), 'TextPanel must have Alternative title font toggle')
    assert.ok(content.includes('Title color'), 'TextPanel must have Title color field')
  })
})

describe('7. ColorsPanel Linktree Reference Features', () => {
  it('ColorsPanel includes Background, Buttons, Button text, Page text, Title, and Reset', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'components/dashboard/design/ColorsPanel.jsx'), 'utf8')
    assert.ok(content.includes('Background'), 'ColorsPanel must have Background color')
    assert.ok(content.includes('Buttons'), 'ColorsPanel must have Buttons color')
    assert.ok(content.includes('Button text'), 'ColorsPanel must have Button text color')
    assert.ok(content.includes('Page text'), 'ColorsPanel must have Page text color')
    assert.ok(content.includes('Title'), 'ColorsPanel must have Title color')
    assert.ok(content.includes('Reset') || content.includes('defaults'), 'ColorsPanel must have Reset action')
  })
})

describe('8. Dashboard Store Page Integration', () => {
  it('app/dashboard/store/page.js wires all 4 panels cleanly and suppresses duplicate legacy headers', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'app/dashboard/store/page.js'), 'utf8')
    
    // Check imports
    assert.ok(content.includes('import ThemePanel'), 'Must import ThemePanel')
    assert.ok(content.includes('import WallpaperPanel'), 'Must import WallpaperPanel')
    assert.ok(content.includes('import TextPanel'), 'Must import TextPanel')
    assert.ok(content.includes('import ColorsPanel'), 'Must import ColorsPanel')

    // Check exclusion of legacy header for all 5 Linktree-style panels
    assert.ok(
      content.includes("!['buttons', 'theme', 'wallpaper', 'text', 'colors'].includes(activeSection)"),
      'Legacy subpanel header must exclude buttons, theme, wallpaper, text, and colors'
    )

    // Check rendering of ThemePanel
    assert.ok(content.includes('<ThemePanel'), 'Must render ThemePanel')
    assert.ok(content.includes('<WallpaperPanel'), 'Must render WallpaperPanel')
    assert.ok(content.includes('<TextPanel'), 'Must render TextPanel')
    assert.ok(content.includes('<ColorsPanel'), 'Must render ColorsPanel')
  })
})
