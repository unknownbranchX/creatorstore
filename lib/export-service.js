import { prisma } from './prisma.js'
import { productsRepo, ordersRepo, customersRepo } from './repos.js'
import { analyticsService, leadService, formsService } from './services.js'

function httpError(status, message, code) {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

/**
 * Escapes a cell value for safe CSV generation, including defense against
 * CSV spreadsheet formula injection (CWE-1236 / OWASP).
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""'
  let str = String(val)
  // If the cell starts with formula trigger characters (=, +, -, @, tab, cr), prepend single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  return `"${str.replace(/"/g, '""')}"`
}

/**
 * Format a list of header strings and rows of arrays into a CSV string.
 */
export function buildCsv(headers, rows) {
  const headerLine = headers.join(',')
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','))
  return [headerLine, ...dataLines].join('\n')
}

export const exportService = {
  /**
   * Validate and parse date filter
   */
  parseDateFilter(from, to) {
    let fromDate = null
    let toDate = null

    if (from) {
      fromDate = new Date(from)
      if (isNaN(fromDate.getTime())) throw httpError(400, 'Invalid "from" date filter')
    }
    if (to) {
      toDate = new Date(to)
      if (isNaN(toDate.getTime())) throw httpError(400, 'Invalid "to" date filter')
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw httpError(400, '"from" date must be earlier than or equal to "to" date')
    }
    return { fromDate, toDate }
  },

  /**
   * Export Products dataset
   */
  async exportProducts(creatorId, { fromDate, toDate } = {}) {
    let products = await productsRepo.listByCreator(creatorId)
    if (fromDate) {
      products = products.filter((p) => new Date(p.createdAt) >= fromDate)
    }
    if (toDate) {
      products = products.filter((p) => new Date(p.createdAt) <= toDate)
    }

    const headers = [
      'Product ID',
      'Product Name',
      'Product Type',
      'Price',
      'Currency',
      'Publication Status',
      'Creation Date',
    ]

    const rows = products.map((p) => {
      const type = p.productType || p.type || 'DIGITAL_PRODUCT'
      const status = p.status || (p.published ? 'PUBLISHED' : 'DRAFT')
      return [
        p.id,
        p.title || 'Untitled Product',
        type,
        Number(p.price || 0).toFixed(2),
        (p.currency || 'USD').toUpperCase(),
        status,
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
      ]
    })

    return buildCsv(headers, rows)
  },

  /**
   * Export Orders dataset
   */
  async exportOrders(creatorId, { fromDate, toDate } = {}) {
    let orders = await ordersRepo.list(creatorId)
    const products = await productsRepo.listByCreator(creatorId).catch(() => [])
    const productMap = new Map(products.map((p) => [String(p.id), p.title]))

    if (fromDate) {
      orders = orders.filter((o) => new Date(o.paidAt || o.createdAt) >= fromDate)
    }
    if (toDate) {
      orders = orders.filter((o) => new Date(o.paidAt || o.createdAt) <= toDate)
    }

    const headers = [
      'Order ID',
      'Order Date',
      'Product Reference',
      'Order Status',
      'Currency',
      'Gross Amount',
      'Refund Amount',
      'Net Amount',
    ]

    const rows = orders.map((o) => {
      const prodTitle = productMap.get(String(o.productId)) || o.productId || 'Unknown Product'
      const gross = Number(o.amount || 0)
      const refund = o.status === 'REFUNDED' ? Number(o.refundAmount || gross) : Number(o.refundAmount || 0)
      const net = Math.max(0, gross - refund)
      const orderDate = o.paidAt || o.createdAt ? new Date(o.paidAt || o.createdAt).toISOString() : ''

      return [
        o.id,
        orderDate,
        prodTitle,
        o.status || 'PENDING',
        (o.currency || 'USD').toUpperCase(),
        gross.toFixed(2),
        refund.toFixed(2),
        net.toFixed(2),
      ]
    })

    return buildCsv(headers, rows)
  },

  /**
   * Export Sales & Revenue records
   */
  async exportSales(creatorId, { fromDate, toDate } = {}) {
    let orders = await ordersRepo.list(creatorId)
    const paidOrders = orders.filter((o) => o.status === 'PAID' || o.status === 'REFUNDED')
    const customers = await customersRepo.list(creatorId).catch(() => [])
    const custMap = new Map(customers.map((c) => [String(c.id), c.email]))
    const products = await productsRepo.listByCreator(creatorId).catch(() => [])
    const prodMap = new Map(products.map((p) => [String(p.id), p.title]))

    let filtered = paidOrders
    if (fromDate) {
      filtered = filtered.filter((o) => new Date(o.paidAt || o.createdAt) >= fromDate)
    }
    if (toDate) {
      filtered = filtered.filter((o) => new Date(o.paidAt || o.createdAt) <= toDate)
    }

    const headers = [
      'Record ID',
      'Order ID',
      'Date',
      'Amount',
      'Currency',
      'Status',
      'Customer Email',
      'Product Reference',
    ]

    const rows = filtered.map((o) => {
      const custEmail = custMap.get(String(o.customerId)) || o.customerEmail || '—'
      const prodTitle = prodMap.get(String(o.productId)) || o.productId || '—'
      const date = o.paidAt || o.createdAt ? new Date(o.paidAt || o.createdAt).toISOString() : ''

      return [
        o.paymentId || o.id,
        o.id,
        date,
        Number(o.amount || 0).toFixed(2),
        (o.currency || 'USD').toUpperCase(),
        o.status,
        custEmail,
        prodTitle,
      ]
    })

    return buildCsv(headers, rows)
  },

  /**
   * Export Customer Leads
   */
  async exportLeads(creatorId, { fromDate, toDate } = {}) {
    const res = await leadService.list(creatorId)
    let leads = Array.isArray(res) ? res : (res.items || [])

    if (fromDate) {
      leads = leads.filter((l) => new Date(l.createdAt) >= fromDate)
    }
    if (toDate) {
      leads = leads.filter((l) => new Date(l.createdAt) <= toDate)
    }

    const headers = [
      'Lead ID',
      'Name',
      'Email',
      'Source',
      'Lead Magnet',
      'Created At',
    ]

    const rows = leads.map((l) => [
      l.id || '',
      l.name || '',
      l.email || '',
      l.source || 'Storefront',
      l.leadMagnetTitle || l.productTitle || 'Lead Magnet',
      l.createdAt ? new Date(l.createdAt).toISOString() : '',
    ])

    return buildCsv(headers, rows)
  },

  /**
   * Export Mailing List / Newsletter Subscribers
   */
  async exportSubscribers(creatorId, { fromDate, toDate } = {}) {
    let subscribers = []
    try {
      subscribers = await prisma.newsletterSubscriber.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
      })
    } catch {
      const res = await formsService.listSubscribers(creatorId).catch(() => [])
      subscribers = Array.isArray(res) ? res : (res.items || [])
    }

    if (fromDate) {
      subscribers = subscribers.filter((s) => new Date(s.createdAt) >= fromDate)
    }
    if (toDate) {
      subscribers = subscribers.filter((s) => new Date(s.createdAt) <= toDate)
    }

    const headers = [
      'Subscriber ID',
      'Email Address',
      'Subscription Status',
      'Consent Timestamp',
      'Creation Date',
      'Source',
    ]

    const rows = subscribers.map((s) => [
      s.id || '',
      s.email || '',
      s.status || 'SUBSCRIBED',
      s.consentTimestamp ? new Date(s.consentTimestamp).toISOString() : (s.createdAt ? new Date(s.createdAt).toISOString() : ''),
      s.createdAt ? new Date(s.createdAt).toISOString() : '',
      s.source || 'Newsletter Signup',
    ])

    return buildCsv(headers, rows)
  },

  /**
   * Export Analytics Summaries
   */
  async exportAnalytics(creatorId, { fromDate, toDate } = {}) {
    const days = 365
    const overview = await analyticsService.overview(creatorId, days).catch(() => ({}))

    const headers = [
      'Reporting Period',
      'Metric Name',
      'Metric Value',
      'Product Identifier',
    ]

    const periodLabel = fromDate && toDate
      ? `${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`
      : 'Last 365 Days'

    const rows = [
      [periodLabel, 'Total Storefront Views', overview.storeViews ?? 0, 'ALL_STORE'],
      [periodLabel, 'Total Product Views', overview.productViews ?? 0, 'ALL_PRODUCTS'],
      [periodLabel, 'Total Checkout Clicks', overview.checkoutStarted ?? 0, 'ALL_PRODUCTS'],
      [periodLabel, 'Total Paid Orders', overview.orders ?? 0, 'ALL_PRODUCTS'],
      [periodLabel, 'Gross Sales', overview.revenue ?? 0, 'ALL_PRODUCTS'],
      [periodLabel, 'Total Refunds', overview.refundsTotal ?? 0, 'ALL_PRODUCTS'],
      [periodLabel, 'Net Revenue', overview.netRevenue ?? overview.revenue ?? 0, 'ALL_PRODUCTS'],
      [periodLabel, 'Overall Conversion Rate (%)', overview.conversion ?? 0, 'ALL_STORE'],
    ]

    // Include top products performance
    if (Array.isArray(overview.topProducts)) {
      overview.topProducts.forEach((tp) => {
        rows.push([
          periodLabel,
          `Product Revenue (${tp.title || 'Untitled'})`,
          tp.revenue ?? 0,
          tp.id || 'N/A',
        ])
      })
    }

    return buildCsv(headers, rows)
  },

  /**
   * Main dataset export dispatcher
   */
  async exportDataset(creatorId, dataset, { from, to } = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const { fromDate, toDate } = this.parseDateFilter(from, to)

    switch (dataset) {
      case 'products':
        return { csv: await this.exportProducts(creatorId, { fromDate, toDate }), filename: `creatorstore-products-${Date.now()}.csv` }
      case 'orders':
        return { csv: await this.exportOrders(creatorId, { fromDate, toDate }), filename: `creatorstore-orders-${Date.now()}.csv` }
      case 'sales':
        return { csv: await this.exportSales(creatorId, { fromDate, toDate }), filename: `creatorstore-sales-${Date.now()}.csv` }
      case 'leads':
        return { csv: await this.exportLeads(creatorId, { fromDate, toDate }), filename: `creatorstore-leads-${Date.now()}.csv` }
      case 'subscribers':
        return { csv: await this.exportSubscribers(creatorId, { fromDate, toDate }), filename: `creatorstore-subscribers-${Date.now()}.csv` }
      case 'analytics':
        return { csv: await this.exportAnalytics(creatorId, { fromDate, toDate }), filename: `creatorstore-analytics-${Date.now()}.csv` }
      default:
        throw httpError(400, `Unknown dataset "${dataset}". Supported datasets: products, orders, sales, leads, subscribers, analytics`)
    }
  },
}
