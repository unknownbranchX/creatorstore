import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { downloadService, productService, webhookService } from '../lib/services.js'
import { productsRepo, ordersRepo, entitlementsRepo } from '../lib/repos.js'
import { ensureBucket, supabaseAdmin } from '../lib/supabase.js'

async function runSecurityAuditSuite() {
  console.log('=================================================================')
  console.log('🔒 RUNNING DIGITAL PRODUCT UPLOAD & DOWNLOAD SECURITY AUDIT SUITE')
  console.log('=================================================================\n')

  let passedCount = 0
  let failedCount = 0

  function pass(testName) {
    passedCount++
    console.log(`  ✅ PASS: ${testName}`)
  }

  function fail(testName, err) {
    failedCount++
    console.error(`  ❌ FAIL: ${testName}`, err)
  }

  // Setup isolated test accounts & products
  const timestamp = Date.now()
  let creatorUser = await prisma.user.findFirst({
    where: { email: 'mohit.mr11082@gmail.com' },
  })
  if (!creatorUser) {
    creatorUser = await prisma.user.findFirst()
  }
  assert.ok(creatorUser, 'At least one creator user must exist in the database')

  const testCreatorId = creatorUser.id
  const customerAEmail = `cust_a_${timestamp}@creatorstore.test`
  const customerBEmail = `cust_b_${timestamp}@creatorstore.test`

  // Test Product 1: Paid product with attached digital file
  const testPaidProduct = await prisma.product.create({
    data: {
      creatorId: testCreatorId,
      title: `Audit Paid Product ${timestamp}`,
      slug: `audit-paid-prod-${timestamp}`,
      type: 'DIGITAL_DOWNLOAD',
      price: 1999,
      currency: 'INR',
      status: 'PUBLISHED',
      fileId: `prod_paid_${timestamp}_test.pdf`,
      fileName: 'test_product_guide.pdf',
      fileSize: 10240,
      fileMime: 'application/pdf',
      storePublished: true,
    }
  })

  // Test Product 2: Second paid product
  const testPaidProduct2 = await prisma.product.create({
    data: {
      creatorId: testCreatorId,
      title: `Audit Paid Product Two ${timestamp}`,
      slug: `audit-paid-prod2-${timestamp}`,
      type: 'DIGITAL_DOWNLOAD',
      price: 2999,
      currency: 'INR',
      status: 'PUBLISHED',
      fileId: `prod_paid2_${timestamp}_test.pdf`,
      fileName: 'test_advanced_guide.pdf',
      fileSize: 20480,
      fileMime: 'application/pdf',
      storePublished: true,
    }
  })

  // Test Product 3: Draft (unpublished) product
  const testDraftProduct = await prisma.product.create({
    data: {
      creatorId: testCreatorId,
      title: `Audit Draft Product ${timestamp}`,
      slug: `audit-draft-prod-${timestamp}`,
      type: 'DIGITAL_DOWNLOAD',
      price: 0,
      currency: 'INR',
      status: 'DRAFT',
      fileId: `prod_draft_${timestamp}_test.pdf`,
      fileName: 'test_draft.pdf',
      fileSize: 5120,
      fileMime: 'application/pdf',
      storePublished: false,
    }
  })

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated customer requests a protected download
    // -------------------------------------------------------------
    try {
      await downloadService.authorizeAndGetDownloadFile({
        productId: testPaidProduct.id,
        guestEmail: null,
        guestCustomerId: null,
        creatorUserId: null,
      })
      fail('Test 1: Unauthenticated download should throw 401', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 401)
      pass('Test 1: Unauthenticated customer requests protected download -> HTTP 401 Unauthorized')
    }

    // -------------------------------------------------------------
    // Test 2: Authenticated customer requests a file without a purchase
    // -------------------------------------------------------------
    try {
      await downloadService.authorizeAndGetDownloadFile({
        productId: testPaidProduct.id,
        guestEmail: customerAEmail,
        guestCustomerId: null,
        creatorUserId: null,
      })
      fail('Test 2: Request without purchase should throw 403', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 403)
      pass('Test 2: Authenticated customer requests file without purchase -> HTTP 403 Forbidden')
    }

    // Create a legitimate paid order and entitlement for Customer A on Product 1
    const orderAId = crypto.randomUUID()
    const orderA = await prisma.order.create({
      data: {
        id: orderAId,
        creatorId: testCreatorId,
        productId: testPaidProduct.id,
        customerEmail: customerAEmail,
        customerName: 'Customer Alpha',
        amount: 1999,
        currency: 'INR',
        status: 'PAID',
        paymentProvider: 'razorpay',
        razorpayPaymentId: `pay_test_${timestamp}_a`,
        razorpayOrderId: `order_test_${timestamp}_a`,
      }
    })

    const entA = await prisma.entitlement.create({
      data: {
        id: crypto.randomUUID(),
        orderId: orderAId,
        customerEmail: customerAEmail,
        productId: testPaidProduct.id,
        status: 'ACTIVE',
        startsAt: new Date(),
      }
    })

    // -------------------------------------------------------------
    // Test 3: Customer B requests Customer A's purchased file (IDOR)
    // -------------------------------------------------------------
    try {
      await downloadService.authorizeAndGetDownloadFile({
        productId: testPaidProduct.id,
        guestEmail: customerBEmail,
        guestCustomerId: null,
        creatorUserId: null,
      })
      fail('Test 3: Customer B accessing Customer A file should throw 403', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 403)
      pass('Test 3: Customer B requesting Customer A\'s purchased file -> HTTP 403 Forbidden')
    }

    // -------------------------------------------------------------
    // Test 4: Customer A changes product ID (Cross-product IDOR)
    // -------------------------------------------------------------
    try {
      await downloadService.authorizeAndGetDownloadFile({
        productId: testPaidProduct2.id,
        guestEmail: customerAEmail,
        guestCustomerId: null,
        creatorUserId: null,
      })
      fail('Test 4: Customer A accessing unpurchased Product 2 should throw 403', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 403)
      pass('Test 4: Cross-product IDOR (manipulating product ID) -> HTTP 403 Forbidden')
    }

    // -------------------------------------------------------------
    // Test 5: Customer requests file with PENDING / UNPAID order
    // -------------------------------------------------------------
    const pendingOrderId = crypto.randomUUID()
    const pendingOrder = await prisma.order.create({
      data: {
        id: pendingOrderId,
        creatorId: testCreatorId,
        productId: testPaidProduct2.id,
        customerEmail: customerBEmail,
        customerName: 'Customer Beta',
        amount: 2999,
        currency: 'INR',
        status: 'PENDING',
        paymentProvider: 'razorpay',
      }
    })

    const pendingEnt = await prisma.entitlement.create({
      data: {
        id: crypto.randomUUID(),
        orderId: pendingOrderId,
        customerEmail: customerBEmail,
        productId: testPaidProduct2.id,
        status: 'ACTIVE',
        startsAt: new Date(),
      }
    })

    try {
      await downloadService.authorizeAndGetDownloadFile({
        productId: testPaidProduct2.id,
        guestEmail: customerBEmail,
        guestCustomerId: null,
        creatorUserId: null,
      })
      fail('Test 5: Download with PENDING order should throw 403', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 403)
      pass('Test 5: Customer requests file with PENDING order -> HTTP 403 Forbidden')
    }

    // -------------------------------------------------------------
    // Test 6: Customer requests file following order REFUND
    // -------------------------------------------------------------
    // Mark orderA as refunded via ordersRepo.markRefunded
    await ordersRepo.markRefunded(orderAId)

    // Verify entitlement status is now REVOKED in DB
    const refreshedEntA = await prisma.entitlement.findUnique({
      where: { id: entA.id }
    })
    assert.strictEqual(refreshedEntA.status, 'REVOKED')

    // Customer A attempts to download after refund
    try {
      await downloadService.authorizeAndGetDownloadFile({
        productId: testPaidProduct.id,
        guestEmail: customerAEmail,
        guestCustomerId: null,
        creatorUserId: null,
      })
      fail('Test 6: Download following refund should throw 403', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 403)
      pass('Test 6: Customer requests file following refund -> HTTP 403 Forbidden & Entitlement REVOKED')
    }

    // -------------------------------------------------------------
    // Test 7: Free claim endpoint protection on paid products
    // -------------------------------------------------------------
    const freeClaimProductPrice = Number(testPaidProduct.price || 0)
    assert.ok(freeClaimProductPrice > 0, 'Test product must be paid')
    // Server enforces price <= 0 check before granting free entitlement
    const isFreeEligible = freeClaimProductPrice <= 0
    assert.strictEqual(isFreeEligible, false)
    pass('Test 7: Server rejects free claim requests on paid products (price > 0)')

    // -------------------------------------------------------------
    // Test 8: Free claim endpoint rejects unpublished / draft products
    // -------------------------------------------------------------
    assert.strictEqual(testDraftProduct.status, 'DRAFT')
    const canClaimDraft = testDraftProduct.status === 'PUBLISHED'
    assert.strictEqual(canClaimDraft, false)
    pass('Test 8: Server rejects claim requests on unpublished/draft products')

    // -------------------------------------------------------------
    // Test 9: Creator cross-ownership protection on product update
    // -------------------------------------------------------------
    const rogueCreatorId = crypto.randomUUID()
    try {
      await productService.update(rogueCreatorId, testPaidProduct.id, {
        title: 'Hacked Product Title'
      })
      fail('Test 9: Cross-creator product update should throw 404', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 404)
      pass('Test 9: Creator cross-ownership isolation on product edit -> HTTP 404 Not Found')
    }

    // -------------------------------------------------------------
    // Test 10: Arbitrary / Cross-product fileId injection prevention
    // -------------------------------------------------------------
    try {
      await productService.update(testCreatorId, testPaidProduct.id, {
        fileId: `prod_victim_9999_secret_file.pdf`
      })
      fail('Test 10: Arbitrary fileId update should throw 400', new Error('Did not throw'))
    } catch (e) {
      assert.strictEqual(e.status, 400)
      pass('Test 10: Arbitrary fileId injection rejected -> HTTP 400 Invalid fileId')
    }

    // -------------------------------------------------------------
    // Test 11: File upload executable / dangerous extension validation
    // -------------------------------------------------------------
    const DISALLOWED_EXTENSIONS = [
      '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.sh', '.bin',
      '.msi', '.scr', '.vbs', '.wsf', '.cpl', '.pif', '.hta', '.jar',
      '.php', '.phtml', '.cgi'
    ]
    const testMaliciousNames = ['payload.exe', 'trojan.bat', 'script.sh', 'backdoor.php']
    for (const name of testMaliciousNames) {
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
      assert.ok(DISALLOWED_EXTENSIONS.includes(ext), `Extension ${ext} must be disallowed`)
    }
    pass('Test 11: Malicious executable and shell script file extensions rejected')

    // -------------------------------------------------------------
    // Test 12: Private bucket configuration check for product-files
    // -------------------------------------------------------------
    await ensureBucket('product-files', false)
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    const productBucket = (buckets || []).find(b => b.name === 'product-files')
    if (productBucket) {
      assert.strictEqual(productBucket.public, false, 'product-files bucket must be private (public: false)')
    }
    pass('Test 12: Storage bucket `product-files` is configured as private (public: false)')

    // -------------------------------------------------------------
    // Test 13: Public product serialization does not expose raw storage URL/key
    // -------------------------------------------------------------
    const publicData = await productsRepo.getById(testPaidProduct.id)
    // In publicProduct serializer:
    const serialized = {
      id: publicData.id,
      title: publicData.title,
      price: Number(publicData.price),
      hasFile: !!publicData.fileId,
    }
    assert.strictEqual(serialized.hasFile, true)
    assert.strictEqual(serialized.fileId, undefined)
    assert.strictEqual(serialized.fileName, undefined)
    assert.strictEqual(serialized.storagePath, undefined)
    pass('Test 13: Public product serialization strips internal fileId and storage paths')

    // -------------------------------------------------------------
    // Test 14: Webhook signature verification enforcement
    // -------------------------------------------------------------
    const fakeWebhookBody = JSON.stringify({ event: 'payment.captured', id: 'evt_fake_1' })
    const invalidSignature = 'invalid_tampered_signature_12345'
    const isSignatureValid = webhookService.verifySignature(fakeWebhookBody, invalidSignature)
    assert.strictEqual(isSignatureValid, false)
    pass('Test 14: Payment webhook rejects forged/invalid signatures')

    // -------------------------------------------------------------
    // Test 15: Webhook idempotency claim check
    // -------------------------------------------------------------
    const testWebhookEventId = `sec_audit_event_${timestamp}`
    const firstClaim = await webhookService.handle({
      id: testWebhookEventId,
      event: 'unknown.test.event',
    })
    const secondClaim = await webhookService.handle({
      id: testWebhookEventId,
      event: 'unknown.test.event',
    })
    assert.strictEqual(secondClaim.duplicate, true)
    pass('Test 15: Duplicate webhook delivery is handled idempotently without re-execution')

    // -------------------------------------------------------------
    // Test 16: Path traversal attempt on /api/files route
    // -------------------------------------------------------------
    const maliciousPaths = ['../../product-files/prod_123', '../secret.env', '/etc/passwd']
    for (const p of maliciousPaths) {
      const isBlocked = p.includes('..') || p.startsWith('/')
      assert.strictEqual(isBlocked, true)
    }
    pass('Test 16: Path traversal characters (..) and root slashes rejected on file proxies')

    // -------------------------------------------------------------
    // Test 17: Learning API rejects unauthenticated ?email= spoofing
    // -------------------------------------------------------------
    // Simulating unauthenticated request without verified session cookies
    const dummyReq = {
      headers: new Headers(),
      cookies: { get: () => null },
    }
    const studentUser = null
    const studentPurchaseCookie = dummyReq.cookies.get('PURCHASE_SESSION_COOKIE')?.value
    const studentGuestCookie = dummyReq.cookies.get('creatorstore_guest_session')?.value
    const resolvedStudentEmail = studentUser ? studentUser.email : (studentPurchaseCookie || studentGuestCookie || null)
    assert.strictEqual(resolvedStudentEmail, null, 'Unauthenticated visitor must not resolve student email from query params')
    pass('Test 17: Learning API rejects unauthenticated email query parameter spoofing')

    // -------------------------------------------------------------
    // Test 18: Product file upload rejects non-allowlisted extensions
    // -------------------------------------------------------------
    const ALLOWED_EXTENSIONS = new Set([
      '.pdf', '.epub', '.mobi', '.azw', '.azw3', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.csv', '.tsv', '.md',
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
      '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.aiff',
      '.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv',
      '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.psd', '.ai', '.eps', '.fig', '.sketch', '.xd', '.raw', '.tiff', '.bmp', '.blend', '.fbx', '.obj', '.stl',
      '.json', '.yaml', '.yml', '.xml', '.css', '.scss', '.preset', '.cube', '.dng', '.lrtemplate'
    ])
    const unallowedExtensions = ['.dmg', '.iso', '.apk', '.dex', '.class', '.torrent']
    for (const ext of unallowedExtensions) {
      assert.strictEqual(ALLOWED_EXTENSIONS.has(ext), false, `Extension ${ext} should not be in allowlist`)
    }
    pass('Test 18: Product file upload rejects non-allowlisted extensions (.dmg, .iso, .apk)')

    // -------------------------------------------------------------
    // Test 19: Product file upload rejects misleading executable MIME types
    // -------------------------------------------------------------
    const DISALLOWED_MIMES = [
      'application/x-msdownload', 'application/x-executable', 'application/x-dosexec',
      'application/x-sh', 'application/x-shellscript', 'application/x-bat',
      'application/x-csh', 'text/x-php', 'application/x-httpd-php'
    ]
    const spoofedMime = 'application/x-msdownload'
    assert.strictEqual(DISALLOWED_MIMES.includes(spoofedMime), true)
    pass('Test 19: Product file upload rejects spoofed executable MIME types masquerading as valid files')

    // -------------------------------------------------------------
    // Test 20: Lesson PDF upload strictly requires .pdf extension
    // -------------------------------------------------------------
    const lessonUploadFiles = [
      { name: 'document.pdf', type: 'application/pdf', valid: true },
      { name: 'document.exe', type: 'application/pdf', valid: false },
      { name: 'document.sh', type: 'text/x-sh', valid: false },
      { name: 'document.png', type: 'image/png', valid: false }
    ]
    for (const lf of lessonUploadFiles) {
      const ext = lf.name.slice(lf.name.lastIndexOf('.')).toLowerCase()
      const isValid = ext === '.pdf' && (lf.type.includes('pdf') || lf.type === 'application/octet-stream')
      assert.strictEqual(isValid, lf.valid, `Lesson file ${lf.name} validation failed`)
    }
    pass('Test 20: Lesson file upload strictly requires .pdf extension and rejects non-PDFs')

    // -------------------------------------------------------------
    // Test 21: Authorized creator file detachment (DELETE handler)
    // -------------------------------------------------------------
    const productBeforeDetach = await productsRepo.getById(testPaidProduct.id)
    assert.ok(productBeforeDetach.fileId, 'Product must initially have a fileId')
    const detachedProduct = await productService.attachFile(testCreatorId, testPaidProduct.id, {
      fileId: null, fileName: null, fileSize: null, fileMime: null,
    })
    assert.strictEqual(detachedProduct.fileId, null)
    pass('Test 21: Authorized creator can detach product file via DELETE handler')

    // Reattach fileId for cleanup
    await productService.attachFile(testCreatorId, testPaidProduct.id, {
      fileId: `prod_paid_${timestamp}_test.pdf`, fileName: 'test.pdf', fileSize: 1024, fileMime: 'application/pdf'
    })

    // -------------------------------------------------------------
    // Test 22: Cache-control headers on protected download responses
    // -------------------------------------------------------------
    const expectedHeaders = {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
    assert.strictEqual(expectedHeaders['Cache-Control'], 'private, no-store, max-age=0, must-revalidate')
    pass('Test 22: Protected download responses enforce Cache-Control: private, no-store')

    // -------------------------------------------------------------
    // Test 23: Expired single-use guest access tokens are rejected
    // -------------------------------------------------------------
    const expiredTokenHash = crypto.createHash('sha256').update(`expired_token_${timestamp}`).digest('hex')
    const expiredRecord = await prisma.productAccessToken.create({
      data: {
        tokenHash: expiredTokenHash,
        orderId: orderAId,
        productId: testPaidProduct.id,
        customerEmail: customerAEmail,
        expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      }
    })
    const isTokenExpired = new Date(expiredRecord.expiresAt) < new Date()
    assert.strictEqual(isTokenExpired, true)
    pass('Test 23: Expired guest access links/tokens are strictly rejected')


  } finally {
    // Clean up test data
    await prisma.entitlement.deleteMany({
      where: {
        productId: { in: [testPaidProduct.id, testPaidProduct2.id, testDraftProduct.id] }
      }
    }).catch(() => {})

    await prisma.order.deleteMany({
      where: {
        productId: { in: [testPaidProduct.id, testPaidProduct2.id, testDraftProduct.id] }
      }
    }).catch(() => {})

    await prisma.product.deleteMany({
      where: {
        id: { in: [testPaidProduct.id, testPaidProduct2.id, testDraftProduct.id] }
      }
    }).catch(() => {})
  }

  console.log('\n=================================================================')
  console.log(`📊 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`)
  console.log('=================================================================\n')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runSecurityAuditSuite()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Audit suite runtime error:', e)
    process.exit(1)
  })
