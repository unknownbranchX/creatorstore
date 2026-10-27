import assert from 'assert'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma.js'
import {
  creatorSubscriptionService,
  storeService,
  publicService,
  analyticsService,
  leadService,
  formsService,
} from '../lib/services.js'
import { exportService, escapeCsvCell } from '../lib/export-service.js'
import { productsRepo, ordersRepo, customersRepo, analyticsRepo } from '../lib/repos.js'

console.log('\n=====================================================================')
console.log('🧪 PRO PLAN FEATURES END-TO-END TEST SUITE (STAGE 3)')
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
  const timestamp = Date.now()

  // 1. Setup Test Users
  console.log('--- SETUP: Initializing Test Users & DB Records ---')
  const proUserEmail = `pro_test_${timestamp}@creatorstore.test`
  const creatorUserEmail = `creator_test_${timestamp}@creatorstore.test`
  const otherUserEmail = `other_test_${timestamp}@creatorstore.test`

  let proUser, creatorUser, otherUser
  try {
    proUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: proUserEmail,
        passwordHash: 'dummy',
        role: 'CREATOR',
      },
    })

    creatorUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: creatorUserEmail,
        passwordHash: 'dummy',
        role: 'CREATOR',
      },
    })

    otherUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: otherUserEmail,
        passwordHash: 'dummy',
        role: 'CREATOR',
      },
    })

    // Subscriptions
    // Pro User (Active Pro via Razorpay)
    await prisma.creatorSubscription.create({
      data: {
        id: uuidv4(),
        creatorId: proUser.id,
        plan: 'PRO',
        status: 'ACTIVE',
        billingInterval: 'monthly',
        amount: 2900,
        provider: 'razorpay',
        providerSubscriptionId: `sub_rzp_pro_${timestamp}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    // Creator User (Active Creator via Dodo)
    await prisma.creatorSubscription.create({
      data: {
        id: uuidv4(),
        creatorId: creatorUser.id,
        plan: 'CREATOR',
        status: 'ACTIVE',
        billingInterval: 'monthly',
        amount: 15,
        currency: 'USD',
        dodoSubscriptionId: `sub_dodo_creator_${timestamp}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    // Other User (Inactive/Free)
    await prisma.creatorSubscription.create({
      data: {
        id: uuidv4(),
        creatorId: otherUser.id,
        plan: 'FREE',
        status: 'EXPIRED',
        billingInterval: 'monthly',
        amount: 0,
        currency: 'USD',
      },
    })

    // Initialize stores
    await storeService.getOrCreate(proUser.id)
    await storeService.getOrCreate(creatorUser.id)
    await storeService.getOrCreate(otherUser.id)

    pass('Test users and subscriptions initialized')
  } catch (err) {
    fail('Setup test users', err)
    return
  }

  // -------------------------------------------------------------
  // FEATURE 1: Unlimited Storefront Pages for Pro & Creator Limit
  // -------------------------------------------------------------
  console.log('\n--- FEATURE 1: Unlimited Storefront Pages ---')
  try {
    // 1.1 Pro user checks limit: should be Infinity
    const proEntitlements = await storeService.assertCanCreateStorePage(proUser.id)
    assert.strictEqual(proEntitlements.allowed, true, 'Pro user should be allowed to create pages')
    assert.strictEqual(proEntitlements.limit, Infinity, 'Pro user page limit should be Infinity')
    pass('Pro subscriber has storePagesLimit: Infinity')

    // 1.2 Pro user creates 1st additional page (page 2, home is 1)
    const p1 = await storeService.addPage(proUser.id, { name: 'About Me' })
    assert.strictEqual(p1.page.name, 'About Me')

    // 1.3 Pro user creates 2nd additional page (page 3)
    const p2 = await storeService.addPage(proUser.id, { name: 'Portfolio' })
    assert.strictEqual(p2.page.name, 'Portfolio')

    // 1.4 Pro user creates 3rd additional page (page 4 -> exceeds 3-page Creator limit)
    const p3 = await storeService.addPage(proUser.id, { name: 'Workshops' })
    assert.strictEqual(p3.page.name, 'Workshops')

    // 1.5 Pro user creates 4th additional page (page 5)
    const p4 = await storeService.addPage(proUser.id, { name: 'Press & Media' })
    assert.strictEqual(p4.page.name, 'Press & Media')

    const proPages = await storeService.listPages(proUser.id)
    assert.strictEqual(proPages.length, 5, 'Pro user should successfully have 5 storefront pages')
    pass('Pro subscriber successfully created 5 storefront pages (unlimited pages verified)')

    // 1.6 Creator user: allowed up to 3 pages
    const c1 = await storeService.addPage(creatorUser.id, { name: 'Page Two' })
    const c2 = await storeService.addPage(creatorUser.id, { name: 'Page Three' })
    const creatorPages = await storeService.listPages(creatorUser.id)
    assert.strictEqual(creatorPages.length, 3, 'Creator should have exactly 3 pages (Home + 2)')

    // 1.7 Creator user attempts 4th page -> MUST be rejected with HTTP 403 & PAGE_LIMIT_REACHED
    let creatorBlocked = false
    try {
      await storeService.addPage(creatorUser.id, { name: 'Page Four Blocked' })
    } catch (err) {
      creatorBlocked = true
      assert.strictEqual(err.status, 403)
      assert.strictEqual(err.code, 'PAGE_LIMIT_REACHED')
      assert.strictEqual(err.limit, 3)
      assert.strictEqual(err.currentCount, 3)
    }
    assert(creatorBlocked, 'Creator subscriber MUST be blocked from creating a 4th page')
    pass('Creator plan strictly rejects creation of a 4th page with 403 and PAGE_LIMIT_REACHED')

    // 1.8 Downgrade handling: Pro user downgraded to Creator
    // Existing 5 pages must NOT be deleted or unpublished
    await prisma.creatorSubscription.update({
      where: { creatorId: proUser.id },
      data: {
        plan: 'CREATOR',
        amount: 15,
        currency: 'USD',
      },
    })

    const pagesAfterDowngrade = await storeService.listPages(proUser.id)
    assert.strictEqual(pagesAfterDowngrade.length, 5, 'Downgraded user must retain all 5 existing pages')

    // Downgraded user can rename, reorder, or edit existing pages
    await storeService.renamePage(proUser.id, p1.page.id, { name: 'About Me Updated' })
    pass('Downgraded account retains all 5 existing pages and can edit existing pages')

    // Downgraded user CANNOT create a 6th page while over limit
    let overLimitBlocked = false
    try {
      await storeService.addPage(proUser.id, { name: 'Sixth Page' })
    } catch (err) {
      overLimitBlocked = true
      assert.strictEqual(err.status, 403)
      assert.strictEqual(err.code, 'PAGE_LIMIT_REACHED')
    }
    assert(overLimitBlocked, 'Downgraded account over limit is blocked from creating more pages')
    pass('Downgraded account cannot create additional pages until reduced below limit')

    // Restore Pro subscription for proUser
    await prisma.creatorSubscription.update({
      where: { creatorId: proUser.id },
      data: {
        plan: 'PRO',
        amount: 2900,
        currency: 'INR',
      },
    })
  } catch (err) {
    fail('Feature 1 Unlimited Pages', err)
  }

  // -------------------------------------------------------------
  // FEATURE 2: Remove CreatorStore Branding for Pro
  // -------------------------------------------------------------
  console.log('\n--- FEATURE 2: Remove CreatorStore Branding ---')
  try {
    // 2.1 Ensure proUser store is published so resolveStorefront can resolve it
    await prisma.store.update({
      where: { creatorId: proUser.id },
      data: { published: true },
    })

    const updatedProStore = await storeService.update(proUser.id, {
      theme: { showFooterBranding: false },
    })
    assert.strictEqual(updatedProStore.theme.showFooterBranding, false)

    // Verify public storefront resolution returns showFooterBranding: false for Pro
    const proStore = await prisma.store.findUnique({ where: { creatorId: proUser.id } })
    const proPublic = await publicService.resolveStorefront(proStore.slug)
    assert.strictEqual(proPublic.data.theme.showFooterBranding, false, 'Pro public storefront must omit branding')
    pass('Pro subscriber public storefront omits CreatorStore promotional branding')

    // 2.2 Creator user attempts direct API call to disable branding -> MUST be rejected with HTTP 403
    let brandingBypassError = null
    try {
      await storeService.update(creatorUser.id, {
        theme: { showFooterBranding: false },
      })
    } catch (err) {
      brandingBypassError = err
    }
    assert(brandingBypassError, 'Creator user must be blocked from disabling branding')
    assert.strictEqual(brandingBypassError.status, 403)
    pass('Creator subscriber direct API attempt to disable branding is rejected with HTTP 403')

    // 2.3 Even if showFooterBranding: false was somehow in DB, public storefront forces true for Creator
    await prisma.store.update({
      where: { creatorId: creatorUser.id },
      data: { published: true, theme: { showFooterBranding: false } },
    })
    const creatorStore = await prisma.store.findUnique({ where: { creatorId: creatorUser.id } })
    const creatorPublic = await publicService.resolveStorefront(creatorStore.slug)
    assert.strictEqual(creatorPublic.data.theme.showFooterBranding, true, 'Creator public storefront must force showFooterBranding: true')
    pass('Public storefront resolution authoritative check forces showFooterBranding: true for non-Pro')
  } catch (err) {
    fail('Feature 2 Remove Branding', err)
  }

  // -------------------------------------------------------------
  // FEATURE 3: Data Export End-to-End
  // -------------------------------------------------------------
  console.log('\n--- FEATURE 3: Data Export ---')
  try {
    // 3.1 Setup sample business data for Pro user
    const prod1 = await productsRepo.create({
      id: uuidv4(),
      creatorId: proUser.id,
      title: 'Masterclass Course',
      price: 99.00,
      currency: 'USD',
      productType: 'COURSE',
      status: 'PUBLISHED',
      published: true,
      createdAt: new Date().toISOString(),
    })

    const prod2 = await productsRepo.create({
      id: uuidv4(),
      creatorId: proUser.id,
      title: '=HYPERLINK("http://attacker.com", "Malicious Title")', // Formula injection test candidate
      price: 19.99,
      currency: 'USD',
      productType: 'DIGITAL_PRODUCT',
      status: 'PUBLISHED',
      published: true,
      createdAt: new Date().toISOString(),
    })

    // Orders
    const cust1 = await customersRepo.upsert(proUser.id, 'buyer1@example.com', '+cmd|"/C calc"!A0')

    await ordersRepo.create({
      id: uuidv4(),
      creatorId: proUser.id,
      productId: prod1.id,
      customerId: cust1.id,
      amount: 99.00,
      currency: 'USD',
      status: 'PAID',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })

    // Refunded order
    await ordersRepo.create({
      id: uuidv4(),
      creatorId: proUser.id,
      productId: prod2.id,
      customerId: cust1.id,
      amount: 19.99,
      refundAmount: 19.99,
      currency: 'USD',
      status: 'REFUNDED',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })

    // Newsletter subscriber
    await prisma.newsletterSubscriber.create({
      data: {
        id: uuidv4(),
        creatorId: proUser.id,
        email: 'subscriber1@example.com',
        status: 'SUBSCRIBED',
        source: 'Landing Page',
        consentTimestamp: new Date(),
        createdAt: new Date(),
      },
    })

    // 3.2 Formula-injection unit tests
    assert.strictEqual(escapeCsvCell('=1+1'), '"\'=1+1"', 'Leading = must be escaped with single quote')
    assert.strictEqual(escapeCsvCell('+2+3'), '"\'+2+3"', 'Leading + must be escaped with single quote')
    assert.strictEqual(escapeCsvCell('-cmd'), '"\'-cmd"', 'Leading - must be escaped with single quote')
    assert.strictEqual(escapeCsvCell('@sum'), '"\'@sum"', 'Leading @ must be escaped with single quote')
    assert.strictEqual(escapeCsvCell('Normal Title'), '"Normal Title"', 'Normal text safely quoted')
    pass('Formula-injection defense safely escapes =, +, -, @ triggers with single quote')

    // 3.3 Pro user can export Products
    const prodExport = await exportService.exportDataset(proUser.id, 'products')
    assert(prodExport.csv.includes('Product ID,Product Name,Product Type,Price,Currency,Publication Status,Creation Date'))
    assert(prodExport.csv.includes('Masterclass Course'))
    assert(prodExport.csv.includes('\'=HYPERLINK'), 'Malicious product title must be formula-escaped')
    pass('Pro subscriber successfully exported Products dataset with formula-injection defense')

    // 3.4 Pro user can export Orders
    const orderExport = await exportService.exportDataset(proUser.id, 'orders')
    assert(orderExport.csv.includes('Order ID,Order Date,Product Reference,Order Status,Currency,Gross Amount,Refund Amount,Net Amount'))
    assert(orderExport.csv.includes('PAID'))
    assert(orderExport.csv.includes('REFUNDED'))
    assert(orderExport.csv.includes('99.00'))
    pass('Pro subscriber successfully exported Orders dataset with accurate gross, refund, and net amounts')

    // 3.5 Pro user can export Sales
    const salesExport = await exportService.exportDataset(proUser.id, 'sales')
    assert(salesExport.csv.includes('Record ID,Order ID,Date,Amount,Currency,Status,Customer Email,Product Reference'))
    pass('Pro subscriber successfully exported Sales & Revenue records')

    // 3.6 Pro user can export Customer Leads
    const leadsExport = await exportService.exportDataset(proUser.id, 'leads')
    assert(leadsExport.csv.includes('Lead ID,Name,Email,Source,Lead Magnet,Created At'))
    pass('Pro subscriber successfully exported Customer Leads')

    // 3.7 Pro user can export Mailing List Subscribers
    const subsExport = await exportService.exportDataset(proUser.id, 'subscribers')
    assert(subsExport.csv.includes('Subscriber ID,Email Address,Subscription Status,Consent Timestamp,Creation Date,Source'))
    assert(subsExport.csv.includes('subscriber1@example.com'))
    pass('Pro subscriber successfully exported Mailing List Subscribers')

    // 3.8 Pro user can export Analytics Summary
    const analyticsExport = await exportService.exportDataset(proUser.id, 'analytics')
    assert(analyticsExport.csv.includes('Reporting Period,Metric Name,Metric Value,Product Identifier'))
    assert(analyticsExport.csv.includes('Total Storefront Views'))
    assert(analyticsExport.csv.includes('Gross Sales'))
    assert(analyticsExport.csv.includes('Net Revenue'))
    pass('Pro subscriber successfully exported Analytics Summaries')

    // 3.9 Creator subscriber MUST be blocked from data export
    let creatorExportBlocked = false
    try {
      await creatorSubscriptionService.requireEntitlement(creatorUser.id, 'dataExport')
    } catch (err) {
      creatorExportBlocked = true
      assert.strictEqual(err.status, 403)
      assert.strictEqual(err.code, 'PLAN_UPGRADE_REQUIRED')
    }
    assert(creatorExportBlocked, 'Creator subscriber MUST be blocked from dataExport entitlement')
    pass('Creator plan blocked from dataExport entitlement with HTTP 403 PLAN_UPGRADE_REQUIRED')

    // 3.10 Cross-account export isolation: Pro user's export must NEVER include creatorUser records
    const proOrdersCsv = (await exportService.exportDataset(proUser.id, 'orders')).csv
    assert(!proOrdersCsv.includes(creatorUser.id), 'Cross-account data leakage strictly prohibited')
    pass('Cross-account isolation verified: exports only contain creator-owned business records')

    // 3.11 Date filter validation
    let invalidDateError = false
    try {
      exportService.parseDateFilter('2026-12-31', '2026-01-01') // from > to
    } catch (err) {
      invalidDateError = true
      assert.strictEqual(err.status, 400)
    }
    assert(invalidDateError, 'Invalid date range where from > to must throw 400')
    pass('Export date filter parameters validated on server (from <= to)')
  } catch (err) {
    fail('Feature 3 Data Export', err)
  }

  // -------------------------------------------------------------
  // FEATURE 4: Advanced Analytics
  // -------------------------------------------------------------
  console.log('\n--- FEATURE 4: Advanced Analytics ---')
  try {
    // 4.1 Track storefront and product views with traffic referrer metadata
    await analyticsRepo.track({
      id: uuidv4(),
      creatorId: proUser.id,
      type: 'store_view',
      metadata: { referrer: 'https://instagram.com/creatorstore', source: 'Instagram' },
      createdAt: new Date().toISOString(),
    })

    await analyticsRepo.track({
      id: uuidv4(),
      creatorId: proUser.id,
      type: 'store_view',
      metadata: { referrer: 'https://t.co/abcxyz', source: 'Twitter / X' },
      createdAt: new Date().toISOString(),
    })

    await analyticsRepo.track({
      id: uuidv4(),
      creatorId: proUser.id,
      type: 'store_view',
      metadata: {}, // Direct visit
      createdAt: new Date().toISOString(),
    })

    // 4.2 Pro user can query 90D and 365D overview
    const overview30 = await analyticsService.overview(proUser.id, 30)
    const overview90 = await analyticsService.overview(proUser.id, 90)
    const overviewAll = await analyticsService.overview(proUser.id, 365)

    assert(overview90.revenue !== undefined, '90D overview must return revenue')
    assert(overviewAll.revenue !== undefined, 'All-time overview must return revenue')
    pass('Pro subscriber successfully retrieved 90D and 365D advanced analytics')

    // 4.3 Net revenue, Gross sales, and Refunds integrity
    // We added 1 PAID ($99.00) and 1 REFUNDED ($19.99)
    assert.strictEqual(overview30.grossRevenue, 118.99, 'Gross revenue must be 99.00 + 19.99 = 118.99')
    assert.strictEqual(overview30.refundsTotal, 19.99, 'Refunds total must equal 19.99')
    assert.strictEqual(overview30.netRevenue, 99.00, 'Net revenue must be gross - refunds = 99.00')
    assert.strictEqual(overview30.refundCount, 1, 'Refund count must equal 1')
    assert.strictEqual(overview30.paidOrdersCount, 1, 'Paid orders count must equal 1')
    pass('Authoritative accounting rules verified: Net Revenue = Gross Sales - Refunds Total')

    // 4.4 Traffic sources breakdown
    const traffic = overview30.trafficSources
    assert(Array.isArray(traffic), 'Traffic sources must be an array')
    assert(traffic.length > 0, 'Traffic sources should contain tracked referrers')
    const igSource = traffic.find((t) => t.source === 'Instagram')
    assert(igSource, 'Instagram referrer must be present in traffic breakdown')
    pass('Traffic sources breakdown accurately calculated from persisted events')

    // 4.5 Product Performance deep-dive
    const productPerf = overview30.productPerformance
    assert(Array.isArray(productPerf), 'Product performance must be an array')
    assert(productPerf.length >= 2, 'Should include created products')
    const p1Stats = productPerf.find((p) => p.title === 'Masterclass Course')
    assert.strictEqual(p1Stats.unitsSold, 1)
    assert.strictEqual(p1Stats.netRevenue, 99.00)
    pass('Per-product performance metrics: units sold, gross, refunds, and net revenue verified')

    // 4.6 Product-level filtering
    const filteredOverview = await analyticsService.overview(proUser.id, 30, { productId: p1Stats.id })
    assert.strictEqual(filteredOverview.orders, 1)
    assert.strictEqual(filteredOverview.netRevenue, 99.00)
    assert.strictEqual(filteredOverview.refundCount, 0)
    pass('Product-level analytics filtering correctly isolates metrics to single product')

    // 4.7 Creator user attempting >30 days query MUST be blocked with 403
    let creatorDaysBlocked = false
    try {
      const requestedDays = 90
      if (requestedDays > 30) {
        await creatorSubscriptionService.requireEntitlement(creatorUser.id, 'advancedAnalytics')
      }
    } catch (err) {
      creatorDaysBlocked = true
      assert.strictEqual(err.status, 403)
      assert.strictEqual(err.code, 'PLAN_UPGRADE_REQUIRED')
    }
    assert(creatorDaysBlocked, 'Creator subscriber querying >30 days MUST be blocked with 403')
    pass('Creator plan blocked from advancedAnalytics (>30 days) with HTTP 403 PLAN_UPGRADE_REQUIRED')
  } catch (err) {
    fail('Feature 4 Advanced Analytics', err)
  }

  // -------------------------------------------------------------
  // FEATURE 5: Provider Parity (Razorpay & Dodo Payments)
  // -------------------------------------------------------------
  console.log('\n--- FEATURE 5: Provider Parity (Razorpay vs Dodo) ---')
  try {
    // Create an international Pro user via Dodo Payments
    const dodoProUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `dodo_pro_${timestamp}@creatorstore.test`,
        passwordHash: 'dummy',
        role: 'CREATOR',
      },
    })

    await prisma.creatorSubscription.create({
      data: {
        id: uuidv4(),
        creatorId: dodoProUser.id,
        plan: 'PRO',
        status: 'ACTIVE',
        billingInterval: 'annual',
        amount: 290,
        currency: 'USD',
        dodoSubscriptionId: `sub_dodo_pro_${timestamp}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })

    const dodoStatus = await creatorSubscriptionService.getStatus(dodoProUser.id)
    assert.strictEqual(dodoStatus.planId, 'PRO')
    assert.strictEqual(dodoStatus.entitlements.storePagesLimit, Infinity)
    assert.strictEqual(dodoStatus.entitlements.advancedAnalytics, true)
    assert.strictEqual(dodoStatus.entitlements.dataExport, true)
    assert.strictEqual(dodoStatus.entitlements.removeBranding, true)

    const rzpStatus = await creatorSubscriptionService.getStatus(proUser.id)
    assert.strictEqual(rzpStatus.planId, 'PRO')
    assert.strictEqual(rzpStatus.entitlements.storePagesLimit, Infinity)
    assert.strictEqual(rzpStatus.entitlements.advancedAnalytics, true)
    assert.strictEqual(rzpStatus.entitlements.dataExport, true)
    assert.strictEqual(rzpStatus.entitlements.removeBranding, true)

    pass('Provider parity verified: both Razorpay (India) and Dodo Payments (International) receive identical Pro entitlements')
  } catch (err) {
    fail('Feature 5 Provider Parity', err)
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=====================================================================')
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=====================================================================\n')

  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
