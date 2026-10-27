import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://creatorzero-supabase.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock_anon_key'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock_service_role_key'

// Public client for browser / anonymous queries
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// In-Memory Relational Engine for mock/local development fallback when offline
class MemoryStore {
  constructor() {
    this.tables = new Map()
    this.storage = new Map()
  }

  getTable(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, [])
    }
    return this.tables.get(name)
  }

  setTable(name, rows) {
    this.tables.set(name, rows)
  }
}

const memoryStore = new MemoryStore()

// Initialize demo store & products
const DEMO_ID = 'demo-creator-0001'
memoryStore.getTable('users').push({ id: DEMO_ID, email: 'demo@creatorzero.com', role: 'CREATOR', createdAt: new Date().toISOString() })
memoryStore.getTable('creator_profiles').push({ creatorId: DEMO_ID, name: 'Mohit Sharma', bio: 'Helping developers ace coding interviews.', category: 'Coding', avatarUrl: 'https://images.unsplash.com/photo-1555728750-9c6ad51b968d?w=300&q=80', socialLinks: {}, onboardingComplete: true })
memoryStore.getTable('stores').push({ id: 'demo-store-id', creatorId: DEMO_ID, username: 'demo', published: true, theme: { primaryColor: '#4D7CFF', background: '#12141c' }, sections: [] })
memoryStore.getTable('products').push({ id: 'demo-product-id', creatorId: DEMO_ID, type: 'DIGITAL_DOWNLOAD', title: 'DSA Interview Course', slug: 'dsa-interview-course', shortDescription: 'Land your dream job.', price: 49, currency: 'usd', status: 'PUBLISHED', fileId: 'demo_file_id', fileName: 'course-access.txt', fileSize: 1200, fileMime: 'text/plain' })


function isMockKey(key) {
  return !key || String(key).includes('mock_')
}

function toCamel(str) { return String(str).replace(/_([a-z])/g, (_, l) => l.toUpperCase()) }
function toSnake(str) { return String(str).replace(/([A-Z])/g, '_$1').toLowerCase() }
function getVal(r, col) {
  if (!r) return undefined
  if (col in r) return r[col]
  const camel = toCamel(col)
  if (camel in r) return r[camel]
  const snake = toSnake(col)
  if (snake in r) return r[snake]
  return undefined
}

// Build query chaining proxy for Supabase PostgREST compatibility
function buildQueryChain(tableName) {
  let filters = []
  let selectCols = '*'
  let sortOpts = null
  let limitVal = null
  let isSingle = false
  let isMaybeSingle = false
  let isDeleteOp = false
  let updateData = null

  const execute = () => {
    let rows = [...memoryStore.getTable(tableName)]

    if (isDeleteOp) {
      if (filters.length === 0) {
        memoryStore.setTable(tableName, [])
        return { data: null, error: null }
      }
      const remaining = rows.filter(r => {
        let match = true
        for (const f of filters) {
          const v = getVal(r, f.col)
          if (f.type === 'eq' && String(v) !== String(f.val)) match = false
          if (f.type === 'neq' && String(v) === String(f.val)) match = false
          if (f.type === 'in' && !f.vals.map(val => String(val)).includes(String(v))) match = false
        }
        return !match // keep row if it didn't match all delete filters
      })
      memoryStore.setTable(tableName, remaining)
      return { data: null, error: null }
    }

    if (updateData) {
      let targetIndices = []
      rows.forEach((r, idx) => {
        let match = true
        for (const f of filters) {
          const v = getVal(r, f.col)
          if (f.type === 'eq' && String(v) !== String(f.val)) match = false
          if (f.type === 'neq' && String(v) === String(f.val)) match = false
          if (f.type === 'in' && !f.vals.map(v => String(v)).includes(String(v))) match = false
        }
        if (match) targetIndices.push(idx)
      })

      const updated = []
      const fullTable = memoryStore.getTable(tableName)
      for (const idx of targetIndices) {
        fullTable[idx] = { ...fullTable[idx], ...updateData, updatedAt: new Date().toISOString() }
        updated.push(fullTable[idx])
      }
      return { data: updated, error: null }
    }

    // Apply filters for select
    for (const f of filters) {
      if (f.type === 'eq') {
        rows = rows.filter(r => String(getVal(r, f.col)) === String(f.val))
      } else if (f.type === 'neq') {
        rows = rows.filter(r => String(getVal(r, f.col)) !== String(f.val))
      } else if (f.type === 'in') {
        const set = new Set(f.vals.map(v => String(v)))
        rows = rows.filter(r => set.has(String(getVal(r, f.col))))
      } else if (f.type === 'gt') {
        rows = rows.filter(r => {
          const v = getVal(r, f.col)
          if (v instanceof Date || f.val instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)) && !isNaN(Date.parse(f.val)))) {
            return new Date(v).getTime() > new Date(f.val).getTime()
          }
          return v > f.val
        })
      } else if (f.type === 'gte') {
        rows = rows.filter(r => {
          const v = getVal(r, f.col)
          if (v instanceof Date || f.val instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)) && !isNaN(Date.parse(f.val)))) {
            return new Date(v).getTime() >= new Date(f.val).getTime()
          }
          return v >= f.val
        })
      } else if (f.type === 'lt') {
        rows = rows.filter(r => {
          const v = getVal(r, f.col)
          if (v instanceof Date || f.val instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)) && !isNaN(Date.parse(f.val)))) {
            return new Date(v).getTime() < new Date(f.val).getTime()
          }
          return v < f.val
        })
      } else if (f.type === 'lte') {
        rows = rows.filter(r => {
          const v = getVal(r, f.col)
          if (v instanceof Date || f.val instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)) && !isNaN(Date.parse(f.val)))) {
            return new Date(v).getTime() <= new Date(f.val).getTime()
          }
          return v <= f.val
        })
      } else if (f.type === 'or') {
        const conds = f.condStr.split(',')
        rows = rows.filter(r => {
          return conds.some(c => {
            const parts = c.trim().split('.')
            if (parts.length >= 3) {
              const field = parts[0]
              const op = parts[1]
              const val = parts.slice(2).join('.').replace(/^\(|\)$/g, '')
              const actualVal = getVal(r, field)
              if (op === 'eq') return String(actualVal) === String(val)
              if (op === 'in') {
                const vals = val.split(',').map(v => v.trim())
                return vals.includes(String(actualVal))
              }
            }
            return false
          })
        })
      }
    }

    // Sort
    if (sortOpts) {
      const { col, ascending } = sortOpts
      rows.sort((a, b) => {
        const valA = getVal(a, col)
        const valB = getVal(b, col)
        if (valA < valB) return ascending ? -1 : 1
        if (valA > valB) return ascending ? 1 : -1
        return 0
      })
    }

    // Limit
    if (limitVal !== null) {
      rows = rows.slice(0, limitVal)
    }

    function safeClone(obj) {
      if (!obj) return obj
      try {
        return JSON.parse(JSON.stringify(obj))
      } catch (e) {
        return obj
      }
    }

    if (isSingle) {
      if (rows.length === 0) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
      return { data: safeClone(rows[0]), error: null }
    }
    if (isMaybeSingle) {
      return { data: rows.length > 0 ? safeClone(rows[0]) : null, error: null }
    }

    return { data: safeClone(rows), error: null }
  }

  const builder = {
    select(cols) {
      selectCols = cols || '*'
      return builder
    },
    eq(col, val) {
      filters.push({ type: 'eq', col, val })
      return builder
    },
    neq(col, val) {
      filters.push({ type: 'neq', col, val })
      return builder
    },
    in(col, vals) {
      filters.push({ type: 'in', col, vals: Array.isArray(vals) ? vals : [vals] })
      return builder
    },
    gt(col, val) {
      filters.push({ type: 'gt', col, val })
      return builder
    },
    gte(col, val) {
      filters.push({ type: 'gte', col, val })
      return builder
    },
    lt(col, val) {
      filters.push({ type: 'lt', col, val })
      return builder
    },
    lte(col, val) {
      filters.push({ type: 'lte', col, val })
      return builder
    },
    or(condStr) {
      filters.push({ type: 'or', condStr })
      return builder
    },
    order(col, { ascending = true } = {}) {
      sortOpts = { col, ascending }
      return builder
    },
    limit(n) {
      limitVal = n
      return builder
    },
    single() {
      isSingle = true
      return execute()
    },
    maybeSingle() {
      isMaybeSingle = true
      return execute()
    },
    delete() {
      isDeleteOp = true
      return builder
    },
    update(patch) {
      updateData = patch
      return builder
    },
    insert(docOrDocs) {
      const table = memoryStore.getTable(tableName)
      const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs]
      const inserted = []
      for (const d of docs) {
        const item = { ...d, createdAt: d.createdAt || new Date().toISOString(), updatedAt: d.updatedAt || new Date().toISOString() }
        table.push(item)
        inserted.push(item)
      }
      const data = Array.isArray(docOrDocs) ? inserted : inserted[0]
      return {
        select() {
          return { data, error: null }
        },
        data,
        error: null,
      }
    },
    upsert(docOrDocs, options = {}) {
      const table = memoryStore.getTable(tableName)
      const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs]
      const onConflict = options.onConflict || 'id'
      const conflictKeys = onConflict.split(',').map(s => s.trim())

      const result = []
      for (const d of docs) {
        const existingIdx = table.findIndex(r => {
          return conflictKeys.every(k => String(r[k]) === String(d[k]))
        })
        if (existingIdx >= 0) {
          table[existingIdx] = { ...table[existingIdx], ...d, updatedAt: new Date().toISOString() }
          result.push(table[existingIdx])
        } else {
          const newItem = { ...d, createdAt: d.createdAt || new Date().toISOString(), updatedAt: d.updatedAt || new Date().toISOString() }
          table.push(newItem)
          result.push(newItem)
        }
      }
      return {
        select() {
          return { data: Array.isArray(docOrDocs) ? result : result[0], error: null }
        },
        data: Array.isArray(docOrDocs) ? result : result[0],
        error: null,
      }
    },
    then(resolve, reject) {
      const res = execute()
      if (res.error && isSingle) {
        reject(res.error)
      } else {
        resolve(res)
      }
    }
  }

  return builder
}

// Storage mock for local files
const storageMock = {
  from(bucketName) {
    if (!memoryStore.storage.has(bucketName)) {
      memoryStore.storage.set(bucketName, new Map())
    }
    const bucket = memoryStore.storage.get(bucketName)

    return {
      async upload(path, fileBody, options = {}) {
        const buffer = Buffer.isBuffer(fileBody) ? fileBody : Buffer.from(fileBody)
        bucket.set(path, { buffer, contentType: options.contentType || 'application/octet-stream' })
        return { data: { path }, error: null }
      },
      async download(path) {
        const file = bucket.get(path)
        if (!file) return { data: null, error: { message: 'Object not found' } }
        return { data: file.buffer, error: null }
      },
      async remove(paths) {
        const arr = Array.isArray(paths) ? paths : [paths]
        arr.forEach(p => bucket.delete(p))
        return { data: null, error: null }
      },
      createSignedUrl(path, expiresInSec) {
        return Promise.resolve({
          data: { signedUrl: `${supabaseUrl}/storage/v1/object/sign/${bucketName}/${path}?token=mock_signed_token` },
          error: null,
        })
      },
      getPublicUrl(path) {
        return {
          data: { publicUrl: `${supabaseUrl}/storage/v1/object/public/${bucketName}/${path}` },
        }
      }
    }
  }
}

function toDb(doc) {
  if (!doc) return doc
  const result = {}
  for (const key of Object.keys(doc)) {
    if (key === '_id') continue
    const snakeKey = toSnake(key)
    result[snakeKey] = doc[key]
  }
  return result
}

function clean(doc) {
  if (!doc || typeof doc !== 'object') return doc
  const result = {}
  for (const key of Object.keys(doc)) {
    if (key === '_id') continue
    const camelKey = toCamel(key)
    result[camelKey] = doc[key]
    if (camelKey !== key) {
      result[key] = doc[key]
    }
  }
  return result
}

function cleanMany(docs) {
  if (!Array.isArray(docs)) return docs
  return docs.map(clean)
}


function postgrestProxy(builder) {
  if (!builder || typeof builder !== 'object') return builder
  return new Proxy(builder, {
    get(target, prop) {
      if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'].includes(prop)) {
        return (col, val) => {
          const snakeCol = toSnake(col)
          const res = target[prop](snakeCol, val)
          return postgrestProxy(res)
        }
      }
      if (['select', 'delete', 'limit', 'range', 'single', 'maybeSingle'].includes(prop)) {
        return (...args) => {
          const res = target[prop](...args)
          return postgrestProxy(res)
        }
      }
      if (prop === 'order') {
        return (col, opts) => {
          const snakeCol = toSnake(col)
          const res = target.order(snakeCol, opts)
          return postgrestProxy(res)
        }
      }
      if (prop === 'insert') {
        return (doc, opts) => postgrestProxy(target.insert(Array.isArray(doc) ? doc.map(toDb) : toDb(doc), opts))
      }
      if (prop === 'upsert') {
        return (doc, opts) => {
          const formattedOpts = opts?.onConflict ? { ...opts, onConflict: toSnake(opts.onConflict) } : opts
          return postgrestProxy(target.upsert(Array.isArray(doc) ? doc.map(toDb) : toDb(doc), formattedOpts))
        }
      }
      if (prop === 'update') {
        return (doc, opts) => postgrestProxy(target.update(toDb(doc), opts))
      }
      if (prop === 'then') {
        return (onFulfilled, onRejected) => {
          return target.then((res) => {
            if (res && res.data) {
              const cleaned = Array.isArray(res.data) ? cleanMany(res.data) : clean(res.data)
              onFulfilled({ ...res, data: cleaned })
            } else {
              onFulfilled(res)
            }
          }, onRejected)
        }
      }
      const val = target[prop]
      return typeof val === 'function' ? val.bind(target) : val
    }
  })
}

// Create real or fallback admin client
const realClient = createClient(supabaseUrl, supabaseServiceKey)

export const supabaseAdmin = new Proxy(realClient, {
  get(target, prop) {
    if (prop === 'from') {
      return (tableName) => {
        if (isMockKey(supabaseServiceKey) || tableName === 'analytics_events' || tableName === 'earnings_ledger') {
          return buildQueryChain(tableName)
        }
        return postgrestProxy(target.from(tableName))
      }
    }
    if (prop === 'storage') {
      if (isMockKey(supabaseServiceKey)) {
        return storageMock
      }
      return target.storage
    }
    const val = target[prop]
    return typeof val === 'function' ? val.bind(target) : val
  }
})

export async function ensureBucket(bucketName, isPublic = false) {
  if (isMockKey(supabaseServiceKey)) return
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    if (buckets && !buckets.some(b => b.name === bucketName)) {
      await supabaseAdmin.storage.createBucket(bucketName, { public: isPublic })
    }
  } catch (e) {
    console.error(`Error ensuring storage bucket ${bucketName}:`, e)
  }
}

async function verifyObjectExists(bucket, path) {
  if (!bucket || !path) return false
  const cleanPath = path.replace(/^\/+/, '').trim()
  if (!cleanPath) return false
  try {
    const { data: signedData, error: sErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(cleanPath, 60)
    if (!sErr && signedData?.signedUrl) return true
  } catch {}
  try {
    const { data, error: dErr } = await supabaseAdmin.storage.from(bucket).download(cleanPath)
    if (!dErr && data) return true
  } catch {}
  return false
}

export async function resolveDigitalProductStoragePath(product) {
  if (!product) return null
  let rawFileId = product.fileId || product.file_id || product.fileKey || product.file

  const knownBuckets = ['product-files', 'creator-assets', 'public-assets']

  // 1. If rawFileId is a full URL (e.g. https://.../storage/v1/object/public/creator-assets/foo/bar)
  if (typeof rawFileId === 'string' && rawFileId.startsWith('http')) {
    try {
      const urlObj = new URL(rawFileId)
      const parts = urlObj.pathname.split('/')
      const bucketIdx = parts.findIndex(p => knownBuckets.includes(p))
      if (bucketIdx !== -1 && parts[bucketIdx + 1]) {
        const bucket = parts[bucketIdx]
        const path = parts.slice(bucketIdx + 1).map(p => decodeURIComponent(p)).join('/')
        if (await verifyObjectExists(bucket, path)) {
          return { bucket, path }
        }
      }
    } catch (e) {
      console.warn('[STORAGE_RESOLVE] URL parsing warning:', e.message)
    }
  }

  // 2. If rawFileId starts with a bucket prefix like "creator-assets/..." or "product-files/..."
  if (typeof rawFileId === 'string') {
    for (const b of knownBuckets) {
      if (rawFileId.startsWith(`${b}/`)) {
        const pathWithoutBucket = rawFileId.slice(b.length + 1)
        if (await verifyObjectExists(b, pathWithoutBucket)) {
          return { bucket: b, path: pathWithoutBucket }
        }
      }
    }
  }

  // 3. Test rawFileId directly against product-files first, then creator-assets, public-assets
  if (typeof rawFileId === 'string' && rawFileId.trim()) {
    const cleanId = rawFileId.trim().replace(/^\/+/, '')
    for (const b of knownBuckets) {
      if (await verifyObjectExists(b, cleanId)) {
        return { bucket: b, path: cleanId }
      }
      const decoded = decodeURIComponent(cleanId)
      if (decoded !== cleanId && await verifyObjectExists(b, decoded)) {
        return { bucket: b, path: decoded }
      }
    }
  }

  // 4. Fallback: Search product-files for object matching product ID
  if (product.id) {
    try {
      const { data: listData } = await supabaseAdmin.storage.from('product-files').list()
      if (listData && Array.isArray(listData)) {
        const matched = listData.find(f => f.name && f.name.includes(product.id))
        if (matched) {
          return { bucket: 'product-files', path: matched.name }
        }
      }
    } catch (e) {
      console.warn('[STORAGE_RESOLVE] Fallback search error:', e.message)
    }
  }

  return null
}

export { memoryStore }



