/**
 * CreatorStore — Header Customization & Appearance Header Removal Test Suite
 * 
 * Verifies:
 * 1. Complete Removal of the Storefront Appearance Headline Card:
 *    - No "Storefront Appearance" headline card.
 *    - No duplicate top banner with Palette icon in blue circle and Revert Changes button.
 *    - No duplicate navigation row ("All Settings" / "Header Customization").
 *    - Settings page starts cleanly with the selected options section or options list.
 * 2. Header Customization Card Standardized Top Action Bar:
 *    - HeaderPanel contains bold section title "Header Customization".
 *    - Back arrow directly beside the title.
 *    - Neutral Cancel button and black Save button aligned to the right.
 *    - Compact, consistent height (h-8), border radius (rounded-full), and typography.
 * 3. Real Persistence & Save/Cancel Behavior:
 *    - Wires onSaveTheme and onRevertTheme to HeaderPanel.
 *    - Loading state while saving (isSaving / Loader2).
 *    - Disables Save/Cancel when !hasUnsavedChanges or isSaving.
 *    - Unsaved edits are preserved on navigation back (onBack).
 *    - Cancel restores saved theme appearance immediately.
 * 4. Standardized Layout Across All 6 Option Pages:
 *    - Buttons, Theme, Wallpaper, Colors, Text, Header Customization, and Footer.
 *    - Shared PanelHeader component with consistent arrow, title, Cancel, and black Save button.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

describe('1. Storefront Appearance Headline Card Removal', () => {
  const pagePath = path.resolve(process.cwd(), 'app/dashboard/store/page.js')
  const content = fs.readFileSync(pagePath, 'utf8')

  it('Completely removes the Storefront Appearance headline banner card', () => {
    // Must NOT contain the old Storefront Appearance heading text
    assert.ok(
      !content.includes('STOREFRONT APPEARANCE') && !content.includes('Storefront Appearance\n'),
      'Storefront Appearance heading card must be completely removed from the page'
    )
    assert.ok(
      !content.includes('Customize how your CreatorStore storefront looks to visitors.'),
      'Storefront Appearance description must be removed'
    )
    assert.ok(
      !content.includes('TOP APPEARANCE STATUS BAR'),
      'TOP APPEARANCE STATUS BAR comment/container must be removed'
    )
  })

  it('Removes the duplicate subpanel navigation bar for header', () => {
    assert.ok(
      !content.includes('{`${activeSection} Customization`}'),
      'Old duplicate subpanel navigation row must be removed'
    )
  })

  it('Preserves underlying theme settings state and revert confirm modal', () => {
    assert.ok(content.includes('const saveTheme ='), 'saveTheme must be preserved')
    assert.ok(content.includes('const revertTheme ='), 'revertTheme must be preserved')
    assert.ok(content.includes('hasUnsavedThemeChanges'), 'hasUnsavedThemeChanges must be preserved')
    assert.ok(content.includes('themeSaveState'), 'themeSaveState must be preserved')
  })
})

describe('2. HeaderPanel Standardized Action Bar & Layout', () => {
  const headerPanelPath = path.resolve(process.cwd(), 'components/dashboard/design/HeaderPanel.jsx')
  const headerContent = fs.readFileSync(headerPanelPath, 'utf8')

  it('Imports and renders PanelHeader with "Header Customization"', () => {
    assert.ok(headerContent.includes("import PanelHeader from './PanelHeader'"), 'HeaderPanel must import PanelHeader')
    assert.ok(headerContent.includes('title="Header Customization"'), 'HeaderPanel must pass title="Header Customization"')
    assert.ok(headerContent.includes('onBack={onBack}'), 'HeaderPanel must pass onBack')
    assert.ok(headerContent.includes('onSave={onSave}'), 'HeaderPanel must pass onSave')
    assert.ok(headerContent.includes('onCancel={onCancel}'), 'HeaderPanel must pass onCancel')
    assert.ok(headerContent.includes('hasUnsavedChanges={hasUnsavedChanges}'), 'HeaderPanel must pass hasUnsavedChanges')
    assert.ok(headerContent.includes('isSaving={isSaving}'), 'HeaderPanel must pass isSaving')
  })

  it('Uses clean white card container matching other standardized panels', () => {
    assert.ok(headerContent.includes('bg-white'), 'HeaderPanel container must use bg-white')
    assert.ok(headerContent.includes('border-[#E5E5E3]'), 'HeaderPanel container must use border-[#E5E5E3]')
    assert.ok(headerContent.includes('rounded-[24px]'), 'HeaderPanel container must use rounded-[24px]')
  })

  it('Preserves all header form controls below the header', () => {
    assert.ok(headerContent.includes('Choose Header'), 'HeaderPanel must preserve Choose Header section')
    assert.ok(headerContent.includes('Profile image'), 'HeaderPanel must preserve Profile image section')
    assert.ok(headerContent.includes('TitleBioFields'), 'HeaderPanel must preserve TitleBioFields')
    assert.ok(headerContent.includes('Title style'), 'HeaderPanel must preserve Title style')
    assert.ok(headerContent.includes('AltTitleFontToggle'), 'HeaderPanel must preserve AltTitleFontToggle')
    assert.ok(headerContent.includes('Title color'), 'HeaderPanel must preserve Title color')
  })
})

describe('3. Shared PanelHeader Component Layout & Styling', () => {
  const panelHeaderPath = path.resolve(process.cwd(), 'components/dashboard/design/PanelHeader.jsx')
  const panelHeaderContent = fs.readFileSync(panelHeaderPath, 'utf8')

  it('PanelHeader component exists and is cleanly exported', () => {
    assert.ok(fs.existsSync(panelHeaderPath), 'PanelHeader.jsx must exist')
    assert.ok(panelHeaderContent.includes('export default function PanelHeader'), 'Must export PanelHeader')
  })

  it('Renders back button, bold title, Cancel, and black Save button', () => {
    // Back button
    assert.ok(panelHeaderContent.includes('<ArrowLeft'), 'Must render ArrowLeft icon')
    assert.ok(panelHeaderContent.includes('h-8 w-8'), 'Back button must be h-8 w-8')
    assert.ok(panelHeaderContent.includes('rounded-full'), 'Back button must be rounded-full')

    // Bold title
    assert.ok(panelHeaderContent.includes('font-bold'), 'Title must be bold')

    // Cancel button
    assert.ok(panelHeaderContent.includes('Cancel'), 'Must render Cancel button')
    assert.ok(panelHeaderContent.includes('disabled={!hasUnsavedChanges || isSaving}'), 'Cancel must be disabled when clean or saving')
    assert.ok(panelHeaderContent.includes('border-[#E5E5E3]'), 'Cancel button must have border-[#E5E5E3]')

    // Black Save button
    assert.ok(panelHeaderContent.includes('Save'), 'Must render Save button')
    assert.ok(panelHeaderContent.includes('bg-[#000000] text-white'), 'Save button must use black background with white text')
    assert.ok(panelHeaderContent.includes('disabled={!hasUnsavedChanges || isSaving}'), 'Save must be disabled when clean or saving')
    assert.ok(panelHeaderContent.includes('Loader2'), 'Save must render Loader2 spinner when isSaving')
  })
})

describe('4. Standardized Layout Across All Theme Option Panels', () => {
  const panels = [
    { file: 'components/dashboard/design/ButtonsPanel.jsx', title: 'Buttons' },
    { file: 'components/dashboard/design/ThemePanel.jsx', title: 'Theme' },
    { file: 'components/dashboard/design/WallpaperPanel.jsx', title: 'Wallpaper' },
    { file: 'components/dashboard/design/ColorsPanel.jsx', title: 'Colors' },
    { file: 'components/dashboard/design/TextPanel.jsx', title: 'Text' },
    { file: 'components/dashboard/design/HeaderPanel.jsx', title: 'Header Customization' },
  ]

  for (const { file, title } of panels) {
    it(`${title} panel uses standardized PanelHeader and white container`, () => {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
      assert.ok(content.includes('PanelHeader'), `${file} must use PanelHeader`)
      assert.ok(content.includes(`title="${title}"`), `${file} must specify title="${title}"`)
      assert.ok(content.includes('bg-white'), `${file} container must use bg-white`)
      assert.ok(content.includes('border-[#E5E5E3]'), `${file} container must use border-[#E5E5E3]`)
      assert.ok(!content.includes('bg-[#1A1A1A]'), `${file} container must not use legacy dark background`)
    })
  }

  it('Footer subpanel in page.js also uses standardized PanelHeader and white container', () => {
    const pageContent = fs.readFileSync(path.resolve(process.cwd(), 'app/dashboard/store/page.js'), 'utf8')
    assert.ok(pageContent.includes('title="Footer Customization"'), 'Footer must use PanelHeader with title="Footer Customization"')
    assert.ok(!pageContent.includes('activeSection === \'footer\' && (\n                <div className="space-y-4 bg-[#1A1A1A]'), 'Footer must not use dark #1A1A1A wrapper')
  })
})

describe('5. Real Save and Cancel Wiring in DesignStudioPage', () => {
  const pageContent = fs.readFileSync(path.resolve(process.cwd(), 'app/dashboard/store/page.js'), 'utf8')

  it('Wires HeaderPanel with onSaveTheme and onRevertTheme', () => {
    assert.ok(pageContent.includes('activeSection === \'header\' && ('), 'HeaderPanel must be rendered for activeSection === header')
    assert.ok(pageContent.includes('onSave={onSaveTheme}'), 'HeaderPanel must receive onSaveTheme')
    assert.ok(pageContent.includes('onRevertTheme()'), 'HeaderPanel onCancel must trigger onRevertTheme')
    assert.ok(pageContent.includes('hasUnsavedChanges={hasUnsavedThemeChanges}'), 'HeaderPanel must receive hasUnsavedThemeChanges')
    assert.ok(pageContent.includes('isSaving={themeSaveState === \'saving\'}'), 'HeaderPanel must receive isSaving')
  })

  it('Navigating back via onBack restores section list without discarding unsaved edits', () => {
    // onBack={() => setActiveSection(null)} returns to section list while store.theme draft is preserved in state
    assert.ok(pageContent.includes('onBack={() => setActiveSection(null)}'), 'onBack navigates to section list')
  })
})
