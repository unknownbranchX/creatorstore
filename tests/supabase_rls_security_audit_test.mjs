import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { prisma } from '../lib/prisma.js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cqympezjstcsaofrzkqa.supabase.co'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function runRlsSecuritySuite() {
  console.log('=================================================================')
  console.log('🛡️ RUNNING COMPLETE SUPABASE RLS SECURITY & REMEDIATION TEST SUITE')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function pass(name) {
    passed++
    console.log(`  ✅ PASS: ${name}`)
  }

  function fail(name, err) {
    failed++
    console.error(`  ❌ FAIL: ${name}`, err)
  }

  // 1. Read and apply the migration SQL
  const migrationPath = path.join(process.cwd(), 'prisma/migrations/20261028235000_enable_supabase_rls_and_policies/migration.sql')
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  function splitSqlStatements(sql) {
    const statements = []
    let current = ''
    let inDollarBlock = false

    const lines = sql.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!inDollarBlock && (trimmed.startsWith('--') || trimmed === '')) {
        continue
      }
      if (!inDollarBlock && line.includes('$$')) {
        inDollarBlock = true
      } else if (inDollarBlock && line.includes('$$')) {
        inDollarBlock = false
      }
      current += line + '\n'
      if (!inDollarBlock && trimmed.endsWith(';')) {
        statements.push(current.trim())
        current = ''
      }
    }
    if (current.trim()) {
      statements.push(current.trim())
    }
    return statements
  }

  console.log('Applying RLS policies migration to database...')
  const statements = splitSqlStatements(migrationSql)
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt)
  }
  console.log(`Migration successfully applied (${statements.length} statements)!\n`)

  // Create isolated test data
  const timestamp = Date.now()
  let testCreatorA = await prisma.user.findFirst({
    where: { email: 'mohit.mr11082@gmail.com' }
  })
  if (!testCreatorA) testCreatorA = await prisma.user.findFirst()
  assert.ok(testCreatorA, 'Test creator A must exist')

  const draftProduct = await prisma.product.create({
    data: {
      creatorId: testCreatorA.id,
      title: `RLS Audit Draft Product ${timestamp}`,
      slug: `rls-draft-${timestamp}`,
      type: 'DIGITAL_DOWNLOAD',
      price: 999,
      status: 'DRAFT',
      storePublished: false,
    }
  })

  const publishedProduct = await prisma.product.create({
    data: {
      creatorId: testCreatorA.id,
      title: `RLS Audit Published Product ${timestamp}`,
      slug: `rls-published-${timestamp}`,
      type: 'DIGITAL_DOWNLOAD',
      price: 499,
      status: 'PUBLISHED',
      storePublished: true,
    }
  })

  const sensitiveOrder = await prisma.order.create({
    data: {
      id: crypto.randomUUID(),
      creatorId: testCreatorA.id,
      productId: publishedProduct.id,
      customerEmail: `secret_buyer_${timestamp}@example.test`,
      customerName: 'Secret Buyer',
      amount: 499,
      currency: 'INR',
      status: 'PENDING',
      paymentProvider: 'razorpay',
    }
  })

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Verify RLS is enabled on all 37 tables
    // -------------------------------------------------------------------------
    const rlsTables = await prisma.$queryRaw`
      SELECT c.relname as table_name, c.relrowsecurity as rls_enabled
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `
    const disabledTables = rlsTables.filter(t => !t.rls_enabled)
    assert.strictEqual(disabledTables.length, 0, `All tables must have RLS enabled. Disabled: ${disabledTables.map(t => t.table_name).join(', ')}`)
    assert.strictEqual(rlsTables.length, 37, 'Must have 37 tables in public schema')
    pass(`Test 1: All ${rlsTables.length} tables in public schema have RLS enabled (relrowsecurity = true)`)

    function assertNoDataLeaked(res, data, label) {
      if (res.status >= 400) {
        // PostgREST correctly returns permission denied (401/403/404)
        return true
      }
      assert.ok(Array.isArray(data), `${label}: Expected array response when status 200`)
      assert.strictEqual(data.length, 0, `${label}: Must expose 0 rows`)
      return true
    }

    // -------------------------------------------------------------------------
    // TEST 2: Anonymous PostgREST attempt to dump users table (Passwords/Emails)
    // -------------------------------------------------------------------------
    const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,email,password_hash&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const usersData = await usersRes.json().catch(() => null)
    assertNoDataLeaked(usersRes, usersData, 'users')
    pass('Test 2: Anonymous PostgREST request to /users blocked -> 0 users exposed')

    // -------------------------------------------------------------------------
    // TEST 3: Anonymous PostgREST attempt to dump orders table
    // -------------------------------------------------------------------------
    const ordersRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,status,customer_email,amount&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const ordersData = await ordersRes.json().catch(() => null)
    assertNoDataLeaked(ordersRes, ordersData, 'orders')
    pass('Test 3: Anonymous PostgREST request to /orders blocked -> 0 orders exposed')

    // -------------------------------------------------------------------------
    // TEST 4: Anonymous PostgREST attempt to dump entitlements table
    // -------------------------------------------------------------------------
    const entsRes = await fetch(`${SUPABASE_URL}/rest/v1/entitlements?select=id,customer_email,product_id,status&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const entsData = await entsRes.json().catch(() => null)
    assertNoDataLeaked(entsRes, entsData, 'entitlements')
    pass('Test 4: Anonymous PostgREST request to /entitlements blocked -> 0 entitlements exposed')

    // -------------------------------------------------------------------------
    // TEST 5: Anonymous PostgREST attempt to dump customers table
    // -------------------------------------------------------------------------
    const custsRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=id,name,email&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const custsData = await custsRes.json().catch(() => null)
    assertNoDataLeaked(custsRes, custsData, 'customers')
    pass('Test 5: Anonymous PostgREST request to /customers blocked -> 0 customers exposed')

    // -------------------------------------------------------------------------
    // TEST 6: Anonymous PostgREST attempt to dump auto_dm_queue_jobs table
    // -------------------------------------------------------------------------
    const queueRes = await fetch(`${SUPABASE_URL}/rest/v1/auto_dm_queue_jobs?select=id,payload&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const queueData = await queueRes.json().catch(() => null)
    assertNoDataLeaked(queueRes, queueData, 'auto_dm_queue_jobs')
    pass('Test 6: Anonymous PostgREST request to /auto_dm_queue_jobs blocked -> 0 queue jobs exposed')

    // -------------------------------------------------------------------------
    // TEST 7: Anonymous PostgREST attempt to dump payout_profiles (Banking details)
    // -------------------------------------------------------------------------
    const payoutRes = await fetch(`${SUPABASE_URL}/rest/v1/payout_profiles?select=id,account_number,upi_id,ifsc_code&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const payoutData = await payoutRes.json().catch(() => null)
    assertNoDataLeaked(payoutRes, payoutData, 'payout_profiles')
    pass('Test 7: Anonymous PostgREST request to /payout_profiles blocked -> 0 banking details exposed')

    // -------------------------------------------------------------------------
    // TEST 8: Anonymous PostgREST attempt to dump instagram_accounts (Access Tokens)
    // -------------------------------------------------------------------------
    const igRes = await fetch(`${SUPABASE_URL}/rest/v1/instagram_accounts?select=id,access_token&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const igData = await igRes.json().catch(() => null)
    assertNoDataLeaked(igRes, igData, 'instagram_accounts')
    pass('Test 8: Anonymous PostgREST request to /instagram_accounts blocked -> 0 tokens exposed')

    // -------------------------------------------------------------------------
    // TEST 9: Anonymous PostgREST products SELECT: Draft products invisible
    // -------------------------------------------------------------------------
    const draftCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${draftProduct.id}`, {
      headers: { apikey: ANON_KEY }
    })
    const draftCheckData = await draftCheckRes.json()
    assert.strictEqual(draftCheckData.length, 0, 'Draft product must NOT be returned to anonymous requests')
    pass('Test 9: Anonymous PostgREST cannot access unpublished draft products')

    // -------------------------------------------------------------------------
    // TEST 10: Anonymous PostgREST products SELECT: Published product visible
    // -------------------------------------------------------------------------
    const pubCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${publishedProduct.id}&select=id,title,status,store_published`, {
      headers: { apikey: ANON_KEY }
    })
    const pubCheckData = await pubCheckRes.json()
    assert.strictEqual(pubCheckData.length, 1, 'Published product should be visible to public catalog')
    assert.strictEqual(pubCheckData[0].id, publishedProduct.id)
    assert.strictEqual(pubCheckData[0].status, 'PUBLISHED')
    pass('Test 10: Anonymous PostgREST can legitimately view published storefront products')

    // -------------------------------------------------------------------------
    // TEST 11: Anonymous PostgREST attempt to INSERT an order (Fraudulent order creation)
    // -------------------------------------------------------------------------
    const fakeOrderId = crypto.randomUUID()
    const injectOrderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        id: fakeOrderId,
        creator_id: testCreatorA.id,
        product_id: publishedProduct.id,
        customer_email: 'attacker@evil.com',
        amount: 0,
        status: 'PAID',
      })
    })
    // Must be rejected with 401 or 403 / permission denied
    assert.ok(injectOrderRes.status >= 400, `Anonymous order insert must be rejected (Status: ${injectOrderRes.status})`)
    const verifyFakeOrder = await prisma.order.findUnique({ where: { id: fakeOrderId } })
    assert.strictEqual(verifyFakeOrder, null, 'Fake order must NOT exist in database')
    pass('Test 11: Anonymous PostgREST attempt to create orders is strictly rejected')

    // -------------------------------------------------------------------------
    // TEST 12: Anonymous PostgREST attempt to UPDATE order status (Payment tampering)
    // -------------------------------------------------------------------------
    const tamperRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${sensitiveOrder.id}`, {
      method: 'PATCH',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        status: 'PAID'
      })
    })
    const tamperedData = await tamperRes.json().catch(() => [])
    // Tamper attempt either returns 401/403 or affects 0 rows
    const refreshedOrder = await prisma.order.findUnique({ where: { id: sensitiveOrder.id } })
    assert.strictEqual(refreshedOrder.status, 'PENDING', 'Order status must remain PENDING; tampering rejected')
    pass('Test 12: Anonymous PostgREST attempt to modify order payment status is strictly rejected')

    // -------------------------------------------------------------------------
    // TEST 13: Anonymous PostgREST attempt to self-grant an entitlement
    // -------------------------------------------------------------------------
    const fakeEntId = crypto.randomUUID()
    const injectEntRes = await fetch(`${SUPABASE_URL}/rest/v1/entitlements`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        id: fakeEntId,
        product_id: publishedProduct.id,
        customer_email: 'attacker@evil.com',
        status: 'ACTIVE',
      })
    })
    assert.ok(injectEntRes.status >= 400, `Anonymous entitlement creation must be rejected (Status: ${injectEntRes.status})`)
    const verifyFakeEnt = await prisma.entitlement.findUnique({ where: { id: fakeEntId } })
    assert.strictEqual(verifyFakeEnt, null, 'Self-granted entitlement must NOT exist in database')
    pass('Test 13: Anonymous PostgREST attempt to self-grant entitlements is strictly rejected')

    // -------------------------------------------------------------------------
    // TEST 14: Anonymous PostgREST attempt to DELETE products
    // -------------------------------------------------------------------------
    const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${publishedProduct.id}`, {
      method: 'DELETE',
      headers: { apikey: ANON_KEY }
    })
    assert.ok(deleteRes.status >= 400 || deleteRes.status === 204)
    const verifyProductStillExists = await prisma.product.findUnique({ where: { id: publishedProduct.id } })
    assert.ok(verifyProductStillExists, 'Product must NOT be deleted by anonymous request')
    pass('Test 14: Anonymous PostgREST attempt to delete products is strictly rejected')

    // -------------------------------------------------------------------------
    // TEST 15: Anonymous PostgREST attempt to read _prisma_migrations
    // -------------------------------------------------------------------------
    const migRes = await fetch(`${SUPABASE_URL}/rest/v1/_prisma_migrations?select=*&limit=5`, {
      headers: { apikey: ANON_KEY }
    })
    const migData = await migRes.json().catch(() => [])
    assertNoDataLeaked(migRes, migData, '_prisma_migrations')
    pass('Test 15: Anonymous PostgREST request to _prisma_migrations blocked -> 0 rows exposed')

    // -------------------------------------------------------------------------
    // TEST 16: Public Form Submissions legitimate access
    // -------------------------------------------------------------------------
    const testForm = await prisma.form.create({
      data: {
        creatorId: testCreatorA.id,
        title: `RLS Audit Lead Form ${timestamp}`,
        status: 'ACTIVE',
      }
    })
    const formSubmitRes = await fetch(`${SUPABASE_URL}/rest/v1/form_submissions`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        form_id: testForm.id,
        creator_id: testCreatorA.id,
        name: 'Lead Prospect',
        email: `lead_${timestamp}@example.test`,
        message: 'Interested in digital product'
      })
    })
    assert.ok(formSubmitRes.status === 201 || formSubmitRes.status === 204, `Public form submission should succeed (Status: ${formSubmitRes.status})`)
    const verifyFormSub = await prisma.formSubmission.findFirst({
      where: { formId: testForm.id, email: `lead_${timestamp}@example.test` }
    })
    assert.ok(verifyFormSub, 'Lead submission row must exist in DB')
    pass('Test 16: Public lead-capture form submission functions legitimately via PostgREST')

    // Clean up test form
    await prisma.formSubmission.deleteMany({ where: { formId: testForm.id } }).catch(() => {})
    await prisma.form.delete({ where: { id: testForm.id } }).catch(() => {})

    // -------------------------------------------------------------------------
    // TEST 17: Server-side Prisma operations completely unaffected (rolbypassrls = true)
    // -------------------------------------------------------------------------
    const userCount = await prisma.user.count()
    const orderCount = await prisma.order.count()
    const entCount = await prisma.entitlement.count()
    assert.ok(userCount > 0)
    assert.ok(orderCount > 0)
    pass(`Test 17: Server-side Prisma connection operates seamlessly with bypassrls (${userCount} users, ${orderCount} orders, ${entCount} entitlements)`)

  } finally {
    // Clean up isolated test data
    await prisma.order.deleteMany({
      where: { id: sensitiveOrder.id }
    }).catch(() => {})

    await prisma.product.deleteMany({
      where: { id: { in: [draftProduct.id, publishedProduct.id] } }
    }).catch(() => {})
  }

  console.log('\n=================================================================')
  console.log(`📊 RLS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) process.exit(1)
}

runRlsSecuritySuite()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('RLS Security Suite Error:', e)
    process.exit(1)
  })
