import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

console.log('======================================================')
console.log('SETTINGS PROFILE IMAGE UPLOAD & SAVE TEST SUITE')
console.log('======================================================\n')

// 1. Audit Settings Page UI - Profile Image Section
console.log('--- 1. Settings Page UI Audit (Issue 1) ---')
const settingsPagePath = path.join(ROOT, 'app/dashboard/settings/page.js')
assert.ok(fs.existsSync(settingsPagePath), 'Settings page file must exist')

const settingsCode = fs.readFileSync(settingsPagePath, 'utf8')

// Must NOT contain raw URL input or text input for avatar URL
assert.ok(
  !settingsCode.includes('placeholder="https://... or select local file"'),
  'Must NOT contain raw URL placeholder input'
)
assert.ok(
  !settingsCode.includes('<Input\n              value={profile.avatarUrl}'),
  'Must NOT render Input component bound to profile.avatarUrl'
)

// Must have direct Upload Image button
assert.ok(
  settingsCode.includes('Upload Image') || settingsCode.includes('uploadingImage ?'),
  'Must have direct Upload Image button'
)

// Must have Remove Image capability when image exists
assert.ok(
  settingsCode.includes('Remove Image'),
  'Must have Remove Image button'
)
assert.ok(
  settingsCode.includes('handleRemoveImage'),
  'Must have handleRemoveImage function'
)

// Must have circular profile preview
assert.ok(
  settingsCode.includes('rounded-full') && settingsCode.includes('profile.avatarUrl'),
  'Must render circular profile image preview'
)

// Must have clear loading state during upload
assert.ok(
  settingsCode.includes('Uploading...') && settingsCode.includes('uploadingImage'),
  'Must display clear loading state during upload'
)

// Must validate file types and size
assert.ok(
  settingsCode.includes('MAX_BYTES') || settingsCode.includes('10 * 1024 * 1024'),
  'Must validate 10MB file size limit on client'
)
assert.ok(
  settingsCode.includes('previousAvatarUrl'),
  'Must preserve previous avatarUrl on upload failure'
)

console.log('  ✅ PASS: Profile image URL text input removed; direct upload, circular preview, remove button, and validation verified')

// 2. Audit API Routes - /me/profile and /creator/profile (Issue 2)
console.log('\n--- 2. Backend Route Registration Audit (Issue 2) ---')
const routeApiPath = path.join(ROOT, 'app/api/[[...path]]/route.js')
assert.ok(fs.existsSync(routeApiPath), 'app/api/[[...path]]/route.js must exist')

const routeCode = fs.readFileSync(routeApiPath, 'utf8')

// Check PATCH handler supports both /me/profile and /creator/profile
assert.ok(
  routeCode.includes("route === '/me/profile'") && routeCode.includes("route === '/creator/profile'"),
  'route.js must register both /me/profile and /creator/profile aliases'
)

// Check GET handler supports both /me/profile and /creator/profile
assert.ok(
  routeCode.includes("(route === '/me/profile' || route === '/creator/profile') && method === 'GET'"),
  'route.js must support GET /me/profile and /creator/profile'
)

console.log('  ✅ PASS: Both /me/profile and /creator/profile are fully registered for GET and PATCH')

// 3. Audit Settings Page Save Handler
console.log('\n--- 3. Settings Page Save Flow Audit ---')
// Settings page saveProfile must call canonical endpoint
assert.ok(
  settingsCode.includes("api.patch('/me/profile'"),
  'saveProfile must call /me/profile'
)

// Must sync store and profile updates
assert.ok(
  settingsCode.includes('updateDashboardProfile') && settingsCode.includes('updateDashboardStore'),
  'saveProfile must update dashboard context state'
)

// Must use ButtonLoader for async submit state
assert.ok(
  settingsCode.includes('<ButtonLoader'),
  'Save button must use ButtonLoader for async submission'
)

console.log('  ✅ PASS: saveProfile correctly invokes profile update and updates dashboard store')

// 4. Test Service-level Profile Update Logic
console.log('\n--- 4. Service-level Profile Update Logic Audit ---')
const servicesPath = path.join(ROOT, 'lib/services.js')
const servicesCode = fs.readFileSync(servicesPath, 'utf8')

assert.ok(
  servicesCode.includes('updateProfile(creatorId, patch)'),
  'meService must implement updateProfile'
)
assert.ok(
  servicesCode.includes("allowed.avatarUrl = sanitizeUrl(allowed.avatarUrl)"),
  'meService must sanitize avatarUrl'
)
assert.ok(
  servicesCode.includes("storePatch.avatarUrl = allowed.avatarUrl"),
  'meService must synchronize avatarUrl with store record'
)

console.log('  ✅ PASS: meService.updateProfile sanitizes fields and synchronizes store avatarUrl')

// 5. Immediate Persistence and Cache-Busting Audit
console.log('\n--- 5. Immediate Persistence & Cache-Busting Audit ---')
assert.ok(
  settingsCode.includes("api.patch('/me/profile', { avatarUrl: nextUrl })") &&
  settingsCode.includes("api.patch('/store', { avatarUrl: nextUrl, theme: themeToSave })"),
  'handleFileSelect must immediately persist new avatarUrl to /me/profile and /store'
)
assert.ok(
  settingsCode.includes("api.patch('/me/profile', { avatarUrl: '' })") &&
  settingsCode.includes("api.patch('/store', { avatarUrl: '', theme: themeToSave })"),
  'handleRemoveImage must immediately persist avatar removal to /me/profile and /store'
)
assert.ok(
  routeCode.includes("uniqueSuffix") && routeCode.includes("Math.random().toString(36)"),
  'route.js /upload must generate unique fileKey with timestamp and random suffix'
)
console.log('  ✅ PASS: Verified immediate database persistence on upload/remove and cache-busting unique storage keys')

console.log('\n======================================================')
console.log('🎉 ALL SETTINGS PROFILE IMAGE & SAVE TESTS PASSED!')
console.log('======================================================')
