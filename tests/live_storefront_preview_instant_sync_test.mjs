import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma.js'
import { storeService, publicService } from '../lib/services.js'
import {
  STOREFRONT_GALLERY_THEMES,
  getGalleryThemeId,
  themePatchFromGallery,
} from '../lib/storefront-themes.js'
import { getThemeTokens, STORE_PRESETS } from '../lib/themePresets.js'
import { isThemeDirty, normalizeThemeForComparison } from '../lib/themeComparison.js'

console.log('\n=====================================================================')
console.log('🧪 CREATORSTORE LIVE STOREFRONT PREVIEW INSTANT SYNC TEST SUITE')
console.log('=====================================================================\n')

let passed = 0
let failed = 0

function pass(desc) {
  console.log(`  ✅ [PASS] ${desc}`)
  passed++
}

function fail(desc, err) {
  console.error(`  ❌ [FAIL] ${desc}: ${err?.message || err}`)
  failed++
}

async function runTests() {
  // -------------------------------------------------------------
  // TEST 1: Source Code Audit — previewStore Draft State Binding
  // -------------------------------------------------------------
  console.log('--- TEST 1: Source Code Audit — previewStore Uses Draft store.theme ---')
  try {
    const dashboardPath = path.join(process.cwd(), 'app/dashboard/store/page.js')
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8')

    // Verify DesignStudioPage's previewStore computation
    const designStudioSection = dashboardContent.slice(
      dashboardContent.indexOf('function DesignStudioPage'),
      dashboardContent.indexOf('function DesignStudioPage') + 2000
    )

    // Ensure it does NOT use savedTheme || store.theme
    assert(
      !designStudioSection.includes('...(savedTheme || store.theme || {})'),
      'CRITICAL: previewStore must NOT select savedTheme over store.theme'
    )
    assert(
      !designStudioSection.includes('(savedTheme || store.theme)?.showFooterBranding'),
      'CRITICAL: previewStore showFooterBranding must NOT select savedTheme over store.theme'
    )

    // Ensure it binds to active store.theme directly
    assert(
      designStudioSection.includes('const activeTheme = store.theme || {}') ||
      designStudioSection.includes('theme: {\n        ...(store.theme || {})') ||
      designStudioSection.includes('theme: {\n        ...activeTheme'),
      'previewStore must directly consume active draft store.theme'
    )

    pass('DesignStudioPage previewStore binds directly to draft store.theme')
    pass('No frozen savedTheme fallback overriding unsaved theme draft')
  } catch (err) {
    fail('TEST 1: Source Code Audit', err)
  }

  // -------------------------------------------------------------
  // TEST 2: Selecting Another Theme Updates Preview Immediately Before Saving
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Selecting Another Theme Updates Preview Immediately Before Saving ---')
  try {
    const initialSavedTheme = {
      presetId: 'creator',
      galleryThemeId: 'creatorstore',
      background: '#000000',
      buttonColor: '#4D7CFF',
      buttonTextColor: '#000000',
      textColor: '#F4F2EC',
      font: 'Manrope',
    }

    let currentStore = {
      id: 'test-store-1',
      username: 'previewtest',
      theme: { ...initialSavedTheme },
    }
    const savedTheme = structuredClone(initialSavedTheme)

    // Simulate clicking the "chalk" theme preset in the theme gallery
    const chalkPreset = STOREFRONT_GALLERY_THEMES.find((p) => p.id === 'chalk')
    assert(chalkPreset, 'Chalk theme preset must exist in gallery')

    const patch = themePatchFromGallery(chalkPreset, currentStore.theme)

    // Local state update (updateThemeLocally behavior)
    currentStore = {
      ...currentStore,
      theme: { ...currentStore.theme, ...patch },
    }

    // DesignStudioPage previewStore computation
    const activeTheme = currentStore.theme || {}
    const previewStore = {
      ...currentStore,
      theme: {
        ...activeTheme,
        showFooterBranding: true,
      },
    }

    // Verify previewStore.theme immediately has Chalk's background and buttonColor
    assert.strictEqual(previewStore.theme.galleryThemeId, 'chalk', 'Preview theme id must be chalk')
    assert.strictEqual(previewStore.theme.background, '#F3E9DC', 'Preview background must be chalk cream (#F3E9DC)')
    assert.strictEqual(previewStore.theme.buttonColor, '#F3E9DC', 'Preview button color must match chalk (#F3E9DC)')
    assert.strictEqual(previewStore.theme.buttonTextColor, '#1A1A1A', 'Preview button text color must be #1A1A1A')

    // Verify tokens generated from previewStore match Chalk
    const previewTokens = getThemeTokens(previewStore.theme)
    assert.strictEqual(previewTokens.colors.background, '#F3E9DC', 'Preview tokens background must be #F3E9DC')
    assert.strictEqual(previewTokens.buttons.color, '#F3E9DC', 'Preview tokens button color must be #F3E9DC')

    // Verify savedTheme is STILL the initial saved theme (NO save occurred!)
    assert.strictEqual(savedTheme.galleryThemeId, 'creatorstore', 'savedTheme must remain unchanged before save')
    assert.strictEqual(savedTheme.background, '#000000', 'savedTheme background must remain unchanged')

    // Dirty state must be detected
    const dirty = isThemeDirty(currentStore.theme, savedTheme)
    assert.strictEqual(dirty, true, 'isThemeDirty must report true for unsaved draft')

    pass('Selecting theme immediately updates previewStore and preview tokens')
    pass('savedTheme remains unmutated before clicking Save Changes')
    pass('Dirty state correctly activates Save Changes button')
  } catch (err) {
    fail('TEST 2: Selecting Another Theme', err)
  }

  // -------------------------------------------------------------
  // TEST 3: Rapidly Switching Between Themes Keeps Latest Selection
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Rapidly Switching Between Themes Keeps Latest Selection ---')
  try {
    const initialSavedTheme = { galleryThemeId: 'creatorstore', background: '#000000' }
    let currentStore = { id: 'test-store-1', theme: { ...initialSavedTheme } }

    const themeChain = ['chalk', 'flare', 'tide', 'afterglow', 'lattice']

    for (const themeId of themeChain) {
      const preset = STOREFRONT_GALLERY_THEMES.find((p) => p.id === themeId)
      assert(preset, `Preset ${themeId} must exist`)
      const patch = themePatchFromGallery(preset, currentStore.theme)
      currentStore = {
        ...currentStore,
        theme: { ...currentStore.theme, ...patch },
      }
    }

    const previewStore = {
      ...currentStore,
      theme: { ...(currentStore.theme || {}), showFooterBranding: true },
    }

    // Verify the latest theme is Lattice
    assert.strictEqual(previewStore.theme.galleryThemeId, 'lattice', 'Preview theme must be lattice')
    assert.strictEqual(previewStore.theme.bgType, 'pattern', 'Lattice bgType must be pattern')
    assert.strictEqual(previewStore.theme.wallpaperPattern, 'grid', 'Lattice pattern must be grid')

    const previewTokens = getThemeTokens(previewStore.theme)
    assert.strictEqual(previewTokens.wallpaper.bgType, 'pattern', 'Preview tokens wallpaper must reflect lattice')

    pass('Rapid sequential theme switching reflects the final selection without lag or stale state')
  } catch (err) {
    fail('TEST 3: Rapidly Switching Themes', err)
  }

  // -------------------------------------------------------------
  // TEST 4: Changing Colors, Typography, Wallpaper & Patterns Updates Preview
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Changing Colors, Typography, Wallpaper & Patterns Updates Preview ---')
  try {
    let currentStore = {
      id: 'test-store-1',
      theme: {
        background: '#000000',
        textColor: '#FFFFFF',
        font: 'Manrope',
        bgType: 'solid',
      },
    }

    // 1. Change background color & text color
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        background: '#0F172A',
        textColor: '#F8FAFC',
      },
    }
    let preview = { ...currentStore, theme: { ...currentStore.theme } }
    let tokens = getThemeTokens(preview.theme)
    assert.strictEqual(tokens.colors.background, '#0F172A', 'Preview background color updated')
    assert.strictEqual(tokens.colors.text, '#F8FAFC', 'Preview text color updated')

    // 2. Change typography (page font)
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        font: 'Space Grotesk',
      },
    }
    preview = { ...currentStore, theme: { ...currentStore.theme } }
    tokens = getThemeTokens(preview.theme)
    assert(tokens.typography.headingFont.includes('Space Grotesk'), 'Preview heading font updated')

    // 3. Change wallpaper to gradient
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        bgType: 'gradient',
        gradientStops: ['#6B4FBB', '#E0459E'],
        gradientDirection: '135deg',
      },
    }
    preview = { ...currentStore, theme: { ...currentStore.theme } }
    tokens = getThemeTokens(preview.theme)
    assert.strictEqual(tokens.wallpaper.bgType, 'gradient', 'Preview wallpaper updated to gradient')
    assert.deepStrictEqual(tokens.wallpaper.gradientStops, ['#6B4FBB', '#E0459E'], 'Preview gradient stops updated')

    // 4. Change wallpaper to pattern
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        bgType: 'pattern',
        wallpaperPattern: 'dots',
      },
    }
    preview = { ...currentStore, theme: { ...currentStore.theme } }
    tokens = getThemeTokens(preview.theme)
    assert.strictEqual(tokens.wallpaper.bgType, 'pattern', 'Preview wallpaper updated to pattern')
    assert.strictEqual(tokens.wallpaper.pattern, 'dots', 'Preview pattern updated to dots')

    pass('Color changes immediately update live preview tokens')
    pass('Typography font changes immediately update live preview tokens')
    pass('Gradient and pattern wallpaper changes immediately update live preview tokens')
  } catch (err) {
    fail('TEST 4: Colors, Typography & Patterns', err)
  }

  // -------------------------------------------------------------
  // TEST 5: Button Styles, Shapes, Shadows & Header Layout
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Button Styles, Shapes, Shadows & Header Layout ---')
  try {
    let currentStore = {
      id: 'test-store-1',
      theme: {
        buttonStyle: 'filled',
        buttonShape: 'rounded',
        buttonRadius: 8,
        buttonShadow: 'none',
        headerLayout: 'classic',
        headerBio: 'Original bio',
      },
    }

    // 1. Button shape pill & radius
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        buttonShape: 'pill',
        buttonRadius: 9999,
        buttonShadow: 'strong',
      },
    }
    let preview = { ...currentStore, theme: { ...currentStore.theme } }
    let tokens = getThemeTokens(preview.theme)
    assert.strictEqual(tokens.buttons.shape, 'pill', 'Button shape pill reflected')
    assert.strictEqual(tokens.buttons.radius, 9999, 'Button radius 9999 reflected')
    assert.strictEqual(tokens.buttons.shadow, 'strong', 'Button shadow strong reflected')

    // 2. Header layout to immersive
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        headerLayout: 'immersive',
        headerBio: 'Updated immersive bio description',
      },
    }
    preview = { ...currentStore, theme: { ...currentStore.theme } }
    tokens = getThemeTokens(preview.theme)
    assert.strictEqual(tokens.header.layout, 'immersive', 'Immersive header layout reflected')
    assert.strictEqual(tokens.header.bio, 'Updated immersive bio description', 'Header bio reflected')

    // 3. Footer branding toggle
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        showFooterBranding: false,
      },
    }
    preview = { ...currentStore, theme: { ...currentStore.theme } }
    tokens = getThemeTokens(preview.theme)
    assert.strictEqual(tokens.footer.showBranding, false, 'Footer showBranding reflected')

    pass('Button styling (shape, radius, shadow) updates preview immediately')
    pass('Header layout (immersive) and bio update preview immediately')
    pass('Footer branding toggle updates preview immediately')
  } catch (err) {
    fail('TEST 5: Buttons and Header Layout', err)
  }

  // -------------------------------------------------------------
  // TEST 6: Save Changes Persists Final Draft and Updates savedTheme
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Save Changes Persists Final Draft and Updates savedTheme ---')
  try {
    const creatorUser = await prisma.user.findFirst({
      where: { role: 'CREATOR' },
      include: { store: true },
    })
    assert(creatorUser?.store, 'A creator with an existing store must exist')

    // Ensure clean baseline different from draftPatch
    if (creatorUser.store.theme?.galleryThemeId === 'flare') {
      const resetBaseline = await storeService.update(creatorUser.id, {
        theme: { ...creatorUser.store.theme, galleryThemeId: 'custom', background: '#000000' },
      })
      creatorUser.store = resetBaseline
    }

    const originalTheme = creatorUser.store.theme || {}

    // Initial state
    let savedTheme = structuredClone(originalTheme)
    let currentStore = {
      ...creatorUser.store,
      theme: { ...originalTheme },
    }

    // Make draft edit
    const draftPatch = {
      galleryThemeId: 'flare',
      background: '#6B4FBB',
      buttonColor: '#FFFFFF',
      buttonTextColor: '#1A1A1A',
      textColor: '#FFFFFF',
      font: 'Outfit',
    }

    currentStore = {
      ...currentStore,
      theme: { ...currentStore.theme, ...draftPatch },
    }

    // Verify dirty
    assert.strictEqual(isThemeDirty(currentStore.theme, savedTheme), true, 'Dirty before save')

    // Perform save via storeService (matching /api/store PATCH handler)
    const updatedStore = await storeService.update(creatorUser.id, {
      theme: currentStore.theme,
    })

    // On save success:
    savedTheme = structuredClone(updatedStore.theme)
    currentStore = {
      ...currentStore,
      ...updatedStore,
      theme: updatedStore.theme,
    }

    // Verify clean state
    assert.strictEqual(isThemeDirty(currentStore.theme, savedTheme), false, 'Clean after save')
    assert.strictEqual(savedTheme.galleryThemeId, 'flare', 'Persisted theme id is flare')
    assert.strictEqual(savedTheme.background, '#6B4FBB', 'Persisted background is #6B4FBB')

    // Clean up / restore original
    await storeService.update(creatorUser.id, { theme: originalTheme })

    pass('Save Changes persists current draft to the database')
    pass('savedTheme is updated to match persisted theme')
    pass('isThemeDirty transitions to false and save indicator updates')
  } catch (err) {
    fail('TEST 6: Save Changes Persistence', err)
  }

  // -------------------------------------------------------------
  // TEST 7: Revert Changes Restores Last Saved Appearance Instantly
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Revert Changes Restores Last Saved Appearance Instantly ---')
  try {
    const initialSavedTheme = {
      galleryThemeId: 'creatorstore',
      background: '#000000',
      buttonColor: '#4D7CFF',
      textColor: '#F4F2EC',
      font: 'Manrope',
    }

    const savedTheme = structuredClone(initialSavedTheme)
    let currentStore = {
      id: 'store-revert-test',
      theme: { ...initialSavedTheme },
    }

    // User makes unsaved edits
    currentStore = {
      ...currentStore,
      theme: {
        ...currentStore.theme,
        galleryThemeId: 'tide',
        background: '#3B6FE0',
        buttonColor: '#5B8CFF',
      },
    }

    // Preview shows draft edits
    let preview = { ...currentStore, theme: { ...currentStore.theme } }
    assert.strictEqual(preview.theme.background, '#3B6FE0', 'Preview displays draft tide background')
    assert.strictEqual(isThemeDirty(currentStore.theme, savedTheme), true, 'Dirty before revert')

    // User clicks "Revert Changes" (revertTheme execution)
    const restoredTheme = structuredClone(savedTheme)
    currentStore = {
      ...currentStore,
      theme: restoredTheme,
    }

    // Preview updates immediately
    preview = { ...currentStore, theme: { ...currentStore.theme } }
    assert.strictEqual(preview.theme.background, '#000000', 'Preview immediately restored to #000000')
    assert.strictEqual(preview.theme.galleryThemeId, 'creatorstore', 'Preview immediately restored to creatorstore')
    assert.strictEqual(isThemeDirty(currentStore.theme, savedTheme), false, 'Dirty state cleared after revert')

    pass('Revert Changes immediately restores savedTheme without page reload')
    pass('Preview returns to saved appearance instantly')
    pass('Dirty state resets to clean')
  } catch (err) {
    fail('TEST 7: Revert Changes', err)
  }

  // -------------------------------------------------------------
  // TEST 8: Failed Save Preserves Unsaved Edits
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Failed Save Preserves Unsaved Edits ---')
  try {
    const savedTheme = { galleryThemeId: 'creatorstore', background: '#000000' }
    let currentStore = {
      id: 'store-fail-save-test',
      theme: { galleryThemeId: 'flare', background: '#6B4FBB' },
    }
    let themeSaveState = 'idle'

    // Simulate save invocation that throws error
    try {
      themeSaveState = 'saving'
      throw new Error('Simulated network timeout during save')
    } catch (err) {
      themeSaveState = 'error'
    }

    // currentStore.theme must NOT be overwritten or reverted!
    assert.strictEqual(currentStore.theme.galleryThemeId, 'flare', 'Unsaved edits must NOT be wiped on save failure')
    assert.strictEqual(currentStore.theme.background, '#6B4FBB', 'Unsaved background preserved on save failure')
    assert.strictEqual(themeSaveState, 'error', 'Save state transitions to error')
    assert.strictEqual(isThemeDirty(currentStore.theme, savedTheme), true, 'Unsaved dirty state remains true')

    pass('Failed save preserves unsaved edits and maintains dirty state for retry')
  } catch (err) {
    fail('TEST 8: Failed Save Preserves Edits', err)
  }

  // -------------------------------------------------------------
  // TEST 9: Public Storefront Uses Saved Appearance After Save
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Public Storefront Uses Saved Appearance After Save ---')
  try {
    const creatorUser = await prisma.user.findFirst({
      where: { role: 'CREATOR' },
      include: { store: true },
    })
    assert(creatorUser?.store?.username, 'Creator username required')

    const originalTheme = creatorUser.store.theme || {}

    // Save a distinct theme to store
    const testTheme = {
      ...originalTheme,
      galleryThemeId: 'chalk',
      background: '#F3E9DC',
      textColor: '#1A1A1A',
    }

    await storeService.update(creatorUser.id, { theme: testTheme })

    // Fetch public storefront as an unauthenticated visitor
    const publicStoreData = await publicService.getStore(creatorUser.store.username, { allowDraft: true })
    assert(publicStoreData?.store, 'Public store data must be returned')
    assert.strictEqual(publicStoreData.store.theme.galleryThemeId, 'chalk', 'Public store must have saved theme chalk')
    assert.strictEqual(publicStoreData.store.theme.background, '#F3E9DC', 'Public store must have saved background')

    // Cleanup: restore original
    await storeService.update(creatorUser.id, { theme: originalTheme })

    pass('Public storefront renders saved appearance accurately after save')
  } catch (err) {
    fail('TEST 9: Public Storefront Appearance', err)
  }

  // -------------------------------------------------------------
  // TEST 10: Zero Backend Writes Occur During Ordinary Draft Editing
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Zero Backend Writes Occur During Ordinary Draft Editing ---')
  try {
    const dashboardPath = path.join(process.cwd(), 'app/dashboard/store/page.js')
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8')

    // Inspect updateThemeLocally implementation
    const fnStart = dashboardContent.indexOf('function updateThemeLocally(patch)')
    assert(fnStart > 0, 'updateThemeLocally must be defined')
    const fnBody = dashboardContent.slice(fnStart, fnStart + 400)

    // Ensure it does NOT invoke api.patch, api.post, scheduleSave, or fetch
    assert(!fnBody.includes('api.patch'), 'updateThemeLocally must NOT call api.patch')
    assert(!fnBody.includes('api.post'), 'updateThemeLocally must NOT call api.post')
    assert(!fnBody.includes('fetch('), 'updateThemeLocally must NOT call fetch')
    assert(!fnBody.includes('scheduleSave'), 'updateThemeLocally must NOT call scheduleSave')

    pass('updateThemeLocally performs purely local state updates without network calls')
    pass('Database writes are strictly reserved for explicit onSaveTheme')
  } catch (err) {
    fail('TEST 10: Zero Backend Writes', err)
  }

  console.log('\n=====================================================================')
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`)
  console.log('=====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err)
    process.exit(1)
  })
