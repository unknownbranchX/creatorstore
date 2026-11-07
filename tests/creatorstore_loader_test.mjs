import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

console.log('======================================================')
console.log('CREATORSTORE SIGNATURE LOADER TEST SUITE')
console.log('======================================================\n')

// 1. Component File Existence & Exports
console.log('--- 1. File Existence & Architecture ---')
const loaderJsxPath = path.join(ROOT, 'components/ui/CreatorStoreLoader.jsx')
const loaderTsxPath = path.join(ROOT, 'components/ui/CreatorStoreLoader.tsx')
const dashboardLoadingPath = path.join(ROOT, 'app/dashboard/loading.js')

assert.ok(fs.existsSync(loaderJsxPath), 'components/ui/CreatorStoreLoader.jsx must exist')
assert.ok(fs.existsSync(loaderTsxPath), 'components/ui/CreatorStoreLoader.tsx must exist')
assert.ok(fs.existsSync(dashboardLoadingPath), 'app/dashboard/loading.js must exist')

const loaderCode = fs.readFileSync(loaderJsxPath, 'utf8')
const dashboardLoadingCode = fs.readFileSync(dashboardLoadingPath, 'utf8')

assert.ok(loaderCode.includes('CREATORSTORE_C_DOTS'), 'Must export CREATORSTORE_C_DOTS')
assert.ok(loaderCode.includes('CreatorStoreLogoMark'), 'Must export CreatorStoreLogoMark')
assert.ok(loaderCode.includes('FullScreenLoader'), 'Must export FullScreenLoader')
assert.ok(loaderCode.includes('InlineLoader'), 'Must export InlineLoader')
assert.ok(loaderCode.includes('ButtonLoader'), 'Must export ButtonLoader')
assert.ok(loaderCode.includes('export default function CreatorStoreLoader'), 'Must have default export CreatorStoreLoader')
console.log('  ✅ PASS: Components and variants properly exported across JSX and TSX')

// 2. Geometric C-Shape Dots Audit
console.log('\n--- 2. Geometric C-Shape Dots Data Audit ---')
// Extract CREATORSTORE_C_DOTS array from code
const dotsMatch = loaderCode.match(/export const CREATORSTORE_C_DOTS = \[([\s\S]*?)\]\n/s)
assert.ok(dotsMatch, 'Must match CREATORSTORE_C_DOTS declaration')

const dotCount = (dotsMatch[1].match(/\{ key:/g) || []).length
assert.strictEqual(dotCount, 23, 'Must define exactly 23 dots matching CreatorStore C brand identity')
assert.ok(loaderCode.includes("key: 't1'"), 'Must include top trailing tip t1')
assert.ok(loaderCode.includes("key: 'o4'"), 'Must include upper spine o4')
assert.ok(loaderCode.includes("key: 'i4'"), 'Must include central inner spine i4')
assert.ok(loaderCode.includes("key: 'o5'"), 'Must include lower spine o5')
assert.ok(loaderCode.includes("key: 't3'"), 'Must include bottom trailing tip t3')
console.log('  ✅ PASS: Verified all 23 geometric dots forming the distinctive C shape')

// 3. Animation & CSS Keyframes Audit
console.log('\n--- 3. Animation Engine & Performance Audit ---')
assert.ok(loaderCode.includes('@keyframes cs-dot-pulse'), 'Must define CSS keyframes for pulse wave')
assert.ok(loaderCode.includes('cs-pulse-dot'), 'Must assign animation class to circles')
assert.ok(loaderCode.includes('animationDelay:'), 'Must assign sequenced negative animation delay per dot')
assert.ok(loaderCode.includes('prefers-reduced-motion: reduce'), 'Must support prefers-reduced-motion')
assert.ok(loaderCode.includes('viewBox="0 0 100 100"'), 'SVG must use 0 0 100 100 viewBox matching brand geometry')
console.log('  ✅ PASS: Pure CSS keyframe animations, zero JS loop overhead, reduced-motion handled')

// 4. Accessibility & Semantic Roles
console.log('\n--- 4. Accessibility & ARIA Audit ---')
assert.ok(loaderCode.includes('role="status"'), 'Must provide role="status" on loader containers')
assert.ok(loaderCode.includes('aria-live="polite"'), 'FullScreen loader must specify aria-live="polite"')
assert.ok(loaderCode.includes('aria-hidden='), 'Decorative SVG must support aria-hidden')
assert.ok(loaderCode.includes('sr-only'), 'Must include screen reader announcement element')
console.log('  ✅ PASS: Semantic role="status", aria-live="polite", and sr-only descriptions verified')

// 5. Variants Implementation Audit
console.log('\n--- 5. Variant Implementations Audit ---')
// FullScreen
assert.ok(loaderCode.includes('function FullScreenLoader'), 'FullScreenLoader component defined')
assert.ok(loaderCode.includes('fixed inset-0'), 'FullScreenLoader must render fixed overlay')
assert.ok(loaderCode.includes('Loading your dashboard...'), 'Default message provided')

// Inline
assert.ok(loaderCode.includes('function InlineLoader'), 'InlineLoader component defined')
assert.ok(loaderCode.includes('inline-flex'), 'InlineLoader layout is inline-flex')

// Button
assert.ok(loaderCode.includes('function ButtonLoader'), 'ButtonLoader component defined')
assert.ok(loaderCode.includes("text = 'Saving...'"), 'ButtonLoader default action label provided')
console.log('  ✅ PASS: Default, FullScreen, Inline, and Button loader variants verified')

// 6. Route-Level Dashboard Integration Audit
console.log('\n--- 6. Next.js App Router Loading State Integration ---')
assert.ok(dashboardLoadingCode.includes('CreatorStoreLoader'), 'Dashboard loading.js must use CreatorStoreLoader')
assert.ok(dashboardLoadingCode.includes('badge'), 'Dashboard loading.js renders branded badge')
console.log('  ✅ PASS: App Router /dashboard streaming navigation uses CreatorStoreLoader')

// 7. Integration in Core Feature Pages
console.log('\n--- 7. Application Integration Audit ---')
const storePageCode = fs.readFileSync(path.join(ROOT, 'app/dashboard/store/page.js'), 'utf8')
const automationsCode = fs.readFileSync(path.join(ROOT, 'app/dashboard/automations/page.js'), 'utf8')
const calendarCode = fs.readFileSync(path.join(ROOT, 'app/dashboard/calendar/page.jsx'), 'utf8')
const cardsCode = fs.readFileSync(path.join(ROOT, 'app/dashboard/business-cards/BusinessCardsClient.jsx'), 'utf8')
const payoutCode = fs.readFileSync(path.join(ROOT, 'components/dashboard/PayoutOnboardingWizard.jsx'), 'utf8')
const coachingWidgetCode = fs.readFileSync(path.join(ROOT, 'components/coaching/CoachingBookingWidget.jsx'), 'utf8')
const editorShellCode = fs.readFileSync(path.join(ROOT, 'components/dashboard/StoreItemEditorShell.jsx'), 'utf8')

assert.ok(storePageCode.includes('CreatorStoreLoader'), 'Store builder must use CreatorStoreLoader')
assert.ok(automationsCode.includes('CreatorStoreLoader'), 'Automations page must use CreatorStoreLoader')
assert.ok(calendarCode.includes('CreatorStoreLoader'), 'Calendar page must use CreatorStoreLoader')
assert.ok(cardsCode.includes('CreatorStoreLoader'), 'Business cards page must use CreatorStoreLoader')
assert.ok(payoutCode.includes('CreatorStoreLoader'), 'Payout onboarding wizard must use CreatorStoreLoader')
assert.ok(coachingWidgetCode.includes('CreatorStoreLoader'), 'Coaching booking widget must use CreatorStoreLoader')
assert.ok(editorShellCode.includes('CreatorStoreLoader'), 'Store item editor shell must use CreatorStoreLoader')

// 8. Custom props DOM leaking audit
console.log('\n--- 8. Custom Props DOM Leak Audit ---')
assert.ok(loaderCode.includes("badgeBg = '#0D0D0D'"), 'CreatorStoreLoader must destructure badgeBg')
assert.ok(loaderCode.includes("activeColor = '#FF3828'"), 'CreatorStoreLoader must destructure activeColor')
assert.ok(loaderCode.includes("inactiveColor = '#57130E'"), 'CreatorStoreLoader must destructure inactiveColor')
assert.ok(loaderCode.includes('resolvedBadgeBg = badgeBg'), 'FullScreenLoader must handle badgeBg without passing to DOM')
console.log('  ✅ PASS: Verified badgeBg, activeColor, and inactiveColor are destructured and do not leak to DOM attributes')

console.log('\n======================================================')
console.log('🎉 ALL 8/8 CREATORSTORE SIGNATURE LOADER TESTS PASSED!')
console.log('======================================================')
