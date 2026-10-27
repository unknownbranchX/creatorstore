import { supabaseAdmin } from './supabase.js'
import { prisma } from './prisma.js'
import { v4 as uuidv4 } from 'uuid'
import { normalizeSlug } from './slug.js'
import { getDateInTimezone } from './calendarUtils.js'

function cryptoId() {
  return crypto.randomUUID()
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product'
}

function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}
function toSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase()
}

function clean(doc) {
  if (!doc) return doc
  const { _id, ...rest } = doc
  const result = {}
  for (const key of Object.keys(rest)) {
    let val = rest[key]
    if (val && typeof val === 'object' && typeof val.toNumber === 'function') {
      val = val.toNumber()
    }
    const camelKey = toCamel(key)
    result[camelKey] = val
    if (camelKey !== key) {
      result[key] = val
    }
  }
  if (result.coverImage !== undefined || result.thumbnail !== undefined) {
    result.cover = result.cover || result.coverImage || result.thumbnail || ''
  }
  if (result.type !== undefined && !result.displayMode) {
    result.displayMode = result.display_mode || 'classic'
  }
  if (doc.bundleItems && Array.isArray(doc.bundleItems)) {
    result.bundleProducts = doc.bundleItems.map((bi) => clean(bi.product)).filter(Boolean)
    result.bundleProductIds = doc.bundleItems.map((bi) => bi.productId)
    result.productIds = result.bundleProductIds
    result.productCount = result.bundleProducts.length
  }
  return result
}
function cleanMany(docs) {
  if (!Array.isArray(docs)) return []
  return docs.map(clean)
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

function queryDb(tableName) {
  const q = supabaseAdmin.from(tableName)
  return new Proxy(q, {
    get(target, prop) {
      if (prop === 'eq' || prop === 'neq' || prop === 'gt' || prop === 'gte' || prop === 'lt' || prop === 'lte') {
        return (col, val) => {
          const snakeCol = toSnake(col)
          const res = target[prop](snakeCol, val)
          return Proxy.isProxy ? res : queryDbProxy(res)
        }
      }
      if (prop === 'order') {
        return (col, opts) => {
          const snakeCol = toSnake(col)
          const res = target.order(snakeCol, opts)
          return queryDbProxy(res)
        }
      }
      if (prop === 'insert') {
        return (doc) => target.insert(Array.isArray(doc) ? doc.map(toDb) : toDb(doc))
      }
      if (prop === 'upsert') {
        return (doc, opts) => {
          const formattedOpts = opts?.onConflict ? { ...opts, onConflict: toSnake(opts.onConflict) } : opts
          return target.upsert(Array.isArray(doc) ? doc.map(toDb) : toDb(doc), formattedOpts)
        }
      }
      if (prop === 'update') {
        return (doc) => target.update(toDb(doc))
      }
      const val = target[prop]
      return typeof val === 'function' ? val.bind(target) : val
    }
  })
}

function queryDbProxy(builder) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === 'eq' || prop === 'neq' || prop === 'gt' || prop === 'gte' || prop === 'lt' || prop === 'lte') {
        return (col, val) => {
          const res = target[prop](toSnake(col), val)
          return queryDbProxy(res)
        }
      }
      if (prop === 'order') {
        return (col, opts) => {
          const res = target.order(toSnake(col), opts)
          return queryDbProxy(res)
        }
      }
      const val = target[prop]
      return typeof val === 'function' ? val.bind(target) : val
    }
  })
}

// ---------- Users ----------
export const usersRepo = {
  async create(user) {
    const doc = { id: user.id || cryptoId(), ...user }
    delete doc._id
    let prismaCreated = false
    try {
      await prisma.user.create({
        data: {
          id: doc.id,
          email: doc.email,
          passwordHash: doc.passwordHash || null,
          role: doc.role || 'CREATOR',
          country: doc.country ? String(doc.country).toUpperCase().trim().slice(0, 2) : null,
          emailVerified: doc.emailVerified ?? false,
          verificationTokenHash: doc.verificationTokenHash || null,
          verificationTokenExpires: doc.verificationTokenExpires ? new Date(doc.verificationTokenExpires) : null,
          resetTokenHash: doc.resetTokenHash || null,
          resetTokenExpires: doc.resetTokenExpires ? new Date(doc.resetTokenExpires) : null,
          createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
          updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
        }
      })
      prismaCreated = true
    } catch (e) {
      // User might already exist in Prisma DB
    }
    if (!prismaCreated) {
      const dbPayload = toDb(doc)
      const { error } = await supabaseAdmin.from('users').insert(dbPayload)
      if (error && error.code !== '23505') console.error('usersRepo.create error:', error)
    }
    return clean(doc)
  },
  async findByEmail(email) {
    if (!email) return null
    const normalized = String(email).toLowerCase().trim()
    try {
      const u = await prisma.user.findFirst({ where: { email: normalized } })
      if (u) return clean(u)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('users').select('*').eq('email', normalized).maybeSingle()
    return clean(data)
  },
  async findById(id) {
    if (!id) return null
    try {
      const u = await prisma.user.findUnique({ where: { id } })
      if (u) return clean(u)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('users').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getById(id) {
    return this.findById(id)
  },
  async update(id, patch) {
    const updateData = { ...patch, updatedAt: new Date().toISOString() }
    delete updateData._id
    delete updateData.id
    try {
      await prisma.user.update({
        where: { id },
        data: { ...patch, updatedAt: new Date() }
      })
    } catch (e) { }
    await supabaseAdmin.from('users').update(updateData).eq('id', id)
  },
  async setResetToken(userId, tokenHash, expiresAt) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          resetTokenHash: tokenHash,
          resetTokenExpires: expiresAt ? new Date(expiresAt) : null,
          updatedAt: new Date(),
        }
      })
    } catch (e) { }
    await supabaseAdmin.from('users').update({
      resetTokenHash: tokenHash,
      resetTokenExpires: expiresAt ? new Date(expiresAt).toISOString() : null,
      updatedAt: new Date().toISOString()
    }).eq('id', userId)
  },
  async findByResetToken(tokenHash) {
    if (!tokenHash) return null
    try {
      const u = await prisma.user.findFirst({
        where: {
          resetTokenHash: tokenHash,
          resetTokenExpires: { gt: new Date() }
        }
      })
      if (u) return clean(u)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('users').select('*').eq('resetTokenHash', tokenHash).gt('resetTokenExpires', new Date().toISOString()).maybeSingle()
    return clean(data)
  },
  async updatePasswordAndClearReset(userId, passwordHash) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          resetTokenHash: null,
          resetTokenExpires: null,
          updatedAt: new Date(),
        }
      })
    } catch (e) { }
    await supabaseAdmin.from('users').update({
      passwordHash,
      resetTokenHash: null,
      resetTokenExpires: null,
      updatedAt: new Date().toISOString()
    }).eq('id', userId)
  },
  async setVerificationToken(userId, tokenHash, expiresAt) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          verificationTokenHash: tokenHash,
          verificationTokenExpires: expiresAt ? new Date(expiresAt) : null,
          updatedAt: new Date(),
        }
      })
    } catch (e) { }
    await supabaseAdmin.from('users').update({
      verificationTokenHash: tokenHash,
      verificationTokenExpires: expiresAt ? new Date(expiresAt).toISOString() : null,
      updatedAt: new Date().toISOString()
    }).eq('id', userId)
  },
  async findByVerificationToken(tokenHash) {
    if (!tokenHash) return null
    try {
      const u = await prisma.user.findFirst({
        where: {
          verificationTokenHash: tokenHash,
          verificationTokenExpires: { gt: new Date() }
        }
      })
      if (u) return clean(u)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('users').select('*').eq('verificationTokenHash', tokenHash).gt('verificationTokenExpires', new Date().toISOString()).maybeSingle()
    return clean(data)
  },
  async verifyEmail(userId) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          emailVerified: true,
          verificationTokenHash: null,
          verificationTokenExpires: null,
          updatedAt: new Date(),
        }
      })
    } catch (e) { }
    await supabaseAdmin.from('users').update({
      emailVerified: true,
      verificationTokenHash: null,
      verificationTokenExpires: null,
      updatedAt: new Date().toISOString()
    }).eq('id', userId)
  },
}

// ---------- Creator profiles ---------- (creatorId === userId)
export const profilesRepo = {
  async getByCreator(creatorId) {
    if (!creatorId) return null
    try {
      const profile = await prisma.creatorProfile.findUnique({ where: { creatorId } })
      if (profile) return clean(profile)
    } catch (e) { }
    const { data } = await queryDb('creator_profiles').select('*').eq('creator_id', creatorId).maybeSingle()
    return clean(data)
  },
  async upsert(creatorId, data) {
    if (!creatorId) return null
    const safeData = {}
    if (data.name !== undefined) safeData.name = String(data.name || '')
    if (data.phone !== undefined) safeData.phone = String(data.phone || '')
    if (data.bio !== undefined) safeData.bio = String(data.bio || '')
    if (data.category !== undefined) safeData.category = String(data.category || '')
    if (data.avatarUrl !== undefined) safeData.avatarUrl = String(data.avatarUrl || '')
    if (data.socialLinks !== undefined && typeof data.socialLinks === 'object') safeData.socialLinks = data.socialLinks
    if (data.onboardingStatus !== undefined) safeData.onboardingStatus = String(data.onboardingStatus || '')
    if (data.onboardingComplete !== undefined) safeData.onboardingComplete = Boolean(data.onboardingComplete)
    if (data.country !== undefined) safeData.country = data.country ? String(data.country).toUpperCase().trim().slice(0, 2) : null

    try {
      const existing = await prisma.creatorProfile.findUnique({ where: { creatorId } })
      if (existing) {
        const updated = await prisma.creatorProfile.update({
          where: { creatorId },
          data: { ...safeData, updatedAt: new Date() }
        })
        return clean(updated)
      } else {
        const created = await prisma.creatorProfile.create({
          data: { creatorId, ...safeData, createdAt: new Date(), updatedAt: new Date() }
        })
        return clean(created)
      }
    } catch (e) {
      console.warn('Prisma creatorProfile upsert fallback to PostgREST:', e.message)
      const payload = { creatorId, ...toDb(safeData), updatedAt: new Date().toISOString() }
      delete payload._id
      await queryDb('creator_profiles').upsert(payload, { onConflict: 'creator_id' })
      return this.getByCreator(creatorId)
    }
  },
}

// ---------- Stores ----------
export const storesRepo = {
  async getByCreator(creatorId, options = {}) {
    if (!creatorId) return null
    const includeSections = options.includeSections !== false
    let storeData = null
    try {
      const store = await prisma.store.findUnique({
        where: { creatorId }
      })
      if (store) storeData = clean(store)
    } catch (e) { }
    if (!storeData) {
      const { data } = await queryDb('stores').select('*').eq('creator_id', creatorId).maybeSingle()
      storeData = clean(data)
    }
    if (!storeData) return null
    if (includeSections) {
      storeData.sections = await storeSectionsRepo.getForCreator(creatorId)
    } else {
      storeData.sections = []
    }
    return storeData
  },

  async getBySlug(slug) {
    const lower = normalizeSlug(slug)
    if (!lower) return null
    let storeData = null
    try {
      const store = await prisma.store.findFirst({
        where: {
          OR: [
            { username: { equals: lower, mode: 'insensitive' } },
            { slug: { equals: lower, mode: 'insensitive' } },
          ]
        }
      })
      if (store) storeData = clean(store)
    } catch (e) {
      console.warn('Prisma store lookup failed, falling back to Supabase:', e?.message || e)
    }

    if (!storeData) {
      try {
        const byUsername = await queryDb('stores').select('*').ilike('username', lower).maybeSingle()
        if (byUsername?.error) {
          const errMsg = String(byUsername.error.message || '').toLowerCase()
          console.error('Public storefront lookup error (username):', byUsername.error.message || byUsername.error)
          if (errMsg.includes('timeout') || errMsg.includes('gateway') || errMsg.includes('504') || errMsg.includes('502') || errMsg.includes('fetch failed')) {
            const err = new Error(byUsername.error.message || 'Database gateway timeout')
            err.code = 'LOOKUP_FAILED'
            throw err
          }
        }
        if (byUsername?.data) {
          storeData = clean(byUsername.data)
        }
      } catch (err) {
        if (err.code === 'LOOKUP_FAILED') throw err
        console.error('Public storefront query error (username):', err?.message || err)
        const e = new Error(err?.message || 'Store lookup failed')
        e.code = 'LOOKUP_FAILED'
        throw e
      }
    }

    if (!storeData) {
      try {
        const bySlug = await queryDb('stores').select('*').ilike('slug', lower).maybeSingle()
        if (bySlug?.error && !String(bySlug.error.message || '').toLowerCase().includes('column')) {
          console.error('Public storefront lookup error (slug):', bySlug.error.message || bySlug.error)
          const err = new Error(bySlug.error.message || 'Store lookup failed')
          err.code = 'LOOKUP_FAILED'
          throw err
        }
        if (bySlug?.data) {
          storeData = clean(bySlug.data)
        }
      } catch (err) {
        if (err.code === 'LOOKUP_FAILED') throw err
        console.error('Public storefront query error (slug):', err?.message || err)
        const e = new Error(err?.message || 'Store lookup failed')
        e.code = 'LOOKUP_FAILED'
        throw e
      }
    }

    if (!storeData) return null
    if (storeData.creatorId) {
      try {
        storeData.sections = await storeSectionsRepo.getForCreator(storeData.creatorId)
      } catch (secErr) {
        console.warn('Failed to load store sections for storefront:', secErr?.message || secErr)
        storeData.sections = []
      }
    }
    return storeData
  },

  async getByUsername(username) {
    return this.getBySlug(username)
  },

  async create(store) {
    return this.upsertStore(store.creatorId, store)
  },

  async upsertStore(creatorId, storeData) {
    const payload = {
      creatorId,
      username: storeData.username || storeData.slug || `user-${creatorId.slice(0, 8)}`,
      storeName: storeData.storeName || storeData.name || null,
      slug: storeData.slug || storeData.username || `user-${creatorId.slice(0, 8)}`,
      bio: storeData.bio || null,
      avatarUrl: storeData.avatarUrl || null,
      coverUrl: storeData.coverUrl || null,
      published: storeData.published !== undefined ? Boolean(storeData.published) : false,
      theme: storeData.theme || {},
      socialLinks: storeData.socialLinks || {},
      pages: storeData.pages !== undefined ? storeData.pages : [],
      updatedAt: new Date(),
    }

    const targetId = (storeData.id && typeof storeData.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeData.id))
      ? storeData.id
      : cryptoId()

    try {
      const existing = await prisma.store.findUnique({ where: { creatorId } })
      if (existing) {
        const updateData = { ...payload }
        delete updateData.creatorId
        const updated = await prisma.store.update({
          where: { creatorId },
          data: updateData,
        })
        const cleanStore = clean(updated)
        cleanStore.sections = await storeSectionsRepo.getForCreator(creatorId)
        return cleanStore
      } else {
        const created = await prisma.store.create({
          data: {
            id: targetId,
            ...payload,
            createdAt: new Date(),
          }
        })
        const cleanStore = clean(created)
        cleanStore.sections = await storeSectionsRepo.getForCreator(creatorId)
        return cleanStore
      }
    } catch (e) {
      console.warn('Prisma store upsert fallback to PostgREST:', e.message)
      const doc = { id: targetId, creatorId, ...toDb(payload) }
      delete doc._id
      await queryDb('stores').upsert(doc, { onConflict: 'creator_id' })
      return this.getByCreator(creatorId)
    }
  },

  async update(creatorId, patch) {
    if (!creatorId) return null
    const existing = await this.getByCreator(creatorId)
    if (!existing) return null

    const dbPatch = {}
    if (patch.storeName !== undefined) dbPatch.storeName = patch.storeName
    if (patch.username !== undefined) dbPatch.username = normalizeSlug(patch.username)
    if (patch.slug !== undefined) dbPatch.slug = normalizeSlug(patch.slug)
    if (patch.published !== undefined) dbPatch.published = Boolean(patch.published)
    if (patch.bio !== undefined) dbPatch.bio = patch.bio
    if (patch.avatarUrl !== undefined) dbPatch.avatarUrl = patch.avatarUrl
    if (patch.coverUrl !== undefined) dbPatch.coverUrl = patch.coverUrl
    if (patch.theme !== undefined) dbPatch.theme = patch.theme
    if (patch.socialLinks !== undefined) dbPatch.socialLinks = patch.socialLinks
    if (patch.pages !== undefined) dbPatch.pages = patch.pages

    if (patch.sections !== undefined && Array.isArray(patch.sections)) {
      await storeSectionsRepo.saveSections(creatorId, patch.sections)
    }

    if (Object.keys(dbPatch).length > 0) {
      try {
        const updated = await prisma.store.update({
          where: { creatorId },
          data: dbPatch,
        })
        const cleanStore = clean(updated)
        cleanStore.sections = await storeSectionsRepo.getForCreator(creatorId)
        return cleanStore
      } catch (e) {
        if (e?.code === 'P2002' || String(e?.message).includes('Unique constraint') || String(e?.message).includes('duplicate key')) {
          throw e
        }
        console.warn('Prisma store update fallback to PostgREST:', e.message)
        const updateData = { ...dbPatch, updatedAt: new Date().toISOString() }
        delete updateData._id
        await queryDb('stores').update(toDb(updateData)).eq('creator_id', creatorId)
      }
    }

    return this.getByCreator(creatorId)
  },

  async setPublished(creatorId, published) {
    return this.update(creatorId, { published: Boolean(published) })
  },

  async usernameTaken(username, exceptCreatorId) {
    const lower = normalizeSlug(username)
    if (!lower) return false
    try {
      const existing = await prisma.store.findFirst({
        where: {
          OR: [
            { username: { equals: lower, mode: 'insensitive' } },
            { slug: { equals: lower, mode: 'insensitive' } },
          ],
          NOT: exceptCreatorId ? { creatorId: exceptCreatorId } : undefined
        }
      })
      return Boolean(existing)
    } catch (e) {
      console.error('usernameTaken lookup failed (prisma):', e)
    }

    let query = queryDb('stores').select('id, creator_id').or(`username.eq.${lower},slug.eq.${lower}`)
    if (exceptCreatorId) {
      query = query.neq('creator_id', exceptCreatorId)
    }
    const { data, error } = await query.maybeSingle()
    if (error) {
      const byUser = await queryDb('stores').select('id, creator_id').eq('username', lower)
      const rows = byUser.data
      const hit = Array.isArray(rows) ? rows.find((r) => !exceptCreatorId || (r.creatorId !== exceptCreatorId && r.creator_id !== exceptCreatorId)) : rows
      return !!hit
    }
    return !!data
  },

  async slugTaken(slug, exceptCreatorId) {
    return this.usernameTaken(slug, exceptCreatorId)
  }
}

// ---------- Store Sections Repository ----------
export const storeSectionsRepo = {
  async getForCreator(creatorId) {
    if (!creatorId) return []
    try {
      const sections = await prisma.storeSection.findMany({
        where: { creatorId },
        orderBy: { position: 'asc' }
      })
      if (sections && Array.isArray(sections)) {
        return cleanMany(sections).map((s, idx) => ({
          id: s.id,
          type: s.type,
          pageId: s.pageId || null,
          position: s.position ?? idx,
          hidden: Boolean(s.hidden),
          props: s.props && typeof s.props === 'object' ? s.props : {},
        }))
      }
    } catch (e) { }

    const { data } = await queryDb('store_sections')
      .select('*')
      .eq('creator_id', creatorId)
      .order('position', { ascending: true })

    const list = cleanMany(data || [])
    return list.map((s, idx) => ({
      id: s.id || cryptoId(),
      type: s.type,
      pageId: s.pageId || s.page_id || null,
      position: s.position ?? idx,
      hidden: Boolean(s.hidden),
      props: s.props && typeof s.props === 'object' ? s.props : {},
    }))
  },

  // Alias: get all sections with pageId info (for multi-page support)
  async getAllForCreator(creatorId) {
    return this.getForCreator(creatorId)
  },

  // Get sections for a specific page (null pageId = default/home page)
  async getForPage(creatorId, pageId) {
    if (!creatorId) return []
    const isHome = pageId === null || pageId === undefined

    try {
      const sections = await prisma.storeSection.findMany({
        where: isHome ? { creatorId, pageId: null } : { creatorId, pageId },
        orderBy: { position: 'asc' }
      })
      if (sections && Array.isArray(sections)) {
        return cleanMany(sections).map((s, idx) => ({
          id: s.id,
          type: s.type,
          pageId: s.pageId || null,
          position: s.position ?? idx,
          hidden: Boolean(s.hidden),
          props: s.props && typeof s.props === 'object' ? s.props : {},
        }))
      }
    } catch (e) { }

    const query = queryDb('store_sections').select('*').eq('creator_id', creatorId)
    const { data } = isHome
      ? await query.is('page_id', null).order('position', { ascending: true })
      : await query.eq('page_id', pageId).order('position', { ascending: true })

    const list = cleanMany(data || [])
    return list.map((s, idx) => ({
      id: s.id || cryptoId(),
      type: s.type,
      pageId: s.pageId || s.page_id || null,
      position: s.position ?? idx,
      hidden: Boolean(s.hidden),
      props: s.props && typeof s.props === 'object' ? s.props : {},
    }))
  },

  // saveSections accepts optional pageId to scope which page's sections are replaced.
  // When pageId is provided, only sections for that page are replaced; other pages untouched.
  async saveSections(creatorId, sections, pageId) {
    if (!creatorId || !Array.isArray(sections)) return []

    const isPageScoped = pageId !== undefined
    const resolvedPageId = pageId || null

    const existing = isPageScoped
      ? await this.getForPage(creatorId, resolvedPageId)
      : await this.getForCreator(creatorId)

    const newSectionIds = new Set()
    const cleanSections = []

    for (let idx = 0; idx < sections.length; idx++) {
      const sec = sections[idx]
      const isValidUuid = sec.id && typeof sec.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sec.id)
      const secId = isValidUuid ? sec.id : cryptoId()
      newSectionIds.add(secId)

      const rawType = String(sec.type || 'heading').toLowerCase()
      const normalizedType = rawType === 'socials' ? 'social_links' : rawType

      const sectionPageId = sec.pageId !== undefined ? (sec.pageId || null) : resolvedPageId

      cleanSections.push({
        id: secId,
        creatorId,
        pageId: sectionPageId,
        type: normalizedType,
        position: idx,
        hidden: Boolean(sec.hidden),
        props: sec.props && typeof sec.props === 'object' ? sec.props : {},
        updatedAt: new Date()
      })
    }

    const toDeleteIds = existing
      .filter(oldSec => !newSectionIds.has(oldSec.id))
      .map(oldSec => oldSec.id)
      .filter(id => id && typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))

    try {
      const txOps = []
      if (toDeleteIds.length > 0) {
        txOps.push(prisma.storeSection.deleteMany({
          where: {
            id: { in: toDeleteIds },
            creatorId
          }
        }))
      }

      for (const s of cleanSections) {
        txOps.push(prisma.storeSection.upsert({
          where: { id: s.id },
          update: {
            pageId: s.pageId,
            type: s.type,
            position: s.position,
            hidden: s.hidden,
            props: s.props,
            updatedAt: s.updatedAt
          },
          create: {
            id: s.id,
            creatorId,
            pageId: s.pageId,
            type: s.type,
            position: s.position,
            hidden: s.hidden,
            props: s.props,
            createdAt: new Date(),
            updatedAt: s.updatedAt
          }
        }))
      }

      if (txOps.length > 0) {
        await prisma.$transaction(txOps)
      }
    } catch (e) {
      console.warn('Prisma saveSections transaction fallback to PostgREST:', e.message)
      if (toDeleteIds.length > 0) {
        try {
          await prisma.storeSection.deleteMany({ where: { id: { in: toDeleteIds }, creatorId } })
        } catch {
          await queryDb('store_sections').delete().in('id', toDeleteIds).eq('creator_id', creatorId)
        }
      }
      for (const s of cleanSections) {
        try {
          await prisma.storeSection.upsert({
            where: { id: s.id },
            update: {
              pageId: s.pageId,
              type: s.type,
              position: s.position,
              hidden: s.hidden,
              props: s.props,
              updatedAt: s.updatedAt
            },
            create: {
              id: s.id,
              creatorId,
              pageId: s.pageId,
              type: s.type,
              position: s.position,
              hidden: s.hidden,
              props: s.props,
              createdAt: new Date(),
              updatedAt: s.updatedAt
            }
          })
        } catch {
          await queryDb('store_sections').upsert(toDb({
            id: s.id,
            creatorId,
            pageId: s.pageId,
            type: s.type,
            position: s.position,
            hidden: s.hidden,
            props: s.props,
            updatedAt: new Date().toISOString()
          }), { onConflict: 'id' })
        }
      }
    }

    return cleanSections
  },

  // Delete all sections belonging to a specific page
  async deleteSectionsForPage(creatorId, pageId) {
    if (!creatorId || !pageId) return
    try {
      await prisma.storeSection.deleteMany({ where: { creatorId, pageId } })
    } catch (e) {
      await queryDb('store_sections').delete().eq('creator_id', creatorId).eq('page_id', pageId)
    }
  },

  async addSection(creatorId, section) {
    const pageId = section.pageId || null
    const sections = await this.getForPage(creatorId, pageId)
    const newSection = {
      id: section.id || cryptoId(),
      type: section.type || 'heading',
      pageId,
      hidden: Boolean(section.hidden),
      props: section.props || {},
    }
    sections.push(newSection)
    await this.saveSections(creatorId, sections, pageId)
    return clean(newSection)
  },

  async updateSection(creatorId, sectionId, patch) {
    const sections = await this.getForCreator(creatorId)
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx === -1) return null
    const pageId = sections[idx].pageId || null
    sections[idx] = { ...sections[idx], ...patch }
    const pageSections = sections.filter(s => (s.pageId || null) === pageId)
    await this.saveSections(creatorId, pageSections, pageId)
    return clean(sections[idx])
  },

  async deleteSection(creatorId, sectionId) {
    if (!creatorId || !sectionId) return false
    try {
      await prisma.storeSection.deleteMany({ where: { id: sectionId, creatorId } })
    } catch (e) {
      await queryDb('store_sections').delete().eq('id', sectionId).eq('creator_id', creatorId)
    }
    return true
  },

  async deleteMany(creatorId, sectionIds) {
    if (!creatorId || !Array.isArray(sectionIds) || sectionIds.length === 0) return { count: 0 }
    try {
      const res = await prisma.storeSection.deleteMany({
        where: {
          id: { in: sectionIds },
          creatorId
        }
      })
      return { count: res?.count ?? sectionIds.length }
    } catch (e) {
      await queryDb('store_sections').delete().in('id', sectionIds).eq('creator_id', creatorId)
      return { count: sectionIds.length }
    }
  },

  async reorderSections(creatorId, orderedSectionIds) {
    const sections = await this.getForCreator(creatorId)
    const map = new Map(sections.map(s => [s.id, s]))
    const reordered = []
    orderedSectionIds.forEach((id) => {
      if (map.has(id)) {
        reordered.push(map.get(id))
        map.delete(id)
      }
    })
    map.forEach(sec => reordered.push(sec))

    // Group by pageId and save each page's sections separately
    const byPage = new Map()
    for (const sec of reordered) {
      const pid = sec.pageId || null
      const key = pid === null ? '__home__' : pid
      if (!byPage.has(key)) byPage.set(key, [])
      byPage.get(key).push(sec)
    }

    for (const [key, pageSecs] of byPage.entries()) {
      const pid = key === '__home__' ? null : key
      await this.saveSections(creatorId, pageSecs, pid)
    }

    return this.getForCreator(creatorId)
  }
}

// ---------- Products ----------
export const productsRepo = {
  async list(creatorId, options = {}) {
    if (!creatorId) return []
    try {
      const where = { creatorId, NOT: { status: 'ARCHIVED' } }
      const include = {
        bundleItems: {
          include: { product: true },
          orderBy: { position: 'asc' },
        },
      }
      if (options.paginate || options.page || options.limit) {
        const page = Math.max(1, parseInt(options.page || 1, 10))
        const limit = Math.min(100, Math.max(1, parseInt(options.limit || 20, 10)))
        const [total, items] = await Promise.all([
          prisma.product.count({ where }),
          prisma.product.findMany({
            where,
            include,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ])
        return { items: cleanMany(items), page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
      }
      const items = await prisma.product.findMany({ where, include, orderBy: { createdAt: 'desc' } })
      return cleanMany(items)
    } catch (e) {
      console.error('productsRepo.list error:', e)
      return []
    }
  },
  async listPublished(creatorId) {
    if (!creatorId) return []
    try {
      const items = await prisma.product.findMany({
        where: { creatorId, status: 'PUBLISHED', storePublished: { not: false } },
        include: {
          bundleItems: {
            include: { product: true },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' }
      })
      return cleanMany(items)
    } catch (e) {
      return []
    }
  },
  async listByCreator(creatorId, options = {}) {
    if (!creatorId) return []
    const where = { creatorId }
    if (options.status) {
      where.status = options.status
    } else if (options.excludeArchived !== false) {
      where.NOT = { status: 'ARCHIVED' }
    }
    if (options.storePublished !== undefined) {
      where.storePublished = options.storePublished
    }
    const items = await prisma.product.findMany({
      where,
      include: {
        bundleItems: {
          include: { product: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(options.select ? { select: options.select } : {}),
    })
    return cleanMany(items)
  },
  async getById(id) {
    if (!id) return null
    try {
      const p = await prisma.product.findUnique({
        where: { id },
        include: {
          bundleItems: {
            include: { product: true },
            orderBy: { position: 'asc' },
          },
        },
      })
      if (!p) return null
      const cleaned = clean(p)
      if (p.bundleItems && Array.isArray(p.bundleItems)) {
        cleaned.bundleProducts = p.bundleItems.map((bi) => clean(bi.product)).filter(Boolean)
        cleaned.bundleProductIds = p.bundleItems.map((bi) => bi.productId)
      }
      return cleaned
    } catch (e) {
      return null
    }
  },
  async getForCreator(id, creatorId) {
    if (!id || !creatorId) return null
    try {
      const p = await prisma.product.findFirst({
        where: { id, creatorId },
        include: {
          bundleItems: {
            include: { product: true },
            orderBy: { position: 'asc' },
          },
        },
      })
      if (!p) return null
      const cleaned = clean(p)
      if (p.bundleItems && Array.isArray(p.bundleItems)) {
        cleaned.bundleProducts = p.bundleItems.map((bi) => clean(bi.product)).filter(Boolean)
        cleaned.bundleProductIds = p.bundleItems.map((bi) => bi.productId)
      }
      return cleaned
    } catch (e) {
      return null
    }
  },
  async getPublishedBySlug(creatorId, slug) {
    if (!creatorId || !slug) return null
    try {
      const p = await prisma.product.findFirst({ where: { creatorId, slug, status: 'PUBLISHED' } })
      return clean(p)
    } catch (e) {
      return null
    }
  },
  async slugExists(creatorId, slug) {
    if (!creatorId || !slug) return false
    try {
      const p = await prisma.product.findFirst({ where: { creatorId, slug }, select: { id: true } })
      return !!p
    } catch (e) {
      return false
    }
  },
  async create(product) {
    const slug = product.slug || slugify(product.title || 'product')
    const data = {
      id: product.id || cryptoId(),
      creatorId: product.creatorId,
      title: product.title || 'Untitled Product',
      slug,
      type: product.type || 'DIGITAL_DOWNLOAD',
      status: product.status || 'DRAFT',
      price: product.price !== undefined ? Number(product.price) : 0,
      currency: product.currency || 'INR',
      shortDescription: product.shortDescription || null,
      description: product.description || null,
      coverImage: product.coverImage || product.cover || null,
      thumbnail: product.thumbnail || product.cover || null,
      fileId: product.fileId || null,
      fileName: product.fileName || null,
      fileSize: product.fileSize ? Number(product.fileSize) : null,
      fileMime: product.fileMime || null,
      storePublished: product.storePublished !== false,
      marketplacePublished: Boolean(product.marketplacePublished),
      displayMode: product.displayMode || 'classic',
      redirectUrl: product.redirectUrl || null,
    }
    const created = await prisma.product.create({ data })
    return clean(created)
  },
  async update(id, creatorId, patch) {
    if (!id || !creatorId) return null
    const VALID_PRODUCT_FIELDS = new Set([
      'title',
      'slug',
      'type',
      'status',
      'price',
      'currency',
      'shortDescription',
      'description',
      'coverImage',
      'thumbnail',
      'fileId',
      'fileName',
      'fileSize',
      'fileMime',
      'storePublished',
      'marketplacePublished',
      'displayMode',
      'redirectUrl',
      'updatedAt',
    ])

    const rawPatch = { ...patch }
    if (rawPatch.cover !== undefined) {
      if (rawPatch.coverImage === undefined) rawPatch.coverImage = rawPatch.cover
      if (rawPatch.thumbnail === undefined) rawPatch.thumbnail = rawPatch.cover
      delete rawPatch.cover
    }

    const updateData = { updatedAt: new Date() }
    for (const key of Object.keys(rawPatch)) {
      if (VALID_PRODUCT_FIELDS.has(key)) {
        updateData[key] = rawPatch[key]
      }
    }

    if (updateData.price !== undefined) updateData.price = Number(updateData.price)
    if (updateData.fileSize !== undefined) updateData.fileSize = updateData.fileSize ? Number(updateData.fileSize) : null

    await prisma.product.updateMany({
      where: { id, creatorId },
      data: updateData,
    })
    return this.getForCreator(id, creatorId)
  },
  async remove(id, creatorId) {
    await prisma.product.deleteMany({ where: { id, creatorId } })
  },
  async count(creatorId) {
    if (!creatorId) return 0
    return prisma.product.count({ where: { creatorId, NOT: { status: 'ARCHIVED' } } })
  },
  async atomicallyReserveQuantity(productId) {
    const product = await this.getById(productId)
    if (!product) return { success: false }
    return { success: true, product }
  },
}

// ---------- Custom Checkout Fields ----------
export const checkoutFieldsRepo = {
  async getForProduct(productId) {
    const product = await productsRepo.getById(productId)
    if (!product || !Array.isArray(product.checkoutFields)) return []
    return product.checkoutFields.sort((a, b) => (a.order || 0) - (b.order || 0))
  },
  async getForCreator(productId, creatorId) {
    const product = await productsRepo.getForCreator(productId, creatorId)
    if (!product) return null
    return (product.checkoutFields || []).sort((a, b) => (a.order || 0) - (b.order || 0))
  },
  async addField(creatorId, productId, field) {
    const product = await productsRepo.getForCreator(productId, creatorId)
    if (!product) return null
    const existing = product.checkoutFields || []
    const updated = [...existing, field]
    await productsRepo.update(productId, creatorId, { checkoutFields: updated })
    return field
  },
  async updateField(creatorId, productId, fieldId, patch) {
    const product = await productsRepo.getForCreator(productId, creatorId)
    if (!product || !Array.isArray(product.checkoutFields)) return null
    let updatedField = null
    const updated = product.checkoutFields.map(f => {
      if (f.id === fieldId) {
        updatedField = { ...f, ...patch, updatedAt: new Date() }
        return updatedField
      }
      return f
    })
    if (!updatedField) return null
    await productsRepo.update(productId, creatorId, { checkoutFields: updated })
    return updatedField
  },
  async deleteField(creatorId, productId, fieldId) {
    const product = await productsRepo.getForCreator(productId, creatorId)
    if (!product || !Array.isArray(product.checkoutFields)) return false
    const updated = product.checkoutFields.filter(f => f.id !== fieldId)
    await productsRepo.update(productId, creatorId, { checkoutFields: updated })
    return true
  },
  async reorderFields(creatorId, productId, orderedFieldIds) {
    const product = await productsRepo.getForCreator(productId, creatorId)
    if (!product || !Array.isArray(product.checkoutFields)) return []
    const map = new Map(product.checkoutFields.map(f => [f.id, f]))
    const updated = []
    orderedFieldIds.forEach((id, idx) => {
      if (map.has(id)) {
        const item = map.get(id)
        item.order = idx + 1
        updated.push(item)
        map.delete(id)
      }
    })
    map.forEach(item => updated.push(item))
    await productsRepo.update(productId, creatorId, { checkoutFields: updated })
    return updated
  }
}

// ---------- Customers ----------
export const customersRepo = {
  async upsert(creatorId, email, name, country = null) {
    const lower = String(email).toLowerCase().trim()
    try {
      const existing = await prisma.customer.findFirst({
        where: creatorId ? { creatorId, email: lower } : { email: lower }
      })
      if (existing) {
        const updateData = { name: name || existing.name, updatedAt: new Date() }
        if (country) updateData.country = country
        const updated = await prisma.customer.update({
          where: { id: existing.id },
          data: updateData
        })
        return clean(updated)
      } else {
        const created = await prisma.customer.create({
          data: {
            id: cryptoId(),
            creatorId: creatorId || null,
            email: lower,
            name: name || '',
            country: country || null,
            totalSpent: 0,
            ordersCount: 0,
          }
        })
        return clean(created)
      }
    } catch (e) {
      console.error('customersRepo.upsert error:', e)
      throw e
    }
  },
  async list(creatorId, options = {}) {
    if (!creatorId) return []
    try {
      const where = { creatorId }
      if (options.paginate || options.page || options.limit) {
        const page = Math.max(1, parseInt(options.page || 1, 10))
        const limit = Math.min(100, Math.max(1, parseInt(options.limit || 20, 10)))
        const [total, items] = await Promise.all([
          prisma.customer.count({ where }),
          prisma.customer.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ])
        return { items: cleanMany(items), page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
      }
      const items = await prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } })
      return cleanMany(items)
    } catch (e) {
      return []
    }
  },
  async get(id, creatorId) {
    if (!id) return null
    try {
      const c = await prisma.customer.findFirst({ where: creatorId ? { id, creatorId } : { id } })
      return clean(c)
    } catch (e) {
      return null
    }
  },
  async getByEmail(creatorId, email) {
    if (!email) return null
    const lower = String(email).toLowerCase().trim()
    try {
      const c = await prisma.customer.findFirst({ where: creatorId ? { creatorId, email: lower } : { email: lower } })
      return clean(c)
    } catch (e) {
      return null
    }
  },
  async listByEmail(email) {
    if (!email) return []
    const lower = String(email).toLowerCase().trim()
    try {
      const items = await prisma.customer.findMany({ where: { email: lower } })
      return cleanMany(items)
    } catch (e) {
      return []
    }
  },
}

// ---------- Orders ----------
export const ordersRepo = {
  async create(order) {
    const data = {
      id: order.id || cryptoId(),
      creator: { connect: { id: order.creatorId } },
      product: { connect: { id: order.productId } },
      automation: order.automationId ? { connect: { id: order.automationId } } : undefined,
      customer: order.customerId ? { connect: { id: order.customerId } } : undefined,
      customerName: order.customerName || null,
      customerEmail: String(order.customerEmail).toLowerCase().trim(),
      amount: Number(order.amount),
      currency: order.currency || 'INR',
      originalPrice: order.originalPrice !== undefined && order.originalPrice !== null ? Number(order.originalPrice) : (order.amount !== undefined ? Number(order.amount) : null),
      originalCurrency: order.originalCurrency || order.currency || 'USD',
      presentmentAmount: order.presentmentAmount !== undefined && order.presentmentAmount !== null ? Number(order.presentmentAmount) : null,
      presentmentCurrency: order.presentmentCurrency || null,
      chargedAmount: order.chargedAmount !== undefined && order.chargedAmount !== null ? Number(order.chargedAmount) : null,
      chargedCurrency: order.chargedCurrency || null,
      exchangeRate: order.exchangeRate !== undefined && order.exchangeRate !== null ? Number(order.exchangeRate) : null,
      exchangeRateTimestamp: order.exchangeRateTimestamp ? new Date(order.exchangeRateTimestamp) : null,
      taxAmount: order.taxAmount !== undefined && order.taxAmount !== null ? Number(order.taxAmount) : null,
      taxCurrency: order.taxCurrency || null,
      status: order.status || 'PENDING',
      paymentProvider: order.paymentProvider || 'dodo',
      country: order.country || null,
      dodoPaymentId: order.dodoPaymentId || null,
      dodoSessionId: order.dodoSessionId || null,
      razorpayOrderId: order.razorpayOrderId || null,
      razorpayPaymentId: order.razorpayPaymentId || null,
    }
    const created = await prisma.order.create({ data })
    return clean(created)
  },
  async getById(id) {
    if (!id) return null
    try {
      const o = await prisma.order.findUnique({ where: { id } })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getForCreator(id, creatorId) {
    if (!id || !creatorId) return null
    try {
      const o = await prisma.order.findFirst({ where: { id, creatorId } })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getByDodoPaymentId(dodoPaymentId) {
    if (!dodoPaymentId) return null
    try {
      const o = await prisma.order.findFirst({ where: { dodoPaymentId } })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getByDodoSessionId(dodoSessionId) {
    if (!dodoSessionId) return null
    try {
      const o = await prisma.order.findFirst({ where: { dodoSessionId } })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getByRazorpayOrderId(orderId) {
    if (!orderId) return null
    try {
      const o = await prisma.order.findUnique({ where: { razorpayOrderId: orderId } })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getByRazorpayPaymentId(paymentId) {
    if (!paymentId) return null
    try {
      const o = await prisma.order.findFirst({ where: { razorpayPaymentId: paymentId } })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getLatestPaidByProductAndEmail(productId, email) {
    if (!productId || !email) return null
    try {
      const lower = String(email).toLowerCase().trim()
      const o = await prisma.order.findFirst({
        where: {
          productId,
          customerEmail: lower,
          status: 'PAID'
        },
        orderBy: { createdAt: 'desc' }
      })
      return clean(o)
    } catch (e) {
      return null
    }
  },
  async getLatestPendingByProductAndEmail(productId, email) {
    if (!productId || !email) return null
    try {
      const lower = String(email).toLowerCase().trim()
      const o = await prisma.order.findFirst({
        where: {
          productId,
          customerEmail: lower,
          status: 'PENDING'
        },
        orderBy: { createdAt: 'desc' }
      })
      return clean(o)
    } catch (e) {
      return null
    }
  },

  async update(id, patch) {
    const updateData = { ...patch, updatedAt: new Date() }
    delete updateData._id
    delete updateData.id
    delete updateData.creatorId
    delete updateData.paidAt

    if (updateData.customerId) {
      updateData.customer = { connect: { id: updateData.customerId } }
      delete updateData.customerId
    }
    if (updateData.amount !== undefined && updateData.amount !== null) updateData.amount = Number(updateData.amount)
    if (updateData.originalPrice !== undefined && updateData.originalPrice !== null) updateData.originalPrice = Number(updateData.originalPrice)
    if (updateData.presentmentAmount !== undefined && updateData.presentmentAmount !== null) updateData.presentmentAmount = Number(updateData.presentmentAmount)
    if (updateData.chargedAmount !== undefined && updateData.chargedAmount !== null) updateData.chargedAmount = Number(updateData.chargedAmount)
    if (updateData.exchangeRate !== undefined && updateData.exchangeRate !== null) updateData.exchangeRate = Number(updateData.exchangeRate)
    if (updateData.taxAmount !== undefined && updateData.taxAmount !== null) updateData.taxAmount = Number(updateData.taxAmount)
    if (updateData.exchangeRateTimestamp) updateData.exchangeRateTimestamp = new Date(updateData.exchangeRateTimestamp)
    const updated = await prisma.order.update({
      where: { id },
      data: updateData,
    })
    return clean(updated)
  },
  async markPaidOnce(id, patch) {
    const existing = await this.getById(id)
    if (!existing || existing.status === 'PAID') return false
    await this.update(id, { status: 'PAID', ...patch })
    return true
  },
  async markRefunded(id) {
    return this.update(id, { status: 'REFUNDED' })
  },
  async list(creatorId, options = {}) {
    if (!creatorId) return []
    try {
      const where = { creatorId }
      if (options.paginate || options.page || options.limit) {
        const page = Math.max(1, parseInt(options.page || 1, 10))
        const limit = Math.min(100, Math.max(1, parseInt(options.limit || 20, 10)))
        const [total, items] = await Promise.all([
          prisma.order.count({ where }),
          prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ])
        return { items: cleanMany(items), page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
      }
      const items = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' } })
      return cleanMany(items)
    } catch (e) {
      return []
    }
  },
  async findStalePendingOrders(cutoffDate) {
    try {
      const items = await prisma.order.findMany({
        where: {
          status: 'PENDING',
          paymentProvider: { in: ['dodo', 'DODO'] },
          updatedAt: { lt: cutoffDate },
        },
      })
      return cleanMany(items)
    } catch (e) {
      console.warn('[ordersRepo] findStalePendingOrders error:', e.message)
      return []
    }
  },
}

// ---------- Entitlements ----------
export const entitlementsRepo = {
  async createForOrder(ent) {
    let email = ent.customerEmail || ent.email
    if (!email && ent.orderId) {
      try {
        const order = await prisma.order.findUnique({ where: { id: ent.orderId }, select: { customerEmail: true } })
        if (order) email = order.customerEmail
      } catch (e) { }
    }
    const customerEmail = String(email || 'customer@creatorzero.com').toLowerCase().trim()

    const data = {
      id: ent.id || cryptoId(),
      order: ent.orderId ? { connect: { id: ent.orderId } } : undefined,
      customer: ent.customerId ? { connect: { id: ent.customerId } } : undefined,
      product: { connect: { id: ent.productId } },
      customerEmail,
      status: ent.status || 'ACTIVE',
      startsAt: ent.startsAt ? new Date(ent.startsAt) : new Date(),
      expiresAt: ent.expiresAt ? new Date(ent.expiresAt) : null,
    }
    const created = await prisma.entitlement.create({ data })
    return clean(created)
  },
  async create(ent) {
    return this.createForOrder(ent)
  },
  async getById(id) {
    if (!id) return null
    try {
      const e = await prisma.entitlement.findUnique({ where: { id } })
      return clean(e)
    } catch (err) {
      return null
    }
  },
  async getByOrder(orderId) {
    if (!orderId) return null
    try {
      const e = await prisma.entitlement.findUnique({ where: { orderId } })
      return clean(e)
    } catch (err) {
      return null
    }
  },
  async revokeForOrder(orderId) {
    if (!orderId) return null
    try {
      await prisma.entitlement.update({
        where: { orderId },
        data: { status: 'REVOKED', updatedAt: new Date() }
      })
      return this.getByOrder(orderId)
    } catch (err) {
      return null
    }
  },
  async has(customerId, productId, customerEmail) {
    if (!productId) return false
    try {
      const cleanEmail = customerEmail ? String(customerEmail).toLowerCase().trim() : null
      const OR = []
      if (customerId) OR.push({ customerId, productId, status: 'ACTIVE' })
      if (cleanEmail) {
        OR.push({ customerEmail: { equals: cleanEmail, mode: 'insensitive' }, productId, status: 'ACTIVE' })
        OR.push({ order: { customerEmail: { equals: cleanEmail, mode: 'insensitive' }, status: 'PAID' }, productId, status: 'ACTIVE' })
        OR.push({ customer: { email: { equals: cleanEmail, mode: 'insensitive' } }, productId, status: 'ACTIVE' })
      }
      if (OR.length === 0) return false
      const e = await prisma.entitlement.findFirst({
        where: { OR },
        include: { order: true }
      })
      if (!e) return false
      if (e.order && e.order.status !== 'PAID') return false
      return true
    } catch (err) {
      console.warn('entitlementsRepo.has note:', err.message)
      return false
    }
  },
}

// ---------- Product Access Tokens ----------
export const productAccessTokensRepo = {
  async create({ orderId, entitlementId, productId, customerEmail, tokenHash, expiresAt }) {
    if (!tokenHash || !orderId || !productId || !customerEmail) {
      throw new Error('Missing required fields for product access token')
    }
    const cleanEmail = String(customerEmail).toLowerCase().trim()
    const exp = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const created = await prisma.productAccessToken.create({
      data: {
        id: cryptoId(),
        tokenHash,
        orderId,
        entitlementId: entitlementId || null,
        productId,
        customerEmail: cleanEmail,
        expiresAt: exp,
      },
    })
    return clean(created)
  },
  async getByTokenHash(tokenHash) {
    if (!tokenHash) return null
    try {
      const record = await prisma.productAccessToken.findUnique({
        where: { tokenHash },
        include: {
          order: true,
          entitlement: true,
          product: {
            include: {
              creator: {
                include: {
                  store: true,
                  creatorProfile: true,
                },
              },
            },
          },
        },
      })
      return clean(record)
    } catch (err) {
      return null
    }
  },
  async getByOrderId(orderId) {
    if (!orderId) return null
    try {
      const record = await prisma.productAccessToken.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      })
      return clean(record)
    } catch (err) {
      return null
    }
  },
  async markUsed(id) {
    if (!id) return null
    try {
      const updated = await prisma.productAccessToken.update({
        where: { id },
        data: { usedAt: new Date(), updatedAt: new Date() },
      })
      return clean(updated)
    } catch (err) {
      return null
    }
  },
}

// ---------- Analytics ----------
export const analyticsRepo = {
  async track(evt) {
    const doc = { id: evt.id || cryptoId(), ...evt }
    delete doc._id
    const res = await supabaseAdmin.from('analytics_events').insert(doc)
    if (res && res.error) {
      console.error('analyticsRepo.track error:', res.error)
    }
  },
  async countByType(creatorId, type, since) {
    let query = supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true }).eq('creatorId', creatorId).eq('type', type)
    if (since) query = query.gte('createdAt', new Date(since).toISOString())
    const res = await query
    if (res && res.error) {
      console.error('analyticsRepo.countByType error:', res.error)
    }
    if (typeof res?.count === 'number') return res.count
    const data = res?.data
    return data ? data.length : 0
  },
  async revenueSeries(creatorId, since) {
    let query = supabaseAdmin.from('orders').select('*').eq('creatorId', creatorId).eq('status', 'PAID')
    if (since) query = query.gte('createdAt', new Date(since).toISOString())
    const { data } = await query
    return cleanMany(data || [])
  },
  async listEvents(creatorId, { type, since, until, productId } = {}) {
    let query = supabaseAdmin.from('analytics_events').select('*').eq('creatorId', creatorId)
    if (type) query = query.eq('type', type)
    if (productId) query = query.eq('productId', productId)
    if (since) query = query.gte('createdAt', new Date(since).toISOString())
    if (until) query = query.lte('createdAt', new Date(until).toISOString())
    const res = await query
    return cleanMany(res?.data || [])
  },
  async getTrafficSources(creatorId, since) {
    const events = await this.listEvents(creatorId, { since })
    const views = events.filter((e) => e.type === 'store_view' || e.type === 'product_view')
    if (!views.length) return []

    const sourceCounts = {}
    for (const v of views) {
      let src = 'Direct / None'
      const ref = v.metadata?.referrer || v.metadata?.ref || ''
      const explicitSrc = v.metadata?.source || v.metadata?.utm_source || ''

      if (explicitSrc) {
        src = explicitSrc
      } else if (ref) {
        try {
          const urlObj = new URL(ref.startsWith('http') ? ref : `https://${ref}`)
          const host = urlObj.hostname.toLowerCase().replace(/^www\./, '')
          if (/instagram\.com/i.test(host)) src = 'Instagram'
          else if (/twitter\.com|t\.co|x\.com/i.test(host)) src = 'Twitter / X'
          else if (/youtube\.com|youtu\.be/i.test(host)) src = 'YouTube'
          else if (/tiktok\.com/i.test(host)) src = 'TikTok'
          else if (/linkedin\.com/i.test(host)) src = 'LinkedIn'
          else if (/google\./i.test(host)) src = 'Google / Search'
          else if (/facebook\.com|fb\.com/i.test(host)) src = 'Facebook'
          else src = host
        } catch {
          src = ref.slice(0, 30)
        }
      }
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    }

    const total = views.length
    return Object.entries(sourceCounts)
      .map(([source, count]) => ({
        source,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
  },
}

// ---------- Razorpay events (idempotency) ----------
export const razorpayEventsRepo = {
  async claim(eventId, type) {
    const { data: existing } = await supabaseAdmin.from('razorpay_events').select('id').eq('eventId', eventId).maybeSingle()
    if (existing) return false
    await supabaseAdmin.from('razorpay_events').insert({ id: cryptoId(), eventId, type, status: 'PROCESSING', createdAt: new Date().toISOString() })
    return true
  },
  async markProcessed(eventId) {
    await supabaseAdmin.from('razorpay_events').update({ status: 'PROCESSED', processedAt: new Date().toISOString() }).eq('eventId', eventId)
  },
  async markFailed(eventId, error) {
    await supabaseAdmin.from('razorpay_events').delete().eq('eventId', eventId)
  },
}

// ---------- Razorpay Route Accounts / Payout Profiles ----------
export const payoutProfilesRepo = {
  async getByCreator(creatorId) {
    if (!creatorId) return null
    const { data } = await queryDb('payout_profiles').select('*').eq('creatorId', creatorId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayAccountId(razorpayAccountId) {
    if (!razorpayAccountId) return null
    const { data } = await queryDb('payout_profiles').select('*').eq('razorpayAccountId', razorpayAccountId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayFundAccountId(razorpayFundAccountId) {
    if (!razorpayFundAccountId) return null
    const { data } = await queryDb('payout_profiles').select('*').eq('razorpayFundAccountId', razorpayFundAccountId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayValidationId(razorpayValidationId) {
    if (!razorpayValidationId) return null
    const { data } = await queryDb('payout_profiles').select('*').eq('razorpayValidationId', razorpayValidationId).maybeSingle()
    return clean(data)
  },
  async upsert(creatorId, data) {
    const existing = await this.getByCreator(creatorId)
    const now = new Date().toISOString()
    const payload = {
      id: existing?.id || data.id || cryptoId(),
      creatorId,
      payoutMethod: data.payoutMethod !== undefined ? data.payoutMethod : (existing?.payoutMethod ?? (data.businessType || 'ACCOUNT')),
      legalName: data.legalName !== undefined ? data.legalName : (existing?.legalName ?? ''),
      accountHolderName: data.accountHolderName !== undefined ? data.accountHolderName : (existing?.accountHolderName ?? ''),
      verifiedAccountHolderName: data.verifiedAccountHolderName !== undefined ? data.verifiedAccountHolderName : (existing?.verifiedAccountHolderName ?? ''),
      businessType: data.businessType !== undefined ? data.businessType : (existing?.businessType ?? 'ACCOUNT'),
      phone: data.phone !== undefined ? data.phone : (existing?.phone ?? ''),
      email: data.email !== undefined ? data.email : (existing?.email ?? ''),
      bankName: data.bankName !== undefined ? data.bankName : (existing?.bankName ?? ''),
      accountNumber: data.accountNumber !== undefined ? data.accountNumber : (existing?.accountNumber ?? ''),
      ifscCode: data.ifscCode !== undefined ? data.ifscCode : (data.ifsc !== undefined ? data.ifsc : (existing?.ifscCode ?? existing?.ifsc ?? '')),
      bankLast4: data.bankLast4 !== undefined ? data.bankLast4 : (existing?.bankLast4 ?? ''),
      bankIfscMasked: data.bankIfscMasked !== undefined ? data.bankIfscMasked : (existing?.bankIfscMasked ?? ''),
      ifsc: data.ifsc !== undefined ? data.ifsc : (data.ifscCode !== undefined ? data.ifscCode : (existing?.ifsc ?? existing?.ifscCode ?? '')),
      upiId: data.upiId !== undefined ? data.upiId : (existing?.upiId ?? ''),
      paypalEmail: data.paypalEmail !== undefined ? data.paypalEmail : (existing?.paypalEmail ?? null),
      paypalId: data.paypalId !== undefined ? data.paypalId : (existing?.paypalId ?? null),
      payoutSchedule: data.payoutSchedule !== undefined ? data.payoutSchedule : (existing?.payoutSchedule ?? 'weekly'),
      minimumPayoutThreshold: Number(data.minimumPayoutThreshold !== undefined ? data.minimumPayoutThreshold : (existing?.minimumPayoutThreshold ?? 100)),
      isPayoutPaused: Boolean(data.isPayoutPaused !== undefined ? data.isPayoutPaused : (existing?.isPayoutPaused || false)),
      razorpayAccountId: data.razorpayAccountId !== undefined ? data.razorpayAccountId : (existing?.razorpayAccountId ?? null),
      razorpayContactId: data.razorpayContactId !== undefined ? data.razorpayContactId : (existing?.razorpayContactId ?? null),
      razorpayFundAccountId: data.razorpayFundAccountId !== undefined ? data.razorpayFundAccountId : (existing?.razorpayFundAccountId ?? null),
      razorpayValidationId: data.razorpayValidationId !== undefined ? data.razorpayValidationId : (existing?.razorpayValidationId ?? null),
      provider: data.provider !== undefined ? data.provider : (existing?.provider ?? 'RAZORPAY_ROUTE'),
      status: data.status !== undefined ? data.status : (existing?.status ?? 'NOT_CONFIGURED'),
      onboardingStatus: data.onboardingStatus !== undefined ? data.onboardingStatus : (existing?.onboardingStatus ?? 'NOT_CONFIGURED'),
      verificationStatus: data.verificationStatus !== undefined ? data.verificationStatus : (existing?.verificationStatus ?? 'NOT_APPLICABLE'),
      verificationMessage: data.verificationMessage !== undefined ? data.verificationMessage : (existing?.verificationMessage ?? ''),
      verificationStartedAt: data.verificationStartedAt !== undefined ? data.verificationStartedAt : (existing?.verificationStartedAt ?? null),
      verificationCompletedAt: data.verificationCompletedAt !== undefined ? data.verificationCompletedAt : (existing?.verificationCompletedAt ?? null),
      currentStep: data.currentStep !== undefined ? data.currentStep : (existing?.currentStep ?? 1),
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    }
    const { error } = await queryDb('payout_profiles').upsert(payload, { onConflict: 'creator_id' })
    if (error) {
      console.error('[payout_profiles upsert]', error.message || error)
      throw new Error(error.message || 'Failed to save payout profile.')
    }
    return (await this.getByCreator(creatorId)) || clean(payload)
  },
  async updateStatus(creatorId, status, details = {}) {
    await queryDb('payout_profiles').update({ status, onboardingStatus: status, ...details, updatedAt: new Date().toISOString() }).eq('creatorId', creatorId)
    return this.getByCreator(creatorId)
  },
  async listAll(options = {}) {
    const { data } = await queryDb('payout_profiles').select('*').order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
}

// ---------- Payout Audit Repository ----------
export const payoutAuditRepo = {
  async logEvent({ creatorId, event, metadata = {} }) {
    const doc = {
      id: cryptoId(),
      creatorId,
      event,
      metadata: {
        provider: 'RAZORPAY_ROUTE',
        razorpayAccountId: metadata.razorpayAccountId || null,
        status: metadata.status || null,
        verificationStatus: metadata.verificationStatus || null,
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    }
    const { error } = await queryDb('payout_audit_logs').insert(doc)
    if (error) console.warn('[payout_audit_logs insert]', error.message || error)
    return clean(doc)
  },
  async listByCreator(creatorId) {
    const { data } = await queryDb('payout_audit_logs').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
}

export const razorpayAccountRepo = {
  async getByCreator(creatorId) { return payoutProfilesRepo.getByCreator(creatorId) },
  async getByRazorpayAccount(razorpayAccountId) { return payoutProfilesRepo.getByRazorpayAccountId(razorpayAccountId) },
  async upsert(creatorId, data) { return payoutProfilesRepo.upsert(creatorId, data) },
}

// ---------- Detailed Payments Repository ----------
export const paymentsRepo = {
  async create(payment) {
    const doc = { id: payment.id || cryptoId(), ...payment }
    delete doc._id
    await supabaseAdmin.from('payments').insert(doc)
    return clean(doc)
  },
  async getById(id) {
    const { data } = await supabaseAdmin.from('payments').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getByOrderId(orderId) {
    const { data } = await supabaseAdmin.from('payments').select('*').eq('orderId', orderId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayOrderId(razorpayOrderId) {
    const { data } = await supabaseAdmin.from('payments').select('*').eq('razorpayOrderId', razorpayOrderId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayPaymentId(razorpayPaymentId) {
    const { data } = await supabaseAdmin.from('payments').select('*').eq('razorpayPaymentId', razorpayPaymentId).maybeSingle()
    return clean(data)
  },
  async update(id, patch) {
    await supabaseAdmin.from('payments').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id)
    return this.getById(id)
  },
  async listByCreator(creatorId, options = {}) {
    const { data } = await supabaseAdmin.from('payments').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
}

// ---------- Razorpay Route Transfers ----------
export const transfersRepo = {
  async create(transfer) {
    const doc = { id: transfer.id || cryptoId(), ...transfer }
    delete doc._id
    await supabaseAdmin.from('transfers').insert(doc)
    return clean(doc)
  },
  async getById(id) {
    const { data } = await supabaseAdmin.from('transfers').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getByOrderId(orderId) {
    const { data } = await supabaseAdmin.from('transfers').select('*').eq('orderId', orderId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayTransferId(razorpayTransferId) {
    const { data } = await supabaseAdmin.from('transfers').select('*').eq('razorpayTransferId', razorpayTransferId).maybeSingle()
    return clean(data)
  },
  async update(id, patch) {
    await supabaseAdmin.from('transfers').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id)
    return this.getById(id)
  },
  async listByCreator(creatorId, options = {}) {
    const { data } = await supabaseAdmin.from('transfers').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
}

// ---------- Refunds ----------
export const refundsRepo = {
  async create(refund) {
    const doc = { id: refund.id || cryptoId(), ...refund }
    delete doc._id
    await supabaseAdmin.from('refunds').insert(doc)
    return clean(doc)
  },
  async getById(id) {
    const { data } = await supabaseAdmin.from('refunds').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getByOrderId(orderId) {
    const { data } = await supabaseAdmin.from('refunds').select('*').eq('orderId', orderId).maybeSingle()
    return clean(data)
  },
  async getByRazorpayRefundId(razorpayRefundId) {
    const { data } = await supabaseAdmin.from('refunds').select('*').eq('razorpayRefundId', razorpayRefundId).maybeSingle()
    return clean(data)
  },
  async update(id, patch) {
    await supabaseAdmin.from('refunds').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id)
    return this.getById(id)
  },
  async listByCreator(creatorId, options = {}) {
    const { data } = await supabaseAdmin.from('refunds').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
}

// ---------- Earnings Ledger Repository ----------
export const earningsLedgerRepo = {
  async createEntry(entry) {
    const doc = {
      id: entry.id || cryptoId(),
      creatorId: entry.creatorId,
      orderId: entry.orderId || null,
      productId: entry.productId || null,
      productTitle: entry.productTitle || '',
      customerEmail: entry.customerEmail || '',
      type: entry.type || 'SALE',
      grossAmount: Number(entry.grossAmount || 0),
      platformFee: Number(entry.platformFee || 0),
      processingFee: Number(entry.processingFee || 0),
      refundAmount: Number(entry.refundAmount || 0),
      netAmount: Number(entry.netAmount || 0),
      status: entry.status || 'AVAILABLE',
      currency: (entry.currency || 'INR').toUpperCase(),
      paymentMode: entry.paymentMode || 'TEST',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await supabaseAdmin.from('earnings_ledger').insert(doc)
    return clean(doc)
  },

  async listByCreator(creatorId, options = {}) {
    let query = supabaseAdmin.from('earnings_ledger').select('*').eq('creatorId', creatorId)
    if (options.type) query = query.eq('type', options.type)
    if (options.status) query = query.eq('status', options.status)
    const { data } = await query.order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },

  async getSummary(creatorId) {
    const { data: entries } = await supabaseAdmin.from('earnings_ledger').select('*').eq('creatorId', creatorId)
    const docs = entries || []

    let totalSales = 0
    let totalPlatformFees = 0
    let totalProcessingFees = 0
    let totalRefunds = 0
    let netCreatorEarnings = 0
    let pendingEarnings = 0
    let availableEarnings = 0
    let paidOut = 0

    for (const e of docs) {
      if (e.type === 'SALE') {
        totalSales += Number(e.grossAmount || 0)
        totalPlatformFees += Number(e.platformFee || 0)
        totalProcessingFees += Number(e.processingFee || 0)

        const itemNet = Number(e.netAmount !== undefined ? e.netAmount : (e.grossAmount - (e.platformFee || 0) - (e.processingFee || 0)))
        netCreatorEarnings += itemNet

        if (e.status === 'PENDING') {
          pendingEarnings += itemNet
        } else if (e.status === 'AVAILABLE') {
          availableEarnings += itemNet
        } else if (e.status === 'PAID_OUT') {
          paidOut += itemNet
        }
      } else if (e.type === 'REFUND') {
        const refAmt = Number(e.refundAmount || e.grossAmount || 0)
        totalRefunds += refAmt
        netCreatorEarnings -= refAmt
        availableEarnings = Math.max(0, availableEarnings - refAmt)
      } else if (e.type === 'PAYOUT_SETTLED') {
        const trfAmt = Number(e.netAmount || e.grossAmount || 0)
        paidOut += trfAmt
        availableEarnings = Math.max(0, availableEarnings - trfAmt)
      }
    }

    return {
      totalSales,
      totalPlatformFees,
      totalProcessingFees,
      totalRefunds,
      netCreatorEarnings: Math.max(0, netCreatorEarnings),
      pendingEarnings: Math.max(0, pendingEarnings),
      availableEarnings: Math.max(0, availableEarnings),
      paidOut,
    }
  },
}

// ---------- Webhook Events Idempotency ----------
export const webhookEventsRepo = {
  async claim(eventId, eventType = 'RAZORPAY', payloadHash = '') {
    if (!eventId) return true
    try {
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId }
      })
      if (existing) return false
      await prisma.webhookEvent.create({
        data: {
          eventId,
          provider: String(eventType).startsWith('META') ? 'META_INSTAGRAM' : 'RAZORPAY',
        }
      })
      return true
    } catch (e) {
      if (e.code === 'P2002') return false
    }
    const { data: existing } = await supabaseAdmin.from('webhook_events').select('id').eq('event_id', eventId).maybeSingle()
    if (existing) return false
    await supabaseAdmin.from('webhook_events').insert({
      event_id: eventId, provider: 'RAZORPAY'
    }).catch(() => { })
    return true
  },
  async markProcessed(eventId) {
    if (!eventId) return
    try {
      await prisma.webhookEvent.update({
        where: { eventId },
        data: { processedAt: new Date() },
      })
    } catch (e) { }
    try {
      await supabaseAdmin.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
    } catch (e) { }
  },
  async markFailed(eventId, error) {
    if (!eventId) return
    try {
      await supabaseAdmin.from('webhook_events').update({ error: String(error) }).eq('event_id', eventId)
    } catch (e) { }
  },
  async isProcessed(eventId) {
    if (!eventId) return false
    try {
      const existing = await prisma.webhookEvent.findUnique({ where: { eventId } })
      return !!existing
    } catch (e) {
      return false
    }
  },
  async recordEvent(eventId, provider = 'META_INSTAGRAM', payload = {}) {
    if (!eventId) return null
    try {
      const evt = await prisma.webhookEvent.create({
        data: {
          eventId,
          provider,
          payload,
        }
      })
      return clean(evt)
    } catch (e) {
      console.error('webhookEventsRepo.recordEvent error:', e)
      return null
    }
  }
}

// ---------- Courses ----------
export const coursesRepo = {
  async getById(id) {
    let { data } = await supabaseAdmin.from('courses').select('*').eq('id', id).maybeSingle()
    if (!data) {
      const res = await supabaseAdmin.from('courses').select('*').eq('productId', id).maybeSingle()
      data = res.data
    }
    return clean(data)
  },
  async getForCreator(id, creatorId) {
    const { data } = await supabaseAdmin.from('courses').select('*').eq('id', id).eq('creatorId', creatorId).maybeSingle()
    return clean(data)
  },
  async getByProduct(productId) {
    const { data } = await supabaseAdmin.from('courses').select('*').eq('productId', productId).maybeSingle()
    return clean(data)
  },
  async getBySlug(creatorId, slug) {
    const { data } = await supabaseAdmin.from('courses').select('*').eq('creatorId', creatorId).eq('slug', slug).maybeSingle()
    return clean(data)
  },
  async list(creatorId, options = {}) {
    const { data } = await supabaseAdmin.from('courses').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
  async create(course) {
    const doc = { id: course.id || cryptoId(), ...course }
    delete doc._id
    await supabaseAdmin.from('courses').insert(doc)
    return clean(doc)
  },
  async update(id, creatorId, patch) {
    await supabaseAdmin.from('courses').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id).eq('creatorId', creatorId)
    return this.getForCreator(id, creatorId)
  },
  async remove(id, creatorId) {
    await supabaseAdmin.from('courses').delete().eq('id', id).eq('creatorId', creatorId)
  },
}

// ---------- Modules ----------
export const modulesRepo = {
  async listByCourse(courseId) {
    const { data } = await supabaseAdmin.from('course_modules').select('*').eq('courseId', courseId).order('position', { ascending: true })
    return cleanMany(data || [])
  },
  async getById(id) {
    const { data } = await supabaseAdmin.from('course_modules').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getForCreator(id, creatorId) {
    const { data } = await supabaseAdmin.from('course_modules').select('*').eq('id', id).eq('creatorId', creatorId).maybeSingle()
    return clean(data)
  },
  async create(module) {
    const doc = { id: module.id || cryptoId(), ...module }
    delete doc._id
    await supabaseAdmin.from('course_modules').insert(doc)
    return clean(doc)
  },
  async update(id, creatorId, patch) {
    await supabaseAdmin.from('course_modules').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id).eq('creatorId', creatorId)
    return this.getForCreator(id, creatorId)
  },
  async remove(id, creatorId) {
    await supabaseAdmin.from('course_modules').delete().eq('id', id).eq('creatorId', creatorId)
  },
  async updatePositions(courseId, creatorId, moduleIds) {
    for (let index = 0; index < moduleIds.length; index++) {
      const id = moduleIds[index]
      await supabaseAdmin.from('course_modules').update({ position: index + 1, updatedAt: new Date().toISOString() }).eq('id', id).eq('courseId', courseId).eq('creatorId', creatorId)
    }
    return this.listByCourse(courseId)
  },
}

// ---------- Lessons ----------
export const lessonsRepo = {
  async listByCourse(courseId) {
    const { data } = await supabaseAdmin.from('course_lessons').select('*').eq('courseId', courseId).order('position', { ascending: true })
    return cleanMany(data || [])
  },
  async listByModule(moduleId) {
    const { data } = await supabaseAdmin.from('course_lessons').select('*').eq('moduleId', moduleId).order('position', { ascending: true })
    return cleanMany(data || [])
  },
  async getById(id) {
    const { data } = await supabaseAdmin.from('course_lessons').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getForCreator(id, creatorId) {
    const { data } = await supabaseAdmin.from('course_lessons').select('*').eq('id', id).eq('creatorId', creatorId).maybeSingle()
    return clean(data)
  },
  async create(lesson) {
    const doc = { id: lesson.id || cryptoId(), ...lesson }
    delete doc._id
    await supabaseAdmin.from('course_lessons').insert(doc)
    return clean(doc)
  },
  async update(id, creatorId, patch) {
    await supabaseAdmin.from('course_lessons').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id).eq('creatorId', creatorId)
    return this.getForCreator(id, creatorId)
  },
  async remove(id, creatorId) {
    await supabaseAdmin.from('course_lessons').delete().eq('id', id).eq('creatorId', creatorId)
  },
  async updatePositions(moduleId, creatorId, lessonIds) {
    for (let index = 0; index < lessonIds.length; index++) {
      const id = lessonIds[index]
      await supabaseAdmin.from('course_lessons').update({ position: index + 1, updatedAt: new Date().toISOString() }).eq('id', id).eq('moduleId', moduleId).eq('creatorId', creatorId)
    }
    return this.listByModule(moduleId)
  },
}

// ---------- Course Progress & Certificates ----------
export const courseProgressRepo = {
  async markProgress({ customerId, courseId, lessonId, completed }) {
    const doc = { id: cryptoId(), customerId, courseId, lessonId, completed: completed !== false, completedAt: new Date().toISOString() }
    await supabaseAdmin.from('course_progress').upsert(doc, { onConflict: 'customerId,courseId,lessonId' })
    return clean(doc)
  },
  async getProgress(customerId, courseId) {
    const { data } = await supabaseAdmin.from('course_progress').select('*').eq('customerId', customerId).eq('courseId', courseId)
    return cleanMany(data || [])
  },
  async listByCourse(customerId, courseId) {
    const { data } = await supabaseAdmin.from('course_progress').select('*').eq('customerId', customerId).eq('courseId', courseId)
    return cleanMany(data || [])
  },
  async listByCustomer(customerId) {
    const { data } = await supabaseAdmin.from('course_progress').select('*').eq('customerId', customerId)
    return cleanMany(data || [])
  },
  async upsert(data) {
    const doc = { id: data.id || cryptoId(), ...data, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('course_progress').upsert(doc, { onConflict: 'customerId,courseId,lessonId' })
    return clean(doc)
  }
}

export const certificatesRepo = {
  async create(cert) {
    const certificateId = cert.certificateId || `CERT-${cryptoId().slice(0, 8).toUpperCase()}`
    const doc = { id: cert.id || cryptoId(), certificateId, ...cert, issuedAt: new Date().toISOString(), createdAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('course_certificates').insert(doc)
    return clean(doc)
  },
  async get(customerId, courseId) {
    return this.getByCustomerAndCourse(customerId, courseId)
  },
  async getByCustomerAndCourse(customerId, courseId) {
    const { data } = await supabaseAdmin.from('course_certificates').select('*').eq('customerId', customerId).eq('courseId', courseId).maybeSingle()
    return clean(data)
  },
  async getById(certificateId) {
    let { data } = await supabaseAdmin.from('course_certificates').select('*').eq('certificateId', certificateId).maybeSingle()
    if (!data) {
      const res = await supabaseAdmin.from('course_certificates').select('*').eq('id', certificateId).maybeSingle()
      data = res.data
    }
    return clean(data)
  }
}

// ---------- Coaching Repository ----------
export const coachingRepo = {
  async upsertConfig(creatorId, productIdOrConfig, patch = null) {
    let doc = {}
    if (typeof productIdOrConfig === 'string') {
      doc = { creatorId, productId: productIdOrConfig, ...(patch || {}), updatedAt: new Date().toISOString() }
    } else {
      doc = { creatorId, ...(productIdOrConfig || {}), updatedAt: new Date().toISOString() }
    }
    delete doc._id
    if (doc.bookingTypes) {
      doc.customerFields = {
        ...(typeof doc.customerFields === 'object' && doc.customerFields ? doc.customerFields : {}),
        bookingTypes: doc.bookingTypes,
      }
      delete doc.bookingTypes
    }
    try {
      const prismaData = {
        creatorId: doc.creatorId,
        productId: doc.productId,
        timezone: doc.timezone || 'Asia/Kolkata',
        durationMinutes: parseInt(doc.durationMinutes || 30, 10),
        minimumNoticeMinutes: parseInt(doc.minimumNoticeMinutes !== undefined ? doc.minimumNoticeMinutes : 240, 10),
        maximumAdvanceDays: parseInt(doc.maximumAdvanceDays !== undefined ? doc.maximumAdvanceDays : 10, 10),
        bufferMinutes: parseInt(doc.bufferMinutes !== undefined ? doc.bufferMinutes : 15, 10),
        bufferBeforeMinutes: parseInt(doc.bufferBeforeMinutes !== undefined ? doc.bufferBeforeMinutes : 0, 10),
        bufferAfterMinutes: parseInt(doc.bufferAfterMinutes !== undefined ? doc.bufferAfterMinutes : 15, 10),
        maxSessionsPerDay: doc.maxSessionsPerDay ? parseInt(doc.maxSessionsPerDay, 10) : null,
        allowRescheduling: doc.allowRescheduling !== false,
        reschedulingDeadlineNoticeHours: parseInt(doc.reschedulingDeadlineNoticeHours || 24, 10),
        allowCancellation: doc.allowCancellation !== false,
        cancellationPolicyNoticeHours: parseInt(doc.cancellationPolicyNoticeHours || 24, 10),
        cancellationPolicy: doc.cancellationPolicy || '',
        sessionType: doc.sessionType || '1:1 Consultation',
        deliveryMethod: doc.deliveryMethod || 'GOOGLE_MEET',
        meetingType: doc.meetingType || 'GOOGLE_MEET',
        meetingUrl: doc.meetingUrl || null,
        locationText: doc.locationText || null,
        calendarProvider: doc.calendarProvider || 'GOOGLE_CALENDAR',
        calendarId: doc.calendarId || 'primary',
        discountType: doc.discountType || null,
        discountValue: doc.discountValue !== undefined ? Number(doc.discountValue) : 0,
        blockedDates: Array.isArray(doc.blockedDates) ? doc.blockedDates : [],
        blockedTimeRanges: Array.isArray(doc.blockedTimeRanges) ? doc.blockedTimeRanges : [],
        dateOverrides: Array.isArray(doc.dateOverrides) ? doc.dateOverrides : [],
        availability: Array.isArray(doc.availability) ? doc.availability : [],
        questions: Array.isArray(doc.questions) ? doc.questions : [],
        customerFields: doc.customerFields || {},
      }
      await prisma.coachingConfig.upsert({
        where: { productId: doc.productId },
        create: prismaData,
        update: prismaData,
      })
    } catch (pe) {
      console.warn('Prisma coachingConfig upsert warning:', pe.message)
    }
    try {
      await supabaseAdmin.from('coaching_configs').upsert(toDb(doc), { onConflict: 'product_id' })
    } catch (e) {
      try {
        await supabaseAdmin.from('coaching_configs').upsert(doc, { onConflict: 'productId' })
      } catch (e2) {}
    }
    return this.getConfigByProductId(doc.productId)
  },
  async getConfigByProductId(productId) {
    if (!productId) return null
    try {
      const rec = await prisma.coachingConfig.findFirst({ where: { productId } })
      if (rec) {
        const cleaned = clean(rec)
        if (cleaned.customerFields?.bookingTypes && (!cleaned.bookingTypes || cleaned.bookingTypes.length === 0)) {
          cleaned.bookingTypes = cleaned.customerFields.bookingTypes
        }
        return cleaned
      }
    } catch (e) {
      console.warn('Prisma getConfigByProductId error:', e.message)
    }
    try {
      const { data } = await supabaseAdmin.from('coaching_configs').select('*').eq('productId', productId).maybeSingle()
      if (data) return clean(data)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('coaching_configs').select('*').eq('product_id', productId).maybeSingle()
    return clean(data)
  },
  async createBooking(booking) {
    const doc = { id: booking.id || cryptoId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...booking }
    delete doc._id
    try {
      const created = await prisma.coachingBooking.create({
        data: {
          id: doc.id,
          productId: doc.productId,
          creatorId: doc.creatorId,
          orderId: doc.orderId || null,
          customerId: doc.customerId || null,
          customerEmail: doc.customerEmail,
          customerName: doc.customerName || null,
          customerPhone: doc.customerPhone || null,
          startTime: new Date(doc.startTime),
          endTime: new Date(doc.endTime),
          timezone: doc.timezone || 'Asia/Kolkata',
          status: doc.status || 'PENDING',
          paymentStatus: doc.paymentStatus || 'PENDING',
          meetingType: doc.meetingType || 'GOOGLE_MEET',
          meetingUrl: doc.meetingUrl || null,
          locationText: doc.locationText || null,
          answers: doc.answers || [],
          createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
          updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
        },
      })
      if (created) return clean({ ...doc, ...created })
    } catch (e) {
      try {
        await supabaseAdmin.from('coaching_bookings').insert(toDb(doc))
      } catch (e2) {
        await supabaseAdmin.from('coaching_bookings').insert(doc)
      }
    }
    return clean(doc)
  },
  async getBookingById(id) {
    if (!id) return null
    try {
      const rec = await prisma.coachingBooking.findUnique({ where: { id } })
      if (rec) return clean(rec)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('coaching_bookings').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async getBookingByOrderId(orderId) {
    if (!orderId) return null
    try {
      const rec = await prisma.coachingBooking.findFirst({ where: { orderId } })
      if (rec) return clean(rec)
    } catch (e) { }
    let { data } = await supabaseAdmin.from('coaching_bookings').select('*').eq('orderId', orderId).maybeSingle()
    if (!data) {
      const res = await supabaseAdmin.from('coaching_bookings').select('*').eq('order_id', orderId).maybeSingle()
      data = res.data
    }
    return clean(data)
  },
  async updateBooking(id, patch) {
    const updateDoc = { ...patch, updatedAt: new Date() }
    delete updateDoc.id
    delete updateDoc._id
    try {
      const prismaPatch = { ...updateDoc }
      if (prismaPatch.startTime) prismaPatch.startTime = new Date(prismaPatch.startTime)
      if (prismaPatch.endTime) prismaPatch.endTime = new Date(prismaPatch.endTime)
      const updated = await prisma.coachingBooking.update({
        where: { id },
        data: prismaPatch,
      })
      if (updated) return clean(updated)
    } catch (e) {
      try {
        await supabaseAdmin.from('coaching_bookings').update(toDb(updateDoc)).eq('id', id)
      } catch (e2) {
        await supabaseAdmin.from('coaching_bookings').update(updateDoc).eq('id', id)
      }
    }
    return this.getBookingById(id)
  },
  async listBookingsByCreator(creatorId, options = {}) {
    return this.listBookingsForCreator(creatorId, options)
  },
  async listBookingsForCreator(creatorId, options = {}) {
    if (!creatorId) return []
    let list = []
    try {
      const records = await prisma.coachingBooking.findMany({
        where: { creatorId },
        orderBy: { startTime: 'asc' },
      })
      if (records && records.length > 0) {
        list = records.map(clean)
      }
    } catch (e) { }

    if (list.length === 0) {
      let { data } = await supabaseAdmin.from('coaching_bookings').select('*').eq('creatorId', creatorId).order('startTime', { ascending: true })
      if (!data || data.length === 0) {
        const res = await supabaseAdmin.from('coaching_bookings').select('*').eq('creator_id', creatorId).order('start_time', { ascending: true })
        data = res.data
      }
      list = cleanMany(data || [])
    }
    if (options.productId && options.productId !== 'ALL') {
      list = list.filter(b => b.productId === options.productId || b.product_id === options.productId)
    }
    if (options.status && options.status !== 'ALL') {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      list = list.filter(b => statuses.includes(b.status))
    }
    if (options.fromDate) {
      const fromMs = new Date(options.fromDate).getTime()
      list = list.filter(b => new Date(b.startTime).getTime() >= fromMs)
    }
    if (options.toDate) {
      const toMs = new Date(options.toDate).getTime()
      list = list.filter(b => new Date(b.startTime).getTime() <= toMs)
    }
    return list
  },
  async listBookingsByCustomer(customerEmail, options = {}) {
    return this.listBookingsForCustomer(customerEmail, options)
  },
  async listBookingsForCustomer(customerEmail, options = {}) {
    if (!customerEmail) return []
    const emailClean = String(customerEmail).toLowerCase()
    let { data } = await supabaseAdmin.from('coaching_bookings').select('*').eq('customerEmail', emailClean).order('startTime', { ascending: true })
    if (!data || data.length === 0) {
      const res = await supabaseAdmin.from('coaching_bookings').select('*').eq('customer_email', emailClean).order('start_time', { ascending: true })
      data = res.data
    }
    let list = cleanMany(data || [])
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      list = list.filter(b => statuses.includes(b.status))
    }
    return list
  },
  async findOverlappingBookings(creatorId, startIso, endIso, excludeBookingId = null) {
    const list = await this.listBookingsForCreator(creatorId, { status: ['CONFIRMED', 'PENDING', 'RESCHEDULED'] })
    const startMs = new Date(startIso).getTime()
    const endMs = new Date(endIso).getTime()
    const nowMs = Date.now()
    const HOLD_EXPIRY_MS = 15 * 60 * 1000 // 15-minute hold TTL for uncompleted checkouts

    return list.filter(b => {
      if (excludeBookingId && b.id === excludeBookingId) return false
      // If a booking is PENDING but older than the hold expiry threshold, release it
      if (b.status === 'PENDING' && b.createdAt) {
        const holdAgeMs = nowMs - new Date(b.createdAt).getTime()
        if (holdAgeMs > HOLD_EXPIRY_MS) return false
      }
      const bStartMs = new Date(b.startTime).getTime()
      const bEndMs = new Date(b.endTime).getTime()
      return startMs < bEndMs && endMs > bStartMs
    })
  },
  async countBookingsOnDate(creatorId, dateStr, timezone = 'Asia/Kolkata') {
    const list = await this.listBookingsForCreator(creatorId, { status: ['CONFIRMED', 'PENDING', 'RESCHEDULED'] })
    return list.filter(b => {
      const bDate = getDateInTimezone(b.startTime, timezone)
      return bDate === dateStr
    }).length
  }
}

// ---------- Community Repository ----------
export const communityRepo = {
  async upsertConfig(creatorId, config) {
    const doc = { creatorId, ...config, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('community_configs').upsert(doc, { onConflict: 'productId' })
    return this.getConfigByProductId(config.productId)
  },
  async getConfigByProductId(productId) {
    const { data } = await supabaseAdmin.from('community_configs').select('*').eq('productId', productId).maybeSingle()
    return clean(data)
  },
  async getConfigBySlug(slug) {
    const { data } = await supabaseAdmin.from('community_configs').select('*').eq('slug', slug).maybeSingle()
    return clean(data)
  },
  async addMembership(membership) {
    const doc = { id: membership.id || cryptoId(), ...membership }
    delete doc._id
    await supabaseAdmin.from('community_memberships').insert(doc)
    return clean(doc)
  },
  async getMembership(communityId, customerEmail) {
    const { data } = await supabaseAdmin.from('community_memberships').select('*').eq('communityId', communityId).eq('customerEmail', customerEmail).maybeSingle()
    return clean(data)
  },
  async listMemberships(communityId) {
    const { data } = await supabaseAdmin.from('community_memberships').select('*').eq('communityId', communityId)
    return cleanMany(data || [])
  },
  async createPost(post) {
    const doc = { id: post.id || cryptoId(), ...post }
    delete doc._id
    await supabaseAdmin.from('community_posts').insert(doc)
    return clean(doc)
  },
  async listPosts(communityId) {
    const { data } = await supabaseAdmin.from('community_posts').select('*').eq('communityId', communityId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
  async addComment(comment) {
    const doc = { id: comment.id || cryptoId(), ...comment }
    delete doc._id
    await supabaseAdmin.from('community_comments').insert(doc)
    return clean(doc)
  },
  async listComments(postId) {
    const { data } = await supabaseAdmin.from('community_comments').select('*').eq('postId', postId).order('createdAt', { ascending: true })
    return cleanMany(data || [])
  },
  async addReaction({ postId, customerEmail, type }) {
    const doc = { id: cryptoId(), postId, customerEmail, type, createdAt: new Date().toISOString() }
    await supabaseAdmin.from('community_reactions').upsert(doc, { onConflict: 'postId,customerEmail,type' })
    return clean(doc)
  }
}

export const communityResourcesRepo = {
  async addResource(res) {
    const doc = { id: res.id || cryptoId(), ...res }
    delete doc._id
    await supabaseAdmin.from('community_resources').insert(doc)
    return clean(doc)
  },
  async listResources(communityId) {
    const { data } = await supabaseAdmin.from('community_resources').select('*').eq('communityId', communityId)
    return cleanMany(data || [])
  }
}

// ---------- Webinar Repository ----------
export const webinarRepo = {
  async upsertConfig(creatorId, config) {
    const doc = { creatorId, ...config, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('webinar_configs').upsert(doc, { onConflict: 'productId' })
    return this.getConfigByProductId(config.productId)
  },
  async getConfigByProductId(productId) {
    const { data } = await supabaseAdmin.from('webinar_configs').select('*').eq('productId', productId).maybeSingle()
    return clean(data)
  },
  async registerAttendee(reg) {
    const doc = { id: reg.id || cryptoId(), ...reg }
    delete doc._id
    await supabaseAdmin.from('webinar_registrations').insert(doc)
    return clean(doc)
  },
  async listAttendees(webinarId) {
    const { data } = await supabaseAdmin.from('webinar_registrations').select('*').eq('webinarId', webinarId)
    return cleanMany(data || [])
  }
}

// ---------- Membership Repository ----------
export const membershipRepo = {
  async upsertConfig(creatorIdOrConfig, maybeConfig) {
    let creatorId, config
    if (maybeConfig) {
      creatorId = creatorIdOrConfig
      config = maybeConfig
    } else {
      config = creatorIdOrConfig || {}
      creatorId = config.creatorId
    }
    const doc = { creatorId, ...config, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('membership_configs').upsert(doc, { onConflict: 'productId' })
    return this.getConfigByProductId(config.productId)
  },
  async getConfigByProductId(productId) {
    const { data } = await supabaseAdmin.from('membership_configs').select('*').eq('productId', productId).maybeSingle()
    return clean(data)
  },
  async createSubscription(sub) {
    const doc = { id: sub.id || cryptoId(), ...sub }
    delete doc._id
    await supabaseAdmin.from('membership_subscriptions').insert(doc)
    return clean(doc)
  },
  async getSubscription(membershipId, customerEmail) {
    const { data } = await supabaseAdmin.from('membership_subscriptions').select('*').eq('membershipId', membershipId).eq('customerEmail', customerEmail).maybeSingle()
    return clean(data)
  },
  async listSubscriptionsForMembership(membershipId, options = {}) {
    let query = supabaseAdmin.from('membership_subscriptions').select('*')
    if (membershipId) {
      query = query.or(`membershipId.eq.${membershipId},productId.eq.${membershipId}`)
    }
    if (options.status) {
      query = query.eq('status', options.status)
    }
    const { data } = await query.order('createdAt', { ascending: false })
    const items = cleanMany(data || [])
    if (options.search) {
      const q = options.search.toLowerCase()
      return items.filter(s => (s.customerName && s.customerName.toLowerCase().includes(q)) || (s.customerEmail && s.customerEmail.toLowerCase().includes(q)))
    }
    return items
  },
  async countSubscriptions(membershipId, statuses = ['ACTIVE', 'TRIALING']) {
    const { data } = await supabaseAdmin.from('membership_subscriptions').select('id, status').or(`membershipId.eq.${membershipId},productId.eq.${membershipId}`)
    const subs = data || []
    return subs.filter(s => statuses.includes(s.status)).length
  },
  async getCreatorAnalytics(creatorId) {
    const { data } = await supabaseAdmin.from('membership_subscriptions').select('*').eq('creatorId', creatorId)
    const subs = cleanMany(data || [])
    const active = subs.filter(s => s.status === 'ACTIVE' || s.status === 'TRIALING')
    const mrr = active.reduce((acc, s) => acc + Number(s.price || 0), 0)
    return {
      totalMembers: subs.length,
      activeMembers: active.length,
      mrr,
    }
  }
}

export const membershipPostsRepo = {
  async createPost(post) {
    const doc = { id: post.id || cryptoId(), ...post }
    delete doc._id
    await supabaseAdmin.from('membership_posts').insert(doc)
    return clean(doc)
  },
  async list(membershipId, options = {}) {
    return this.listPosts(membershipId, options)
  },
  async listPosts(membershipId, options = {}) {
    let query = supabaseAdmin.from('membership_posts').select('*').eq('membershipId', membershipId)
    if (options.status) {
      query = query.eq('status', options.status)
    }
    const { data } = await query.order('createdAt', { ascending: false })
    const items = cleanMany(data || [])
    if (options.search) {
      const q = options.search.toLowerCase()
      return items.filter(p => p.title && p.title.toLowerCase().includes(q))
    }
    return items
  }
}

export const membershipTiersRepo = {
  async createTier(tier) {
    const doc = { id: tier.id || cryptoId(), ...tier }
    delete doc._id
    await supabaseAdmin.from('membership_tiers').insert(doc)
    return clean(doc)
  },
  async list(membershipId) {
    return this.listTiers(membershipId)
  },
  async listTiers(membershipId) {
    const { data } = await supabaseAdmin.from('membership_tiers').select('*').eq('membershipId', membershipId)
    return cleanMany(data || [])
  }
}

// ---------- Custom Service Repository ----------
export const customServiceRepo = {
  async upsertConfig(creatorId, config) {
    const doc = { creatorId, ...config, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('custom_service_configs').upsert(doc, { onConflict: 'productId' })
    return this.getConfigByProductId(config.productId)
  },
  async getConfigByProductId(productId) {
    const { data } = await supabaseAdmin.from('custom_service_configs').select('*').eq('productId', productId).maybeSingle()
    return clean(data)
  },
  async createRequest(req) {
    const doc = { id: req.id || cryptoId(), ...req }
    delete doc._id
    await supabaseAdmin.from('custom_service_requests').insert(doc)
    return clean(doc)
  },
  async getRequestById(id) {
    const { data } = await supabaseAdmin.from('custom_service_requests').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },
  async listRequestsByCreator(creatorId) {
    const { data } = await supabaseAdmin.from('custom_service_requests').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
  async listRequestsByCustomer(customerEmail) {
    const { data } = await supabaseAdmin.from('custom_service_requests').select('*').eq('customerEmail', customerEmail).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },
  async updateRequest(id, patch) {
    await supabaseAdmin.from('custom_service_requests').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', id)
    return this.getRequestById(id)
  }
}

// ---------- External Link Repository ----------
export const externalLinkRepo = {
  async upsertConfig(creatorId, config) {
    const doc = { creatorId, ...config, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('external_link_configs').upsert(doc, { onConflict: 'productId' })
    return this.getConfigByProductId(config.productId)
  },
  async getConfigByProductId(productId) {
    const { data } = await supabaseAdmin.from('external_link_configs').select('*').eq('productId', productId).maybeSingle()
    return clean(data)
  },
  async recordOpen(productId, creatorId, customerEmail) {
    const doc = { id: cryptoId(), productId, creatorId, customerEmail, openedAt: new Date().toISOString() }
    await supabaseAdmin.from('external_link_opens').insert(doc)
    return clean(doc)
  },
  async getCreatorAnalytics(creatorId) {
    const { data } = await supabaseAdmin.from('external_link_opens').select('*').eq('creatorId', creatorId)
    return cleanMany(data || [])
  }
}

// ---------- Creator Subscriptions ----------
function formatSub(raw) {
  if (!raw) return null
  const cleaned = clean(raw)
  if (!cleaned) return null
  const amountNum = (cleaned.amount !== undefined && cleaned.amount !== null && cleaned.amount !== '')
    ? Number(cleaned.amount)
    : ((cleaned.price !== undefined && cleaned.price !== null && cleaned.price !== '') ? Number(cleaned.price) : 0)

  const isPastDue = cleaned.status === 'ACTIVE'
    ? false
    : Boolean(
      cleaned.isPastDue ||
      cleaned.status === 'PAID_PENDING' ||
      cleaned.status === 'HALTED' ||
      cleaned.authStatus === 'PENDING_RETRY' ||
      cleaned.authStatus === 'HALTED' ||
      (cleaned.status === 'PENDING' && cleaned.lastPaymentFailureReason)
    )

  const provider = (cleaned.provider || cleaned.paymentProvider || 'RAZORPAY').toUpperCase()

  return {
    ...cleaned,
    amount: amountNum,
    price: amountNum,
    isPastDue,
    provider,
    paymentProvider: provider,
  }
}

export const creatorSubscriptionsRepo = {
  async getByCreator(creatorId) {
    try {
      const sub = await prisma.creatorSubscription.findUnique({
        where: { creatorId }
      })
      if (sub) return formatSub(sub)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('creator_subscriptions').select('*').eq('creatorId', creatorId).maybeSingle()
    return formatSub(data)
  },

  async getByCreatorId(creatorId) {
    return this.getByCreator(creatorId)
  },

  async getByRazorpayOrderId(razorpayOrderId) {
    if (!razorpayOrderId) return null
    try {
      const sub = await prisma.creatorSubscription.findFirst({
        where: { razorpayOrderId }
      })
      if (sub) return formatSub(sub)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('creator_subscriptions').select('*').eq('razorpayOrderId', razorpayOrderId).maybeSingle()
    return formatSub(data)
  },

  async getByRazorpaySubscriptionId(providerSubscriptionId) {
    if (!providerSubscriptionId) return null
    try {
      const sub = await prisma.creatorSubscription.findFirst({
        where: {
          OR: [
            { providerSubscriptionId },
            { razorpayOrderId: providerSubscriptionId },
            { pendingUpgradePaymentId: providerSubscriptionId }
          ]
        }
      })
      if (sub) return formatSub(sub)
    } catch (e) { }
    const res1 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('providerSubscriptionId', providerSubscriptionId).maybeSingle()
    if (res1.data) return formatSub(res1.data)
    const res2 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('razorpayOrderId', providerSubscriptionId).maybeSingle()
    if (res2.data) return formatSub(res2.data)
    const res3 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('pendingUpgradePaymentId', providerSubscriptionId).maybeSingle()
    if (res3.data) return formatSub(res3.data)

    try {
      const logs = await prisma.subscriptionAuditLog.findMany({
        where: {
          event: { in: ['SUPERSEDED_SUBSCRIPTION_CANCELLED', 'RAZORPAY_SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_CANCELLED'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 30
      })
      const matchingLog = logs.find(l => l.metadata?.providerSubscriptionId === providerSubscriptionId || l.metadata?.subscriptionId === providerSubscriptionId)
      if (matchingLog) {
        return {
          id: matchingLog.id,
          creatorId: matchingLog.creatorId,
          providerSubscriptionId,
          status: 'CANCELLED',
          cancellationReason: matchingLog.metadata?.reason || 'SUPERSEDED',
          createdAt: matchingLog.createdAt,
          updatedAt: matchingLog.createdAt,
        }
      }
    } catch (e) { }

    return null
  },

  async getByDodoSubscriptionId(dodoSubscriptionId) {
    if (!dodoSubscriptionId) return null
    try {
      const sub = await prisma.creatorSubscription.findFirst({
        where: {
          OR: [
            { dodoSubscriptionId },
            { providerSubscriptionId: dodoSubscriptionId }
          ]
        }
      })
      if (sub) return formatSub(sub)
    } catch (e) { }
    const res1 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('dodoSubscriptionId', dodoSubscriptionId).maybeSingle()
    if (res1.data) return formatSub(res1.data)
    const res2 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('providerSubscriptionId', dodoSubscriptionId).maybeSingle()
    return formatSub(res2.data)
  },

  async getByProviderSubscriptionId(id) {
    if (!id) return null
    try {
      const sub = await prisma.creatorSubscription.findFirst({
        where: {
          OR: [
            { dodoSubscriptionId: id },
            { providerSubscriptionId: id },
            { razorpayOrderId: id },
            { dodoPaymentId: id }
          ]
        }
      })
      if (sub) return formatSub(sub)
    } catch (e) { }
    const res0 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('dodoSubscriptionId', id).maybeSingle()
    if (res0.data) return formatSub(res0.data)
    const res1 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('providerSubscriptionId', id).maybeSingle()
    if (res1.data) return formatSub(res1.data)
    const res2 = await supabaseAdmin.from('creator_subscriptions').select('*').eq('razorpayOrderId', id).maybeSingle()
    return formatSub(res2.data)
  },

  async upsert(creatorIdOrData, maybeData) {
    let creatorId
    let data
    if (typeof creatorIdOrData === 'string') {
      creatorId = creatorIdOrData
      data = maybeData || {}
    } else {
      data = creatorIdOrData || {}
      creatorId = data.creatorId || data.userId
    }

    const payload = { creatorId, ...data, updatedAt: new Date().toISOString() }
    delete payload._id

    try {
      const trialStartedAt = payload.trialStartedAt || payload.trialStart ? new Date(payload.trialStartedAt || payload.trialStart) : undefined
      const trialEndsAt = payload.trialEndsAt || payload.trialEnd ? new Date(payload.trialEndsAt || payload.trialEnd) : undefined
      const trialStatus = payload.trialStatus || (trialStartedAt ? 'ACTIVE' : undefined)

      const dbData = {
        plan: payload.plan || 'CREATOR',
        status: payload.status || 'PENDING',
        billingInterval: payload.billingInterval || payload.billingCycle || 'MONTHLY',
        amount: payload.price !== undefined ? payload.price : (payload.amount !== undefined ? payload.amount : 0),
        currency: payload.currency || 'INR',
        provider: payload.provider || payload.paymentProvider || 'RAZORPAY',
        providerSubscriptionId: payload.providerSubscriptionId || payload.razorpaySubscriptionId || payload.dodoSubscriptionId || null,
        dodoSubscriptionId: payload.dodoSubscriptionId || (payload.provider === 'DODO' || payload.paymentProvider === 'DODO' ? payload.providerSubscriptionId : null),
        dodoPaymentId: payload.dodoPaymentId || null,
        dodoCustomerId: payload.dodoCustomerId || null,
        razorpayOrderId: (payload.provider === 'DODO' || payload.paymentProvider === 'DODO')
          ? null
          : (payload.razorpayOrderId || payload.pendingOrderId || null),
        razorpayPaymentId: payload.razorpayPaymentId || null,
        currentPeriodStart: payload.currentPeriodStart ? new Date(payload.currentPeriodStart) : null,
        currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd) : null,
        canceledAt: payload.canceledAt ? new Date(payload.canceledAt) : null,
        scheduledPlan: payload.scheduledPlan !== undefined ? payload.scheduledPlan : undefined,
        scheduledChangeAt: payload.scheduledChangeAt ? new Date(payload.scheduledChangeAt) : (payload.scheduledChangeAt === null ? null : undefined),
        scheduledInterval: payload.scheduledInterval !== undefined ? payload.scheduledInterval : undefined,
        pendingUpgradePlan: payload.pendingUpgradePlan !== undefined ? payload.pendingUpgradePlan : undefined,
        pendingUpgradeInterval: payload.pendingUpgradeInterval !== undefined ? payload.pendingUpgradeInterval : undefined,
        pendingUpgradePaymentId: payload.pendingUpgradePaymentId !== undefined ? payload.pendingUpgradePaymentId : undefined,
        pendingUpgradeStatus: payload.pendingUpgradeStatus !== undefined ? payload.pendingUpgradeStatus : undefined,
        pendingUpgradeStartedAt: payload.pendingUpgradeStartedAt ? new Date(payload.pendingUpgradeStartedAt) : (payload.pendingUpgradeStartedAt === null ? null : undefined),
        pendingUpgradeErrorMessage: payload.pendingUpgradeErrorMessage !== undefined ? payload.pendingUpgradeErrorMessage : undefined,
        pendingUpgradePaymentLink: payload.pendingUpgradePaymentLink !== undefined ? payload.pendingUpgradePaymentLink : undefined,
        pendingUpgradeAmount: payload.pendingUpgradeAmount !== undefined ? (payload.pendingUpgradeAmount !== null ? payload.pendingUpgradeAmount : null) : undefined,
        pendingUpgradeCurrency: payload.pendingUpgradeCurrency !== undefined ? payload.pendingUpgradeCurrency : undefined,
        lastVerifiedAt: payload.lastVerifiedAt ? new Date(payload.lastVerifiedAt) : undefined,
        cancellationReason: payload.cancellationReason !== undefined ? payload.cancellationReason : undefined,
        cancellationDetails: payload.cancellationDetails !== undefined ? payload.cancellationDetails : undefined,
        authStatus: payload.authStatus !== undefined ? payload.authStatus : undefined,
        lastInvoiceId: payload.lastInvoiceId !== undefined ? payload.lastInvoiceId : undefined,
        lastInvoiceStatus: payload.lastInvoiceStatus !== undefined ? payload.lastInvoiceStatus : undefined,
        lastPaymentFailureReason: payload.lastPaymentFailureReason !== undefined ? payload.lastPaymentFailureReason : undefined,
        lastPaymentFailureAt: payload.lastPaymentFailureAt ? new Date(payload.lastPaymentFailureAt) : undefined,
        gracePeriodEndsAt: payload.gracePeriodEndsAt ? new Date(payload.gracePeriodEndsAt) : undefined,
        retryCount: payload.retryCount !== undefined ? payload.retryCount : undefined,
      }

      if (trialStartedAt !== undefined) dbData.trialStartedAt = trialStartedAt
      if (trialEndsAt !== undefined) dbData.trialEndsAt = trialEndsAt
      if (trialStatus !== undefined) dbData.trialStatus = trialStatus
      if (payload.createdAt) dbData.createdAt = new Date(payload.createdAt)
      if (payload.updatedAt) dbData.updatedAt = new Date(payload.updatedAt)

      await prisma.creatorSubscription.upsert({
        where: { creatorId },
        update: dbData,
        create: { creatorId, ...dbData }
      })
    } catch (e) {
      console.warn('Prisma creatorSubscription upsert fallback to PostgREST:', e.message)
      await supabaseAdmin.from('creator_subscriptions').upsert(payload, { onConflict: 'creatorId' })
    }

    return this.getByCreator(creatorId)
  },

  async updateStatus(creatorId, status, extraData = {}) {
    const updatePayload = {
      status,
      updatedAt: new Date().toISOString(),
      ...extraData,
    }

    try {
      const dbData = { status }
      if (extraData.provider !== undefined) dbData.provider = extraData.provider
      if (extraData.providerSubscriptionId !== undefined) dbData.providerSubscriptionId = extraData.providerSubscriptionId
      if (extraData.dodoSubscriptionId !== undefined) dbData.dodoSubscriptionId = extraData.dodoSubscriptionId
      if (extraData.dodoPaymentId !== undefined) dbData.dodoPaymentId = extraData.dodoPaymentId
      if (extraData.dodoCustomerId !== undefined) dbData.dodoCustomerId = extraData.dodoCustomerId
      if (extraData.razorpayOrderId !== undefined) dbData.razorpayOrderId = extraData.razorpayOrderId
      if (extraData.razorpayPaymentId !== undefined) dbData.razorpayPaymentId = extraData.razorpayPaymentId
      if (extraData.currentPeriodEnd !== undefined) dbData.currentPeriodEnd = extraData.currentPeriodEnd ? new Date(extraData.currentPeriodEnd) : null
      if (extraData.currentPeriodStart !== undefined) dbData.currentPeriodStart = extraData.currentPeriodStart ? new Date(extraData.currentPeriodStart) : null
      if (extraData.canceledAt !== undefined) dbData.canceledAt = extraData.canceledAt ? new Date(extraData.canceledAt) : null
      if (extraData.plan !== undefined) dbData.plan = extraData.plan
      if (extraData.billingInterval || extraData.billingCycle) dbData.billingInterval = extraData.billingInterval || extraData.billingCycle
      if (extraData.price !== undefined) dbData.amount = extraData.price
      if (extraData.currency !== undefined) dbData.currency = extraData.currency
      if (extraData.scheduledPlan !== undefined) dbData.scheduledPlan = extraData.scheduledPlan
      if (extraData.scheduledChangeAt !== undefined) {
        dbData.scheduledChangeAt = extraData.scheduledChangeAt ? new Date(extraData.scheduledChangeAt) : null
      }
      if (extraData.scheduledInterval !== undefined) dbData.scheduledInterval = extraData.scheduledInterval
      if (extraData.trialStartedAt !== undefined || extraData.trialStart !== undefined) {
        dbData.trialStartedAt = (extraData.trialStartedAt || extraData.trialStart) ? new Date(extraData.trialStartedAt || extraData.trialStart) : null
      }
      if (extraData.trialEndsAt !== undefined || extraData.trialEnd !== undefined) {
        dbData.trialEndsAt = (extraData.trialEndsAt || extraData.trialEnd) ? new Date(extraData.trialEndsAt || extraData.trialEnd) : null
      }
      if (extraData.trialStatus !== undefined) dbData.trialStatus = extraData.trialStatus
      if (extraData.pendingUpgradePlan !== undefined) dbData.pendingUpgradePlan = extraData.pendingUpgradePlan
      if (extraData.pendingUpgradeInterval !== undefined) dbData.pendingUpgradeInterval = extraData.pendingUpgradeInterval
      if (extraData.pendingUpgradePaymentId !== undefined) dbData.pendingUpgradePaymentId = extraData.pendingUpgradePaymentId
      if (extraData.pendingUpgradeStatus !== undefined) dbData.pendingUpgradeStatus = extraData.pendingUpgradeStatus
      if (extraData.pendingUpgradeStartedAt !== undefined) {
        dbData.pendingUpgradeStartedAt = extraData.pendingUpgradeStartedAt ? new Date(extraData.pendingUpgradeStartedAt) : null
      }
      if (extraData.pendingUpgradeErrorMessage !== undefined) dbData.pendingUpgradeErrorMessage = extraData.pendingUpgradeErrorMessage
      if (extraData.pendingUpgradePaymentLink !== undefined) dbData.pendingUpgradePaymentLink = extraData.pendingUpgradePaymentLink
      if (extraData.pendingUpgradeAmount !== undefined) dbData.pendingUpgradeAmount = extraData.pendingUpgradeAmount !== null ? extraData.pendingUpgradeAmount : null
      if (extraData.pendingUpgradeCurrency !== undefined) dbData.pendingUpgradeCurrency = extraData.pendingUpgradeCurrency
      if (extraData.lastVerifiedAt !== undefined) {
        dbData.lastVerifiedAt = extraData.lastVerifiedAt ? new Date(extraData.lastVerifiedAt) : null
      }
      if (extraData.cancellationReason !== undefined) dbData.cancellationReason = extraData.cancellationReason
      if (extraData.cancellationDetails !== undefined) dbData.cancellationDetails = extraData.cancellationDetails
      if (extraData.authStatus !== undefined) dbData.authStatus = extraData.authStatus
      if (extraData.lastInvoiceId !== undefined) dbData.lastInvoiceId = extraData.lastInvoiceId
      if (extraData.lastInvoiceStatus !== undefined) dbData.lastInvoiceStatus = extraData.lastInvoiceStatus
      if (extraData.lastPaymentFailureReason !== undefined) dbData.lastPaymentFailureReason = extraData.lastPaymentFailureReason
      if (extraData.lastPaymentFailureAt !== undefined) {
        dbData.lastPaymentFailureAt = extraData.lastPaymentFailureAt ? new Date(extraData.lastPaymentFailureAt) : null
      }
      if (extraData.gracePeriodEndsAt !== undefined) {
        dbData.gracePeriodEndsAt = extraData.gracePeriodEndsAt ? new Date(extraData.gracePeriodEndsAt) : null
      }
      if (extraData.retryCount !== undefined) dbData.retryCount = extraData.retryCount

      await prisma.creatorSubscription.update({
        where: { creatorId },
        data: dbData,
      })
    } catch (e) {
      console.warn('Prisma creatorSubscription updateStatus fallback to PostgREST:', e.message)
      await supabaseAdmin.from('creator_subscriptions').update(toDb(updatePayload)).eq('creatorId', creatorId)
    }

    return this.getByCreator(creatorId)
  },

  async findStalePendingCheckouts(cutoffDate) {
    try {
      const subs = await prisma.creatorSubscription.findMany({
        where: {
          status: 'PENDING',
          updatedAt: { lt: cutoffDate },
        },
      })
      return (subs || []).map(formatSub)
    } catch (e) {
      console.warn('[creatorSubscriptionsRepo] findStalePendingCheckouts error:', e.message)
      return []
    }
  },

  async findPendingRazorpaySubscriptions(cutoffDate) {
    try {
      const subs = await prisma.creatorSubscription.findMany({
        where: {
          provider: 'RAZORPAY',
          status: { in: ['PENDING', 'CREATED'] },
          OR: [
            { createdAt: { lt: cutoffDate } },
            { updatedAt: { lt: cutoffDate } },
          ],
        },
      })
      return (subs || []).map(formatSub)
    } catch (e) {
      console.warn('[creatorSubscriptionsRepo] findPendingRazorpaySubscriptions error:', e.message)
      return []
    }
  },

  async findActiveOrHaltedRazorpaySubscriptions() {
    try {
      const subs = await prisma.creatorSubscription.findMany({
        where: {
          provider: 'RAZORPAY',
          status: { in: ['PENDING', 'HALTED', 'PAST_DUE'] },
        },
      })
      return (subs || []).map(formatSub)
    } catch (e) {
      console.warn('[creatorSubscriptionsRepo] findActiveOrHaltedRazorpaySubscriptions error:', e.message)
      return []
    }
  },

  async findStalePendingUpgrades(cutoffDate) {
    try {
      const subs = await prisma.creatorSubscription.findMany({
        where: {
          pendingUpgradeStatus: { in: ['PENDING', 'PROCESSING', 'STALE_PROCESSING'] },
          pendingUpgradeStartedAt: { lt: cutoffDate },
        },
      })
      return (subs || []).map(formatSub)
    } catch (e) {
      console.warn('[creatorSubscriptionsRepo] findStalePendingUpgrades error:', e.message)
      return []
    }
  }
}

// ---------- Subscription Invoices ----------
export const subscriptionInvoicesRepo = {
  async recordInvoice({
    creatorId,
    userId,
    subscriptionId,
    razorpaySubscriptionId,
    razorpayInvoiceId,
    razorpayPaymentId = null,
    amount = 0,
    currency = 'INR',
    status = 'ISSUED',
    billingStart = null,
    billingEnd = null,
    paidAt = null,
    failureReason = null,
    recoveryStatus = 'NONE',
    metadata = {},
  }) {
    const targetCreatorId = creatorId || userId
    const targetSubId = subscriptionId || razorpaySubscriptionId
    if (!targetCreatorId || !targetSubId) return null
    const dbData = {
      creatorId: targetCreatorId,
      provider: 'RAZORPAY',
      subscriptionId: targetSubId,
      razorpayInvoiceId: razorpayInvoiceId || null,
      razorpayPaymentId: razorpayPaymentId || null,
      amount: amount !== undefined ? amount : 0,
      currency: currency || 'INR',
      status: String(status).toUpperCase(),
      billingStart: billingStart ? new Date(billingStart) : null,
      billingEnd: billingEnd ? new Date(billingEnd) : null,
      paidAt: paidAt ? new Date(paidAt) : null,
      failureReason: failureReason || null,
      recoveryStatus: String(recoveryStatus).toUpperCase(),
      metadata: metadata || {},
      updatedAt: new Date(),
    }

    try {
      if (razorpayInvoiceId) {
        return await prisma.subscriptionInvoice.upsert({
          where: { razorpayInvoiceId },
          update: dbData,
          create: { ...dbData, issuedAt: new Date() },
        })
      }
      return await prisma.subscriptionInvoice.create({
        data: { ...dbData, issuedAt: new Date() },
      })
    } catch (e) {
      console.warn('[subscriptionInvoicesRepo] recordInvoice error:', e.message)
      return null
    }
  },

  async getByInvoiceId(razorpayInvoiceId) {
    if (!razorpayInvoiceId) return null
    try {
      return await prisma.subscriptionInvoice.findUnique({
        where: { razorpayInvoiceId },
      })
    } catch (e) {
      return null
    }
  },

  async getBySubscriptionId(subscriptionId) {
    if (!subscriptionId) return []
    try {
      return await prisma.subscriptionInvoice.findMany({
        where: { subscriptionId },
        orderBy: { issuedAt: 'desc' },
      })
    } catch (e) {
      return []
    }
  },

  async listOutstanding({ limit = 50 } = {}) {
    try {
      return await prisma.subscriptionInvoice.findMany({
        where: {
          status: { in: ['FAILED', 'PENDING', 'HALTED', 'ISSUED'] },
          recoveryStatus: { in: ['RETRY_PENDING', 'MANUAL_REQUIRED', 'NONE'] },
        },
        orderBy: { issuedAt: 'desc' },
        take: limit,
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              creatorProfile: {
                select: { name: true },
              },
            },
          },
        },
      })
    } catch (e) {
      console.warn('[subscriptionInvoicesRepo] listOutstanding error:', e.message)
      return []
    }
  },

  async updateInvoiceStatus(razorpayInvoiceId, status, extraData = {}) {
    if (!razorpayInvoiceId) return null
    try {
      const updateData = {
        status: String(status).toUpperCase(),
        updatedAt: new Date(),
      }
      if (extraData.razorpayPaymentId) updateData.razorpayPaymentId = extraData.razorpayPaymentId
      if (extraData.paidAt) updateData.paidAt = new Date(extraData.paidAt)
      if (extraData.failureReason !== undefined) updateData.failureReason = extraData.failureReason
      if (extraData.recoveryStatus) updateData.recoveryStatus = String(extraData.recoveryStatus).toUpperCase()
      if (extraData.attemptCount !== undefined) updateData.attemptCount = extraData.attemptCount
      if (extraData.metadata) updateData.metadata = extraData.metadata

      return await prisma.subscriptionInvoice.update({
        where: { razorpayInvoiceId },
        data: updateData,
      })
    } catch (e) {
      console.warn('[subscriptionInvoicesRepo] updateInvoiceStatus error:', e.message)
      return null
    }
  }
}

// ---------- Subscription Audit Logs ----------
export const subscriptionAuditLogsRepo = {
  async record(creatorId, event, data = {}) {
    const doc = {
      creatorId: creatorId || null,
      event,
      provider: data.provider || 'DODO',
      providerSubscriptionId: data.providerSubscriptionId || data.subscriptionId || data.dodoSubscriptionId || null,
      dodoCustomerId: data.dodoCustomerId || data.customerId || null,
      plan: data.plan || null,
      status: data.status || null,
      amount: data.amount !== undefined ? data.amount : null,
      currency: data.currency || null,
      metadata: data.metadata || data || {},
      createdAt: new Date(),
    }
    try {
      return await prisma.subscriptionAuditLog.create({ data: doc })
    } catch (e) {
      console.warn('[AuditLog] Prisma fallback:', e.message)
      const res = await supabaseAdmin.from('subscription_audit_logs').insert({
        ...doc,
        creator_id: doc.creatorId,
        provider_subscription_id: doc.providerSubscriptionId,
        dodo_customer_id: doc.dodoCustomerId,
        created_at: doc.createdAt.toISOString()
      }).select().maybeSingle()
      return res.data || doc
    }
  },
  async listByCreator(creatorId) {
    try {
      return await prisma.subscriptionAuditLog.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
      })
    } catch (e) {
      const { data } = await supabaseAdmin.from('subscription_audit_logs').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false })
      return data || []
    }
  }
}

// ---------- Auxiliary Repositories ----------
export const leadsRepo = {
  async create(lead) {
    const doc = { id: lead.id || cryptoId(), ...lead, createdAt: lead.createdAt || new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('leads').insert(doc)
    return clean(doc)
  },
  async capture(creatorId, data) {
    const doc = {
      id: data.id || cryptoId(),
      creatorId,
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      source: data.source || data.formName || data.leadMagnetTitle || 'Lead Magnet',
      leadMagnetTitle: data.leadMagnetTitle || data.source || 'Lead Magnet',
      status: data.status || 'ACTIVE',
      metadata: data.metadata || {},
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    delete doc._id
    await supabaseAdmin.from('leads').insert(doc)
    return clean(doc)
  },
  async list(creatorId, options = {}) {
    let query = supabaseAdmin.from('leads').select('*', { count: 'exact' }).eq('creatorId', creatorId).order('createdAt', { ascending: false })
    if (options.search) {
      const s = String(options.search).trim()
      if (s) {
        query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%`)
      }
    }
    const { data, count, error } = await query
    if (error) {
      console.warn('[leadsRepo.list] error:', error.message)
      return { items: [], total: 0 }
    }
    const cleaned = cleanMany(data || [])
    return {
      items: cleaned,
      total: count !== null && count !== undefined ? count : cleaned.length,
    }
  },
  async listByCreator(creatorId) {
    const { data } = await supabaseAdmin.from('leads').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  }
}

export const couponsRepo = {
  async create(coupon) {
    const doc = {
      id: coupon.id || cryptoId(),
      creatorId: coupon.creatorId,
      code: String(coupon.code || '').toUpperCase().trim(),
      type: coupon.type === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
      discount: Number(coupon.discount || 0),
      scope: coupon.scope === 'SPECIFIC' ? 'SPECIFIC' : 'ALL',
      productIds: Array.isArray(coupon.productIds) ? coupon.productIds : (coupon.productId ? [coupon.productId] : []),
      productId: coupon.productId || (Array.isArray(coupon.productIds) && coupon.productIds.length === 1 ? coupon.productIds[0] : null),
      minOrderPrice: Number(coupon.minOrderPrice || 0),
      validityHours: Number(coupon.validityHours || 24),
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : (coupon.expiryDate ? new Date(coupon.expiryDate) : new Date(Date.now() + 24 * 60 * 60 * 1000)),
      expiryDate: coupon.expiresAt ? new Date(coupon.expiresAt) : (coupon.expiryDate ? new Date(coupon.expiryDate) : new Date(Date.now() + 24 * 60 * 60 * 1000)),
      usageLimit: Number(coupon.usageLimit || 0),
      usedCount: Number(coupon.usedCount || 0),
      status: coupon.status || 'ACTIVE',
    }

    try {
      const created = await prisma.coupon.create({
        data: {
          id: doc.id,
          creatorId: doc.creatorId,
          code: doc.code,
          type: doc.type,
          discount: doc.discount,
          scope: doc.scope,
          productIds: doc.productIds,
          productId: doc.productId,
          minOrderPrice: doc.minOrderPrice,
          validityHours: doc.validityHours,
          expiresAt: doc.expiresAt,
          expiryDate: doc.expiryDate,
          usageLimit: doc.usageLimit,
          usedCount: doc.usedCount,
          status: doc.status,
        }
      })
      if (created) return clean(created)
    } catch (e) {
      console.warn('Prisma coupon create fallback to Supabase:', e?.message)
    }

    delete doc._id
    await supabaseAdmin.from('coupons').insert({
      ...doc,
      expiresAt: doc.expiresAt.toISOString(),
      expiryDate: doc.expiryDate.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return clean(doc)
  },

  async getByCode(creatorId, code) {
    if (!creatorId || !code) return null
    const upper = String(code).toUpperCase().trim()
    try {
      const found = await prisma.coupon.findFirst({
        where: { creatorId, code: upper }
      })
      if (found) return clean(found)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('coupons')
      .select('*')
      .eq('creatorId', creatorId)
      .eq('code', upper)
      .maybeSingle()
    return clean(data)
  },

  async getById(id) {
    if (!id) return null
    try {
      const found = await prisma.coupon.findUnique({
        where: { id }
      })
      if (found) return clean(found)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('coupons').select('*').eq('id', id).maybeSingle()
    return clean(data)
  },

  async listByCreator(creatorId) {
    if (!creatorId) return []
    await this.deleteExpired(creatorId).catch(() => { })
    try {
      const items = await prisma.coupon.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' }
      })
      if (items) return cleanMany(items)
    } catch (e) { }
    const { data } = await supabaseAdmin.from('coupons').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
    return cleanMany(data || [])
  },

  async delete(creatorId, id) {
    if (!id) return false
    try {
      const where = creatorId ? { id, creatorId } : { id }
      await prisma.coupon.deleteMany({ where })
      return true
    } catch (e) { }
    let query = supabaseAdmin.from('coupons').delete().eq('id', id)
    if (creatorId) {
      query = query.eq('creatorId', creatorId)
    }
    const { error } = await query
    return !error
  },

  async deleteExpired(creatorId = null) {
    try {
      const now = new Date()
      const where = {
        expiresAt: { lte: now }
      }
      if (creatorId) where.creatorId = creatorId
      await prisma.coupon.deleteMany({ where }).catch(() => { })
    } catch (e) { }
    try {
      let query = supabaseAdmin.from('coupons').select('id, expiresAt, expiryDate')
      if (creatorId) {
        query = query.eq('creatorId', creatorId)
      }
      const { data: coupons } = await query
      if (!coupons || coupons.length === 0) return true

      const now = new Date()
      const expiredIds = coupons
        .filter((c) => {
          const exp = c.expiresAt ? new Date(c.expiresAt) : (c.expiryDate ? new Date(c.expiryDate) : null)
          return exp && exp <= now
        })
        .map((c) => c.id)

      if (expiredIds.length > 0) {
        await supabaseAdmin.from('coupons').delete().in('id', expiredIds)
      }
      return true
    } catch (err) {
      return false
    }
  },

  async incrementUsedCount(id) {
    if (!id) return
    try {
      await prisma.coupon.update({
        where: { id },
        data: { usedCount: { increment: 1 } }
      })
      return
    } catch (e) { }
    const coupon = await this.getById(id)
    if (!coupon) return
    const nextCount = (coupon.usedCount || 0) + 1
    await supabaseAdmin.from('coupons').update({
      usedCount: nextCount,
      updatedAt: new Date().toISOString()
    }).eq('id', id)
  }
}

export const emailRepo = {
  async logEmail(emailLog) {
    const doc = { id: emailLog.id || cryptoId(), ...emailLog }
    delete doc._id
    try {
      await supabaseAdmin.from('email_logs').insert(toDb(doc))
    } catch (e) {
      await supabaseAdmin.from('email_logs').insert(doc)
    }
    return clean(doc)
  },
  async createBroadcast(creatorId, data) {
    const doc = {
      id: data.id || cryptoId(),
      creatorId,
      name: data.name || data.subject || 'Campaign',
      subject: data.subject,
      content: data.content,
      audience: data.audience || 'ALL_CUSTOMERS',
      sentCount: Number(data.sentCount || 0),
      status: data.status || 'SENT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    delete doc._id
    try {
      await supabaseAdmin.from('email_broadcasts').insert(toDb(doc))
    } catch (e) {
      try {
        await supabaseAdmin.from('email_broadcasts').insert(doc)
      } catch (err) { }
    }
    return clean(doc)
  },
  async listBroadcasts(creatorId) {
    if (!creatorId) return []
    try {
      let { data } = await supabaseAdmin.from('email_broadcasts').select('*').eq('creatorId', creatorId).order('createdAt', { ascending: false })
      if (!data || data.length === 0) {
        const res = await supabaseAdmin.from('email_broadcasts').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false })
        data = res.data
      }
      return cleanMany(data || [])
    } catch (e) {
      return []
    }
  },
  async updateBroadcast(id, creatorId, patch) {
    const doc = { ...patch, updatedAt: new Date().toISOString() }
    delete doc.id
    delete doc._id
    try {
      await supabaseAdmin.from('email_broadcasts').update(toDb(doc)).eq('id', id).eq('creator_id', creatorId)
    } catch (e) {
      try {
        await supabaseAdmin.from('email_broadcasts').update(doc).eq('id', id).eq('creatorId', creatorId)
      } catch (err) { }
    }
    return true
  }
}

export const customerTagsRepo = {
  async addTag(creatorId, customerId, tag) {
    const doc = { id: cryptoId(), creatorId, customerId, tag, createdAt: new Date().toISOString() }
    await supabaseAdmin.from('customer_tags').upsert(doc, { onConflict: 'creatorId,customerId,tag' })
    return clean(doc)
  },
  async listTags(creatorId, customerId) {
    const { data } = await supabaseAdmin.from('customer_tags').select('*').eq('creatorId', creatorId).eq('customerId', customerId)
    return cleanMany(data || [])
  }
}

export const onboardingRepo = {
  async upsert(creatorId, state) {
    const doc = { creatorId, ...state, updatedAt: new Date().toISOString() }
    delete doc._id
    await supabaseAdmin.from('onboarding_states').upsert(doc, { onConflict: 'creatorId' })
    return clean(doc)
  },
  async getByCreator(creatorId) {
    const { data } = await supabaseAdmin.from('onboarding_states').select('*').eq('creatorId', creatorId).maybeSingle()
    return clean(data)
  }
}

export const instagramRepo = {
  async getByCreatorId(creatorId) {
    if (!creatorId) return null
    try {
      const acc = await prisma.instagramAccount.findUnique({ where: { creatorId } })
      return clean(acc)
    } catch (e) {
      console.error('instagramRepo.getByCreatorId error:', e)
      return null
    }
  },
  async getByPlatformUserId(platformUserId) {
    if (!platformUserId) return null
    try {
      let acc = await prisma.instagramAccount.findFirst({
        where: { platformUserId, status: 'CONNECTED' },
        orderBy: { updatedAt: 'desc' },
      })
      if (!acc) {
        acc = await prisma.instagramAccount.findFirst({
          where: { platformUserId },
          orderBy: { updatedAt: 'desc' },
        })
      }
      return clean(acc)
    } catch (e) {
      console.error('instagramRepo.getByPlatformUserId error:', e)
      return null
    }
  },
  async upsert(creatorId, data) {
    if (!creatorId) return null
    try {
      // Safely disconnect any previous/stale duplicate rows for the same platformUserId or username under a different creatorId
      if (data.username || data.platformUserId) {
        const orConditions = []
        if (data.platformUserId) orConditions.push({ platformUserId: data.platformUserId })
        if (data.username) orConditions.push({ username: data.username })

        const existingStale = await prisma.instagramAccount.findMany({
          where: {
            OR: orConditions,
            NOT: { creatorId },
          },
        })
        if (existingStale.length > 0) {
          console.log(`[INSTAGRAM_REPO_CLEANUP] Found ${existingStale.length} duplicate account rows for ${data.username || data.platformUserId}. Marking as DISCONNECTED.`)
          await prisma.instagramAccount.updateMany({
            where: { id: { in: existingStale.map(a => a.id) } },
            data: { status: 'DISCONNECTED', updatedAt: new Date() },
          })
        }
      }

      const acc = await prisma.instagramAccount.upsert({
        where: { creatorId },
        update: {
          platform: data.platform || 'INSTAGRAM',
          platformUserId: data.platformUserId || null,
          username: data.username || null,
          accessToken: data.accessToken || null,
          tokenExpiresAt: data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null,
          status: data.status || 'CONNECTED',
          updatedAt: new Date(),
        },
        create: {
          creatorId,
          platform: data.platform || 'INSTAGRAM',
          platformUserId: data.platformUserId || null,
          username: data.username || null,
          accessToken: data.accessToken || null,
          tokenExpiresAt: data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null,
          status: data.status || 'CONNECTED',
        },
      })
      return clean(acc)
    } catch (e) {
      console.error('instagramRepo.upsert error:', e)
      throw e
    }
  },
  async deleteByCreatorId(creatorId) {
    if (!creatorId) return false
    try {
      await prisma.instagramAccount.deleteMany({ where: { creatorId } })
      return true
    } catch (e) {
      console.error('instagramRepo.deleteByCreatorId error:', e)
      return false
    }
  }
}

export const automationsRepo = {
  async list(creatorId, options = {}) {
    if (!creatorId) return []
    try {
      const items = await prisma.automation.findMany({
        where: { creatorId },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      })
      return cleanMany(items)
    } catch (e) {
      console.error('automationsRepo.list error:', e)
      return []
    }
  },
  async getById(id) {
    if (!id) return null
    try {
      const item = await prisma.automation.findUnique({
        where: { id },
        include: { product: true },
      })
      return clean(item)
    } catch (e) {
      console.error('automationsRepo.getById error:', e)
      return null
    }
  },
  async getForCreator(id, creatorId) {
    if (!id || !creatorId) return null
    try {
      const item = await prisma.automation.findFirst({
        where: { id, creatorId },
        include: { product: true },
      })
      return clean(item)
    } catch (e) {
      console.error('automationsRepo.getForCreator error:', e)
      return null
    }
  },
  async create(data) {
    try {
      const item = await prisma.automation.create({
        data: {
          creatorId: data.creatorId,
          name: data.name,
          platform: data.platform || 'INSTAGRAM',
          triggerType: data.triggerType || 'COMMENT_KEYWORD',
          triggerValue: data.triggerValue,
          actionType: data.actionType || 'SEND_DM',
          productId: data.productId || null,
          customUrl: data.customUrl || null,
          destinationType: data.destinationType || 'PRODUCT',
          message: data.message,
          mediaId: data.mediaId || null,
          mediaType: data.mediaType || 'ALL',
          mediaUrl: data.mediaUrl || null,
          mediaCaption: data.mediaCaption || null,
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          commentReply: data.commentReply || null,
          openingMessageEnabled: Boolean(data.openingMessageEnabled),
          openingMessage: data.openingMessage || null,
          openingButtonText: data.openingButtonText || 'Send me the link',
          buttonText: data.buttonText || 'Get access',
          responses: data.responses !== undefined ? data.responses : [],
          status: data.status || 'ACTIVE',
        },
        include: { product: true }
      })
      return clean(item)
    } catch (e) {
      console.error('automationsRepo.create error:', e)
      throw e
    }
  },
  async update(id, creatorId, data) {
    if (!id || !creatorId) return null
    try {
      await prisma.automation.updateMany({
        where: { id, creatorId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.triggerValue !== undefined && { triggerValue: data.triggerValue }),
          ...(data.productId !== undefined && { productId: data.productId }),
          ...(data.customUrl !== undefined && { customUrl: data.customUrl }),
          ...(data.destinationType !== undefined && { destinationType: data.destinationType }),
          ...(data.message !== undefined && { message: data.message }),
          ...(data.mediaId !== undefined && { mediaId: data.mediaId }),
          ...(data.mediaType !== undefined && { mediaType: data.mediaType }),
          ...(data.mediaUrl !== undefined && { mediaUrl: data.mediaUrl }),
          ...(data.mediaCaption !== undefined && { mediaCaption: data.mediaCaption }),
          ...(data.keywords !== undefined && { keywords: Array.isArray(data.keywords) ? data.keywords : [] }),
          ...(data.commentReply !== undefined && { commentReply: data.commentReply }),
          ...(data.openingMessageEnabled !== undefined && { openingMessageEnabled: Boolean(data.openingMessageEnabled) }),
          ...(data.openingMessage !== undefined && { openingMessage: data.openingMessage }),
          ...(data.openingButtonText !== undefined && { openingButtonText: data.openingButtonText }),
          ...(data.buttonText !== undefined && { buttonText: data.buttonText }),
          ...(data.responses !== undefined && { responses: data.responses }),
          ...(data.status !== undefined && { status: data.status }),
          updatedAt: new Date(),
        },
      })
      return await this.getForCreator(id, creatorId)
    } catch (e) {
      console.error('automationsRepo.update error:', e)
      throw e
    }
  },
  async delete(id, creatorId) {
    if (!id || !creatorId) return false
    try {
      const res = await prisma.automation.deleteMany({ where: { id, creatorId } })
      return res.count > 0
    } catch (e) {
      console.error('automationsRepo.delete error:', e)
      return false
    }
  },
  async findMatchingAutomations(platform, triggerType, triggerValue) {
    try {
      const items = await prisma.automation.findMany({
        where: {
          platform,
          triggerType,
          status: 'ACTIVE',
          triggerValue: { equals: triggerValue, mode: 'insensitive' }
        },
        include: {
          creator: {
            include: {
              instagramAccount: true,
              store: true,
            }
          },
          product: true,
        }
      })
      return cleanMany(items)
    } catch (e) {
      console.error('automationsRepo.findMatchingAutomations error:', e)
      return []
    }
  },
  async findActiveByCreatorId(creatorId) {
    if (!creatorId) return []
    try {
      const items = await prisma.automation.findMany({
        where: {
          creatorId,
          status: 'ACTIVE',
        },
        include: {
          creator: {
            include: {
              instagramAccount: true,
              store: true,
              creatorProfile: true,
            }
          },
          product: true,
        }
      })
      return cleanMany(items)
    } catch (e) {
      console.error('automationsRepo.findActiveByCreatorId error:', e)
      return []
    }
  }
}

export const automationEventsRepo = {
  async claimCommentEvent({ creatorId, automationId, instagramAccountId, productId, commentId }) {
    if (!commentId) return { claimed: true }
    try {
      const existing = await prisma.automationEvent.findFirst({
        where: {
          commentId,
          eventType: { in: ['COMMENT_RECEIVED', 'DM_SENT', 'COMMENT_REPLIED', 'CLAIMED'] }
        }
      })
      if (existing) {
        return { claimed: false, existing: clean(existing) }
      }

      const evt = await prisma.automationEvent.create({
        data: {
          creatorId,
          automationId: automationId || null,
          instagramAccountId: instagramAccountId || null,
          productId: productId || null,
          commentId,
          eventType: 'COMMENT_RECEIVED',
          status: 'SUCCESS',
          metadata: { claimedAt: new Date().toISOString() },
        }
      })
      return { claimed: true, event: clean(evt) }
    } catch (e) {
      console.error('automationEventsRepo.claimCommentEvent error:', e)
      const doubleCheck = await prisma.automationEvent.findFirst({
        where: {
          commentId,
          eventType: { in: ['COMMENT_RECEIVED', 'DM_SENT', 'COMMENT_REPLIED', 'CLAIMED'] }
        }
      })
      if (doubleCheck) {
        return { claimed: false, existing: clean(doubleCheck) }
      }
      return { claimed: true }
    }
  },

  async recordEvent({ creatorId, automationId, instagramAccountId, productId, commentId, eventType, status = 'SUCCESS', metadata = {} }) {
    if (!creatorId || !eventType) return null
    try {
      const evt = await prisma.automationEvent.create({
        data: {
          creatorId,
          automationId: automationId || null,
          instagramAccountId: instagramAccountId || null,
          productId: productId || null,
          commentId: commentId || null,
          eventType,
          status,
          metadata: metadata || {},
        }
      })
      return clean(evt)
    } catch (e) {
      console.error('automationEventsRepo.recordEvent error:', e)
      return null
    }
  },

  async getMetricsForAutomation(automationId, sinceDate = null) {
    if (!automationId) return { comments: 0, dmsSent: 0, dmFailures: 0, clicks: 0, checkouts: 0, purchases: 0, revenue: 0, dmSuccessRate: 100, clickThroughRate: 0, conversionRate: 0 }
    try {
      const where = {
        automationId,
        ...(sinceDate ? { createdAt: { gte: new Date(sinceDate) } } : {})
      }
      const events = await prisma.automationEvent.findMany({ where })

      let comments = 0, dmsSent = 0, dmFailures = 0, clicks = 0, checkouts = 0, purchases = 0

      for (const ev of events) {
        if (ev.eventType === 'COMMENT_RECEIVED') comments++
        else if (ev.eventType === 'DM_SENT') dmsSent++
        else if (ev.eventType === 'DM_FAILED') dmFailures++
        else if (ev.eventType === 'LINK_CLICKED') clicks++
        else if (ev.eventType === 'CHECKOUT_STARTED') checkouts++
        else if (ev.eventType === 'PURCHASE_COMPLETED') purchases++
      }

      const paidOrders = await prisma.order.findMany({
        where: {
          automationId,
          status: 'PAID',
          ...(sinceDate ? { createdAt: { gte: new Date(sinceDate) } } : {})
        },
        select: { amount: true }
      })
      const revenue = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0)

      return {
        comments,
        dmsSent,
        dmFailures,
        clicks,
        checkouts,
        purchases: purchases || paidOrders.length,
        revenue,
        dmSuccessRate: (dmsSent + dmFailures) > 0 ? Math.round((dmsSent / (dmsSent + dmFailures)) * 100) : 100,
        clickThroughRate: dmsSent > 0 ? Math.round((clicks / dmsSent) * 100) : 0,
        conversionRate: comments > 0 ? Math.round((paidOrders.length / comments) * 10000) / 100 : 0
      }
    } catch (e) {
      console.error('automationEventsRepo.getMetricsForAutomation error:', e)
      return { comments: 0, dmsSent: 0, dmFailures: 0, clicks: 0, checkouts: 0, purchases: 0, revenue: 0, dmSuccessRate: 100, clickThroughRate: 0, conversionRate: 0 }
    }
  },

  async getMetricsForCreator(creatorId, sinceDate = null) {
    if (!creatorId) return { comments: 0, dmsSent: 0, dmFailures: 0, clicks: 0, checkouts: 0, purchases: 0, revenue: 0, dmSuccessRate: 100, conversionRate: 0 }
    try {
      const where = {
        creatorId,
        ...(sinceDate ? { createdAt: { gte: new Date(sinceDate) } } : {})
      }
      const events = await prisma.automationEvent.findMany({ where })

      let comments = 0, dmsSent = 0, dmFailures = 0, clicks = 0, checkouts = 0, purchases = 0

      for (const ev of events) {
        if (ev.eventType === 'COMMENT_RECEIVED') comments++
        else if (ev.eventType === 'DM_SENT') dmsSent++
        else if (ev.eventType === 'DM_FAILED') dmFailures++
        else if (ev.eventType === 'LINK_CLICKED') clicks++
        else if (ev.eventType === 'CHECKOUT_STARTED') checkouts++
        else if (ev.eventType === 'PURCHASE_COMPLETED') purchases++
      }

      const paidOrders = await prisma.order.findMany({
        where: {
          creatorId,
          automationId: { not: null },
          status: 'PAID',
          ...(sinceDate ? { createdAt: { gte: new Date(sinceDate) } } : {})
        },
        select: { amount: true }
      })
      const revenue = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0)

      return {
        comments,
        dmsSent,
        dmFailures,
        clicks,
        checkouts,
        purchases: purchases || paidOrders.length,
        revenue,
        dmSuccessRate: (dmsSent + dmFailures) > 0 ? Math.round((dmsSent / (dmsSent + dmFailures)) * 100) : 100,
        conversionRate: comments > 0 ? Math.round((paidOrders.length / comments) * 10000) / 100 : 0
      }
    } catch (e) {
      console.error('automationEventsRepo.getMetricsForCreator error:', e)
      return { comments: 0, dmsSent: 0, dmFailures: 0, clicks: 0, checkouts: 0, purchases: 0, revenue: 0, dmSuccessRate: 100, conversionRate: 0 }
    }
  },

  async listEventsForAutomation(automationId, creatorId, { limit = 20, offset = 0 } = {}) {
    if (!automationId || !creatorId) return []
    try {
      const items = await prisma.automationEvent.findMany({
        where: { automationId, creatorId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
      })
      return cleanMany(items)
    } catch (e) {
      console.error('automationEventsRepo.listEventsForAutomation error:', e)
      return []
    }
  }
}

// ------------------------------------------------------------------------------
// OTP Verifications & Rate Limiting Shared Repository (Serverless-Safe)
// ------------------------------------------------------------------------------
export const otpVerificationsRepo = {
  async get(identifier, purpose) {
    if (!identifier || !purpose) return null
    const cleanId = String(identifier).trim().toLowerCase()
    try {
      const record = await prisma.otpVerification.findUnique({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
      })
      return clean(record)
    } catch (e) {
      console.error('otpVerificationsRepo.get error:', e)
      throw e
    }
  },

  async upsert({ identifier, purpose, otpHash, expiresAt, resendAvailableAt, maxAttempts = 5, metadata = {} }) {
    if (!identifier || !purpose) throw new Error('identifier and purpose are required')
    const cleanId = String(identifier).trim().toLowerCase()
    try {
      const record = await prisma.otpVerification.upsert({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
        create: {
          identifier: cleanId,
          purpose,
          otpHash,
          attempts: 0,
          maxAttempts,
          expiresAt: new Date(expiresAt),
          resendAvailableAt: new Date(resendAvailableAt),
          consumedAt: null,
          metadata,
        },
        update: {
          otpHash,
          attempts: 0,
          maxAttempts,
          expiresAt: new Date(expiresAt),
          resendAvailableAt: new Date(resendAvailableAt),
          consumedAt: null,
          metadata,
          updatedAt: new Date(),
        },
      })
      return clean(record)
    } catch (e) {
      console.error('otpVerificationsRepo.upsert error:', e)
      throw e
    }
  },

  async recordFailedAttempt(identifier, purpose) {
    if (!identifier || !purpose) return null
    const cleanId = String(identifier).trim().toLowerCase()
    try {
      const updated = await prisma.otpVerification.update({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
        data: {
          attempts: { increment: 1 },
          updatedAt: new Date(),
        },
      })
      return clean(updated)
    } catch (e) {
      console.error('otpVerificationsRepo.recordFailedAttempt error:', e)
      throw e
    }
  },

  async consume(identifier, purpose) {
    if (!identifier || !purpose) return null
    const cleanId = String(identifier).trim().toLowerCase()
    try {
      const updated = await prisma.otpVerification.update({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
        data: {
          consumedAt: new Date(),
          otpHash: null,
          updatedAt: new Date(),
        },
      })
      return clean(updated)
    } catch (e) {
      console.error('otpVerificationsRepo.consume error:', e)
      throw e
    }
  },

  async invalidate(identifier, purpose) {
    if (!identifier || !purpose) return null
    const cleanId = String(identifier).trim().toLowerCase()
    try {
      const updated = await prisma.otpVerification.update({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
        data: {
          otpHash: null,
          consumedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      return clean(updated)
    } catch (e) {
      console.error('otpVerificationsRepo.invalidate error:', e)
      throw e
    }
  },

  async checkAndIncrementRateLimit(identifier, purpose, windowSeconds = 3600, maxLimit = 5) {
    if (!identifier || !purpose) return { allowed: true }
    const cleanId = String(identifier).trim().toLowerCase()
    const now = new Date()
    try {
      const existing = await prisma.otpVerification.findUnique({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
      })

      if (!existing || existing.expiresAt <= now) {
        const resetExpiresAt = new Date(now.getTime() + windowSeconds * 1000)
        await prisma.otpVerification.upsert({
          where: {
            identifier_purpose: {
              identifier: cleanId,
              purpose,
            },
          },
          create: {
            identifier: cleanId,
            purpose,
            attempts: 1,
            maxAttempts: maxLimit,
            expiresAt: resetExpiresAt,
            resendAvailableAt: now,
          },
          update: {
            attempts: 1,
            maxAttempts: maxLimit,
            expiresAt: resetExpiresAt,
            updatedAt: now,
          },
        })
        return { allowed: true, count: 1, remaining: maxLimit - 1 }
      }

      const updated = await prisma.otpVerification.update({
        where: {
          identifier_purpose: {
            identifier: cleanId,
            purpose,
          },
        },
        data: {
          attempts: { increment: 1 },
          updatedAt: now,
        },
      })

      const count = updated.attempts
      if (count > maxLimit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000))
        return { allowed: false, count, maxLimit, retryAfterSeconds }
      }

      return { allowed: true, count, remaining: Math.max(0, maxLimit - count) }
    } catch (e) {
      console.error('otpVerificationsRepo.checkAndIncrementRateLimit error:', e)
      throw e
    }
  },

  async cleanupExpired() {
    try {
      const threshold = new Date(Date.now() - 3600 * 1000)
      return await prisma.otpVerification.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: threshold } },
            { consumedAt: { not: null }, updatedAt: { lt: threshold } },
          ],
        },
      })
    } catch (e) {
      console.error('otpVerificationsRepo.cleanupExpired error:', e)
      return { count: 0 }
    }
  },
}

// ---------- Support Tickets Repository ----------
export const supportTicketsRepo = {
  async create(data) {
    const ticketNumber = `CS-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
    const payload = {
      ticketNumber,
      creatorId: data.creatorId,
      subject: data.subject,
      category: data.category,
      description: data.description,
      relatedPage: data.relatedPage || null,
      status: 'OPEN',
      priority: 'NORMAL',
    }

    try {
      const created = await prisma.supportTicket.create({
        data: payload,
      })
      return clean(created)
    } catch (e) {
      console.warn('[supportTicketsRepo.create] Prisma error, trying Supabase fallback:', e?.message || e)
      const doc = {
        id: cryptoId(),
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const { data: inserted, error } = await supabaseAdmin.from('support_tickets').insert(doc).select().single()
      if (error) throw error
      return clean(inserted || doc)
    }
  },

  async listByCreator(creatorId) {
    if (!creatorId) return []
    try {
      const tickets = await prisma.supportTicket.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
      })
      return cleanMany(tickets)
    } catch (e) {
      const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
      if (error) return []
      return cleanMany(data || [])
    }
  },

  async getById(ticketId, creatorId) {
    if (!ticketId) return null
    try {
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id: ticketId,
          ...(creatorId ? { creatorId } : {}),
        },
      })
      return ticket ? clean(ticket) : null
    } catch (e) {
      const query = supabaseAdmin.from('support_tickets').select('*').eq('id', ticketId)
      if (creatorId) query.eq('creator_id', creatorId)
      const { data } = await query.maybeSingle()
      return data ? clean(data) : null
    }
  },

  async getByTicketNumber(ticketNumber, creatorId) {
    if (!ticketNumber) return null
    try {
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          ticketNumber,
          ...(creatorId ? { creatorId } : {}),
        },
      })
      return ticket ? clean(ticket) : null
    } catch (e) {
      const query = supabaseAdmin.from('support_tickets').select('*').eq('ticket_number', ticketNumber)
      if (creatorId) query.eq('creator_id', creatorId)
      const { data } = await query.maybeSingle()
      return data ? clean(data) : null
    }
  },
}

// ---------- Bundles Repository ----------
export const bundlesRepo = {
  async getBundle(bundleId, creatorId = null) {
    if (!bundleId) return null
    try {
      const where = { id: bundleId }
      if (creatorId) where.creatorId = creatorId
      const p = await prisma.product.findFirst({
        where,
        include: {
          bundleItems: {
            include: { product: true },
            orderBy: { position: 'asc' },
          },
        },
      })
      if (!p) return null
      const cleaned = clean(p)
      cleaned.bundleProducts = (p.bundleItems || []).map((bi) => clean(bi.product)).filter(Boolean)
      cleaned.bundleProductIds = (p.bundleItems || []).map((bi) => bi.productId)
      cleaned.productCount = cleaned.bundleProducts.length
      return cleaned
    } catch (e) {
      console.error('bundlesRepo.getBundle error:', e)
      return null
    }
  },

  async createBundle(creatorId, {
    title,
    description = '',
    thumbnail = null,
    productIds = [],
    displayMode = 'classic',
    status = 'PUBLISHED',
    storePublished = true,
  }) {
    const uniqueIds = [...new Set(productIds)]
    const products = await prisma.product.findMany({
      where: {
        id: { in: uniqueIds },
        creatorId,
        NOT: { status: 'ARCHIVED' },
      },
    })

    if (products.length !== uniqueIds.length) {
      throw new Error('One or more selected products are invalid, archived, or do not belong to you')
    }

    const orderedProducts = uniqueIds
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)

    const currency = (orderedProducts[0]?.currency || 'USD').toUpperCase()
    const totalPrice = orderedProducts.reduce((sum, p) => sum + Number(p.price || 0), 0)

    const cleanTitle = (title || 'Untitled Bundle').trim()
    let slug = slugify(cleanTitle)
    let n = 1
    while (await productsRepo.slugExists(creatorId, slug)) {
      slug = `${slugify(cleanTitle)}-${n++}`
    }

    const bundleId = cryptoId()

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          id: bundleId,
          creatorId,
          title: cleanTitle,
          slug,
          type: 'BUNDLE',
          status,
          price: totalPrice,
          currency,
          description: description || null,
          shortDescription: `${orderedProducts.length} product${orderedProducts.length === 1 ? '' : 's'} included`,
          thumbnail: thumbnail || null,
          coverImage: thumbnail || null,
          storePublished: storePublished !== false,
          displayMode: displayMode || 'classic',
        },
      })

      if (uniqueIds.length > 0) {
        await tx.bundleItem.createMany({
          data: uniqueIds.map((pid, idx) => ({
            id: cryptoId(),
            bundleId: created.id,
            productId: pid,
            position: idx,
          })),
        })
      }

      return created
    })

    return this.getBundle(result.id, creatorId)
  },

  async updateBundle(creatorId, bundleId, {
    title,
    description,
    thumbnail,
    productIds,
    displayMode,
    status,
    storePublished,
  }) {
    const existing = await productsRepo.getForCreator(bundleId, creatorId)
    if (!existing) {
      throw new Error('Bundle not found')
    }

    const patch = {}
    if (title !== undefined) patch.title = (title || 'Untitled Bundle').trim()
    if (description !== undefined) patch.description = description || null
    if (thumbnail !== undefined) {
      patch.thumbnail = thumbnail || null
      patch.coverImage = thumbnail || null
    }
    if (displayMode !== undefined) patch.displayMode = displayMode
    if (status !== undefined) patch.status = status
    if (storePublished !== undefined) patch.storePublished = storePublished

    if (Array.isArray(productIds)) {
      const uniqueIds = [...new Set(productIds)]
      const constituent = await prisma.product.findMany({
        where: {
          id: { in: uniqueIds },
          creatorId,
          NOT: { status: 'ARCHIVED' },
        },
      })

      if (constituent.length !== uniqueIds.length) {
        throw new Error('One or more selected products are invalid, archived, or do not belong to you')
      }

      const orderedProducts = uniqueIds
        .map((id) => constituent.find((p) => p.id === id))
        .filter(Boolean)

      patch.price = orderedProducts.reduce((sum, p) => sum + Number(p.price || 0), 0)
      if (orderedProducts[0]?.currency) {
        patch.currency = orderedProducts[0].currency.toUpperCase()
      }
      patch.shortDescription = `${orderedProducts.length} product${orderedProducts.length === 1 ? '' : 's'} included`
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: bundleId },
        data: patch,
      })

      if (Array.isArray(productIds)) {
        await tx.bundleItem.deleteMany({
          where: { bundleId },
        })
        if (productIds.length > 0) {
          const uniqueIds = [...new Set(productIds)]
          await tx.bundleItem.createMany({
            data: uniqueIds.map((pid, idx) => ({
              id: cryptoId(),
              bundleId,
              productId: pid,
              position: idx,
            })),
          })
        }
      }
    })

    return this.getBundle(bundleId, creatorId)
  },

  async deleteBundle(creatorId, bundleId) {
    const existing = await productsRepo.getForCreator(bundleId, creatorId)
    if (!existing) {
      throw new Error('Bundle not found')
    }
    await prisma.product.delete({
      where: { id: bundleId },
    })
    return { success: true }
  },
}

// ------------------------------------------------------------------------------
// FORMS, SUBMISSIONS & SUBSCRIBERS REPOSITORY
// ------------------------------------------------------------------------------

export const formsRepo = {
  async listForms(creatorId, options = {}) {
    if (!creatorId) return []
    const where = { creatorId }
    if (options.status) {
      where.status = options.status
    }
    if (options.formType) {
      where.formType = options.formType
    }
    const forms = await prisma.form.findMany({
      where,
      include: {
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return forms.map((f) => ({
      id: f.id,
      creatorId: f.creatorId,
      sectionId: f.sectionId,
      formType: f.formType,
      title: f.title,
      description: f.description,
      buttonText: f.buttonText,
      successMessage: f.successMessage,
      notificationEmail: f.notificationEmail,
      status: f.status,
      settings: f.settings && typeof f.settings === 'object' ? f.settings : {},
      submissionCount: f._count?.submissions || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }))
  },

  async getForm(id, creatorId = null) {
    if (!id) return null
    const where = { id }
    if (creatorId) {
      where.creatorId = creatorId
    }
    const f = await prisma.form.findFirst({
      where,
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    })
    if (!f) return null
    return {
      id: f.id,
      creatorId: f.creatorId,
      sectionId: f.sectionId,
      formType: f.formType,
      title: f.title,
      description: f.description,
      buttonText: f.buttonText,
      successMessage: f.successMessage,
      notificationEmail: f.notificationEmail,
      status: f.status,
      settings: f.settings && typeof f.settings === 'object' ? f.settings : {},
      submissionCount: f._count?.submissions || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }
  },

  async getFormBySection(sectionId, creatorId = null) {
    if (!sectionId) return null
    const where = { sectionId }
    if (creatorId) {
      where.creatorId = creatorId
    }
    const f = await prisma.form.findFirst({
      where,
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    })
    if (!f) return null
    return {
      id: f.id,
      creatorId: f.creatorId,
      sectionId: f.sectionId,
      formType: f.formType,
      title: f.title,
      description: f.description,
      buttonText: f.buttonText,
      successMessage: f.successMessage,
      notificationEmail: f.notificationEmail,
      status: f.status,
      settings: f.settings && typeof f.settings === 'object' ? f.settings : {},
      submissionCount: f._count?.submissions || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }
  },

  async createForm(creatorId, data) {
    if (!creatorId) throw new Error('creatorId is required')
    const id = data.id || cryptoId()
    const formType = (data.formType || 'contact').toLowerCase()
    const title = (data.title || 'Contact Form').trim()
    const description = (data.description || data.subtitle || '').trim()
    const buttonText = (data.buttonText || '').trim()
    const successMessage = (data.successMessage || '').trim()
    const notificationEmail = (data.notificationEmail || '').trim()
    const status = data.status || 'PUBLISHED'
    const settings = data.settings && typeof data.settings === 'object' ? data.settings : {}
    const sectionId = data.sectionId || null

    const created = await prisma.form.create({
      data: {
        id,
        creatorId,
        sectionId,
        formType,
        title,
        description,
        buttonText,
        successMessage,
        notificationEmail,
        status,
        settings,
      },
    })

    return {
      ...created,
      submissionCount: 0,
    }
  },

  async updateForm(id, creatorId, data) {
    if (!id || !creatorId) throw new Error('Form ID and creatorId required')
    const existing = await prisma.form.findFirst({
      where: { id, creatorId },
    })
    if (!existing) throw new Error('Form not found')

    const updateData = {}
    if (data.title !== undefined) updateData.title = data.title.trim()
    if (data.description !== undefined || data.subtitle !== undefined) {
      updateData.description = (data.description !== undefined ? data.description : data.subtitle).trim()
    }
    if (data.buttonText !== undefined) updateData.buttonText = data.buttonText.trim()
    if (data.successMessage !== undefined) updateData.successMessage = data.successMessage.trim()
    if (data.notificationEmail !== undefined) updateData.notificationEmail = data.notificationEmail.trim()
    if (data.status !== undefined) updateData.status = data.status
    if (data.settings !== undefined) updateData.settings = data.settings
    if (data.sectionId !== undefined) updateData.sectionId = data.sectionId
    if (data.formType !== undefined) updateData.formType = data.formType.toLowerCase()

    const updated = await prisma.form.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    })

    return {
      ...updated,
      submissionCount: updated._count?.submissions || 0,
    }
  },

  async deleteForm(id, creatorId) {
    if (!id || !creatorId) throw new Error('Form ID and creatorId required')
    const existing = await prisma.form.findFirst({
      where: { id, creatorId },
    })
    if (!existing) throw new Error('Form not found')

    await prisma.form.delete({
      where: { id },
    })
    return { success: true }
  },

  async listSubmissions(creatorId, options = {}) {
    if (!creatorId) return { items: [], total: 0, unreadCount: 0, page: 1, totalPages: 1 }

    const where = { creatorId }
    if (options.formId) {
      where.formId = options.formId
    }
    if (options.formType && options.formType !== 'all') {
      where.formType = options.formType.toLowerCase()
    }
    if (options.isRead !== undefined && options.isRead !== null && options.isRead !== '') {
      where.isRead = String(options.isRead) === 'true'
    }
    if (options.status) {
      where.status = options.status
    }

    if (options.search) {
      const q = String(options.search).trim()
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { message: { contains: q, mode: 'insensitive' } },
        ]
      }
    }

    const page = Math.max(1, parseInt(options.page || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(options.limit || '20', 10)))
    const skip = (page - 1) * limit

    const [total, items, unreadCount] = await Promise.all([
      prisma.formSubmission.count({ where }),
      prisma.formSubmission.findMany({
        where,
        include: {
          form: {
            select: { id: true, title: true, formType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.formSubmission.count({
        where: { creatorId, isRead: false },
      }),
    ])

    return {
      items: items.map((sub) => ({
        id: sub.id,
        formId: sub.formId,
        formTitle: sub.form?.title || 'Form',
        formType: sub.formType,
        name: sub.name,
        email: sub.email,
        message: sub.message,
        rating: sub.rating,
        isRead: sub.isRead,
        status: sub.status,
        answers: sub.answers && typeof sub.answers === 'object' ? sub.answers : {},
        metadata: sub.metadata && typeof sub.metadata === 'object' ? sub.metadata : {},
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    }
  },

  async getSubmission(id, creatorId) {
    if (!id || !creatorId) return null
    const sub = await prisma.formSubmission.findFirst({
      where: { id, creatorId },
      include: {
        form: true,
      },
    })
    if (!sub) return null
    return {
      id: sub.id,
      formId: sub.formId,
      formTitle: sub.form?.title || 'Form',
      formType: sub.formType,
      name: sub.name,
      email: sub.email,
      message: sub.message,
      rating: sub.rating,
      isRead: sub.isRead,
      status: sub.status,
      answers: sub.answers && typeof sub.answers === 'object' ? sub.answers : {},
      metadata: sub.metadata && typeof sub.metadata === 'object' ? sub.metadata : {},
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      form: sub.form || null,
    }
  },

  async markSubmissionRead(id, creatorId, isRead = true) {
    if (!id || !creatorId) return { success: false }
    const result = await prisma.formSubmission.updateMany({
      where: { id, creatorId },
      data: { isRead: Boolean(isRead), updatedAt: new Date() },
    })
    return { success: result.count > 0 }
  },

  async updateSubmission(id, creatorId, data) {
    if (!id || !creatorId) throw new Error('Submission ID and creatorId required')
    const existing = await prisma.formSubmission.findFirst({
      where: { id, creatorId },
    })
    if (!existing) throw new Error('Submission not found')

    const updateData = { updatedAt: new Date() }
    if (data.isRead !== undefined) updateData.isRead = Boolean(data.isRead)
    if (data.status !== undefined) updateData.status = data.status

    const updated = await prisma.formSubmission.update({
      where: { id },
      data: updateData,
    })
    return updated
  },

  async markAllSubmissionsRead(creatorId, formId = null) {
    if (!creatorId) return { updatedCount: 0 }
    const where = { creatorId, isRead: false }
    if (formId) {
      where.formId = formId
    }
    const result = await prisma.formSubmission.updateMany({
      where,
      data: { isRead: true, updatedAt: new Date() },
    })
    return { updatedCount: result.count }
  },

  async deleteSubmission(id, creatorId) {
    if (!id || !creatorId) return { success: false }
    const result = await prisma.formSubmission.deleteMany({
      where: { id, creatorId },
    })
    return { success: result.count > 0 }
  },

  async createSubmission(data) {
    if (!data.creatorId) throw new Error('creatorId is required for submission')
    const id = data.id || cryptoId()
    const formType = (data.formType || 'contact').toLowerCase()

    const created = await prisma.formSubmission.create({
      data: {
        id,
        formId: data.formId || null,
        creatorId: data.creatorId,
        formType,
        name: data.name ? String(data.name).trim() : null,
        email: data.email ? String(data.email).trim() : null,
        message: data.message ? String(data.message).trim() : null,
        rating: data.rating !== undefined && data.rating !== null ? parseInt(data.rating, 10) : null,
        isRead: false,
        status: data.status || 'ACTIVE',
        answers: data.answers && typeof data.answers === 'object' ? data.answers : {},
        metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
      },
    })
    return created
  },

  async upsertSubscriber(data) {
    if (!data.creatorId || !data.email) throw new Error('creatorId and email required')
    const email = String(data.email).toLowerCase().trim()
    const name = data.name ? String(data.name).trim() : null
    const formId = data.formId || null
    const consentGiven = data.consentGiven !== undefined ? Boolean(data.consentGiven) : true
    const consentText = data.consentText ? String(data.consentText).trim() : 'Subscribed via storefront newsletter form'
    const source = data.source || 'storefront_form'
    const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}

    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: {
        creatorId_email: {
          creatorId: data.creatorId,
          email,
        },
      },
      update: {
        status: 'SUBSCRIBED',
        ...(name ? { name } : {}),
        ...(formId ? { formId } : {}),
        consentGiven,
        consentText,
        consentTimestamp: new Date(),
        updatedAt: new Date(),
      },
      create: {
        id: data.id || cryptoId(),
        creatorId: data.creatorId,
        formId,
        email,
        name,
        status: 'SUBSCRIBED',
        consentGiven,
        consentText,
        consentTimestamp: new Date(),
        source,
        metadata,
      },
    })
    return subscriber
  },

  async listSubscribers(creatorId, options = {}) {
    if (!creatorId) return { items: [], total: 0, page: 1, totalPages: 1 }

    const where = { creatorId }
    if (options.status) {
      where.status = options.status
    }
    if (options.search) {
      const q = String(options.search).trim()
      if (q) {
        where.OR = [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ]
      }
    }

    const page = Math.max(1, parseInt(options.page || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(options.limit || '20', 10)))
    const skip = (page - 1) * limit

    const [total, items] = await Promise.all([
      prisma.newsletterSubscriber.count({ where }),
      prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    }
  },

  async updateSubscriberStatus(id, creatorId, status) {
    if (!id || !creatorId) throw new Error('ID and creatorId required')
    const result = await prisma.newsletterSubscriber.updateMany({
      where: { id, creatorId },
      data: { status, updatedAt: new Date() },
    })
    return { success: result.count > 0 }
  },

  async unsubscribeNewsletter(creatorId, email) {
    if (!creatorId || !email) throw new Error('creatorId and email required')
    const normalizedEmail = String(email).toLowerCase().trim()
    const result = await prisma.newsletterSubscriber.updateMany({
      where: { creatorId, email: normalizedEmail },
      data: { status: 'UNSUBSCRIBED', updatedAt: new Date() },
    })
    return { success: result.count > 0 }
  },

  async getUnreadSubmissionsCount(creatorId) {
    if (!creatorId) return 0
    return prisma.formSubmission.count({
      where: { creatorId, isRead: false },
    })
  },

  async getFormsStats(creatorId) {
    if (!creatorId) return { totalForms: 0, totalSubmissions: 0, unreadSubmissions: 0, totalSubscribers: 0 }
    const [totalForms, totalSubmissions, unreadSubmissions, totalSubscribers] = await Promise.all([
      prisma.form.count({ where: { creatorId } }),
      prisma.formSubmission.count({ where: { creatorId } }),
      prisma.formSubmission.count({ where: { creatorId, isRead: false } }),
      prisma.newsletterSubscriber.count({ where: { creatorId, status: 'SUBSCRIBED' } }),
    ])
    return { totalForms, totalSubmissions, unreadSubmissions, totalSubscribers }
  },
}

// ------------------------------------------------------------------------------
// Auto-DM Queue & Per-Account Rate Limiting Repositories
// ------------------------------------------------------------------------------

export const autoDmQueueRepo = {
  async enqueueJob({
    creatorId,
    instagramAccountId,
    automationId,
    dedupeKey,
    triggerType = 'COMMENT',
    commentId,
    mediaId,
    recipientId,
    recipientUsername,
    message,
    quickReplies = [],
    commentReply = null,
    destinationUrl = null,
    buttonText = null,
    maxAttempts = 5,
    scheduledAt = null,
    isSimulation = false,
  }) {
    if (!creatorId || !dedupeKey || !message) {
      throw new Error('creatorId, dedupeKey, and message are required for Auto-DM queue job')
    }

    try {
      // 1. Idempotency Check: look up existing job with this deduplication key
      const existing = await prisma.autoDmQueueJob.findUnique({
        where: { dedupeKey },
      })

      if (existing) {
        return {
          enqueued: false,
          duplicate: true,
          job: clean(existing),
        }
      }

      // 2. Insert new queue job
      const now = new Date()
      const jobScheduledAt = scheduledAt ? new Date(scheduledAt) : now

      const job = await prisma.autoDmQueueJob.create({
        data: {
          creatorId,
          instagramAccountId: instagramAccountId || null,
          automationId: automationId || null,
          dedupeKey,
          triggerType,
          commentId: commentId || null,
          mediaId: mediaId || null,
          recipientId: recipientId || null,
          recipientUsername: recipientUsername || null,
          message,
          quickReplies: Array.isArray(quickReplies) ? quickReplies : [],
          commentReply: commentReply || null,
          destinationUrl: destinationUrl || null,
          buttonText: buttonText || null,
          status: 'PENDING',
          attemptCount: 0,
          maxAttempts: maxAttempts || 5,
          scheduledAt: jobScheduledAt,
          nextAttemptAt: jobScheduledAt,
          isSimulation: Boolean(isSimulation),
        },
      })

      return {
        enqueued: true,
        duplicate: false,
        job: clean(job),
      }
    } catch (err) {
      // Catch unique constraint race conditions
      if (err.code === 'P2002' || String(err.message).includes('Unique constraint')) {
        const doubleCheck = await prisma.autoDmQueueJob.findUnique({
          where: { dedupeKey },
        })
        if (doubleCheck) {
          return {
            enqueued: false,
            duplicate: true,
            job: clean(doubleCheck),
          }
        }
      }
      console.error('autoDmQueueRepo.enqueueJob error:', err)
      throw err
    }
  },

  async claimNextJob(workerId = 'worker-default', { lockDurationSeconds = 60, isSimulation = null } = {}) {
    try {
      const now = new Date()
      const lockExpiresAt = new Date(now.getTime() + lockDurationSeconds * 1000)

      // Use PostgreSQL atomic row locking FOR UPDATE SKIP LOCKED
      const claimed = await prisma.$transaction(async (tx) => {
        let candidateId = null

        try {
          let eligibleJobs
          if (isSimulation === true) {
            eligibleJobs = await tx.$queryRaw`
              SELECT id FROM "auto_dm_queue_jobs"
              WHERE status IN ('PENDING', 'RETRYING')
                AND is_simulation = true
                AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
                AND (locked_at IS NULL OR lock_expires_at <= ${now})
              ORDER BY scheduled_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED;
            `
          } else if (isSimulation === false) {
            eligibleJobs = await tx.$queryRaw`
              SELECT id FROM "auto_dm_queue_jobs"
              WHERE status IN ('PENDING', 'RETRYING')
                AND is_simulation = false
                AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
                AND (locked_at IS NULL OR lock_expires_at <= ${now})
              ORDER BY scheduled_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED;
            `
          } else {
            eligibleJobs = await tx.$queryRaw`
              SELECT id FROM "auto_dm_queue_jobs"
              WHERE status IN ('PENDING', 'RETRYING')
                AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
                AND (locked_at IS NULL OR lock_expires_at <= ${now})
              ORDER BY scheduled_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED;
            `
          }
          if (eligibleJobs && eligibleJobs.length > 0) {
            candidateId = eligibleJobs[0].id
          }
        } catch (rawErr) {
          // Fallback if raw query is unsupported (e.g., in offline test harnesses)
          const fallback = await tx.autoDmQueueJob.findFirst({
            where: {
              status: { in: ['PENDING', 'RETRYING'] },
              ...(isSimulation !== null ? { isSimulation: Boolean(isSimulation) } : {}),
              OR: [
                { nextAttemptAt: null },
                { nextAttemptAt: { lte: now } },
              ],
              AND: [
                {
                  OR: [
                    { lockedAt: null },
                    { lockExpiresAt: { lte: now } },
                  ],
                },
              ],
            },
            orderBy: { scheduledAt: 'asc' },
          })
          if (fallback) candidateId = fallback.id
        }

        if (!candidateId) return null

        const updated = await tx.autoDmQueueJob.update({
          where: { id: candidateId },
          data: {
            status: 'PROCESSING',
            lockedAt: now,
            lockedBy: workerId,
            lockExpiresAt,
            attemptCount: { increment: 1 },
            updatedAt: now,
          },
          include: {
            automation: true,
            instagramAccount: true,
            creator: {
              include: {
                creatorSubscription: true,
                store: true,
                creatorProfile: true,
              },
            },
          },
        })

        return clean(updated)
      })

      return claimed
    } catch (err) {
      console.error('autoDmQueueRepo.claimNextJob error:', err)
      return null
    }
  },

  async markSent(jobId, { providerMessageId } = {}) {
    if (!jobId) return null
    const now = new Date()
    try {
      const job = await prisma.autoDmQueueJob.update({
        where: { id: jobId },
        data: {
          status: 'SENT',
          sentAt: now,
          providerMessageId: providerMessageId || null,
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          updatedAt: now,
        },
      })
      return clean(job)
    } catch (err) {
      console.error('autoDmQueueRepo.markSent error:', err)
      return null
    }
  },

  async markRetry(jobId, {
    errorCategory = 'TEMPORARY_ERROR',
    errorMessage = 'Temporary failure, retrying',
    errorDetails = {},
    nextAttemptAt = null,
    attemptCount = 1,
    maxAttempts = 5,
  } = {}) {
    if (!jobId) return null
    const now = new Date()

    if (attemptCount >= maxAttempts) {
      return this.markFailed(jobId, {
        errorCategory: errorCategory || 'EXHAUSTED_RETRIES',
        errorMessage: `${errorMessage} (Exhausted maximum ${maxAttempts} retry attempts)`,
        errorDetails: { ...errorDetails, attemptsExhausted: true },
      })
    }

    try {
      const job = await prisma.autoDmQueueJob.update({
        where: { id: jobId },
        data: {
          status: 'RETRYING',
          nextAttemptAt: nextAttemptAt || new Date(now.getTime() + 10000), // Default 10s backoff if not specified
          lastErrorCategory: errorCategory,
          lastErrorMessage: String(errorMessage).slice(0, 500),
          lastErrorDetails: errorDetails || {},
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          updatedAt: now,
        },
      })
      return clean(job)
    } catch (err) {
      console.error('autoDmQueueRepo.markRetry error:', err)
      return null
    }
  },

  async markFailed(jobId, {
    errorCategory = 'PERMANENT_ERROR',
    errorMessage = 'Permanent failure',
    errorDetails = {},
  } = {}) {
    if (!jobId) return null
    const now = new Date()
    try {
      const job = await prisma.autoDmQueueJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          failedAt: now,
          lastErrorCategory: errorCategory,
          lastErrorMessage: String(errorMessage).slice(0, 500),
          lastErrorDetails: errorDetails || {},
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          updatedAt: now,
        },
      })
      return clean(job)
    } catch (err) {
      console.error('autoDmQueueRepo.markFailed error:', err)
      return null
    }
  },

  async cancelJob(jobId, creatorId) {
    if (!jobId || !creatorId) return { success: false, reason: 'Invalid parameters' }
    try {
      const job = await prisma.autoDmQueueJob.findFirst({
        where: { id: jobId, creatorId },
      })
      if (!job) {
        return { success: false, reason: 'Queue job not found or unauthorized' }
      }

      if (job.status === 'SENT') {
        return { success: false, reason: 'Cannot cancel an already sent message' }
      }
      if (job.status === 'PROCESSING') {
        return { success: false, reason: 'Job is currently processing and cannot be safely recalled' }
      }

      const updated = await prisma.autoDmQueueJob.update({
        where: { id: jobId },
        data: {
          status: 'CANCELLED',
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          updatedAt: new Date(),
        },
      })
      return { success: true, job: clean(updated) }
    } catch (err) {
      console.error('autoDmQueueRepo.cancelJob error:', err)
      return { success: false, reason: err.message }
    }
  },

  async retryJob(jobId, creatorId) {
    if (!jobId || !creatorId) return { success: false, reason: 'Invalid parameters' }
    try {
      const job = await prisma.autoDmQueueJob.findFirst({
        where: { id: jobId, creatorId },
      })
      if (!job) {
        return { success: false, reason: 'Queue job not found or unauthorized' }
      }

      if (job.status !== 'FAILED' && job.status !== 'CANCELLED') {
        return { success: false, reason: 'Only failed or cancelled jobs can be manually retried' }
      }

      const now = new Date()
      const updated = await prisma.autoDmQueueJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          nextAttemptAt: now,
          attemptCount: 0,
          lastErrorCategory: null,
          lastErrorMessage: null,
          lastErrorDetails: null,
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          updatedAt: now,
        },
      })
      return { success: true, job: clean(updated) }
    } catch (err) {
      console.error('autoDmQueueRepo.retryJob error:', err)
      return { success: false, reason: err.message }
    }
  },

  async listJobsForCreator(creatorId, { status = null, isSimulation = false, limit = 50, offset = 0 } = {}) {
    if (!creatorId) return { items: [], total: 0 }
    try {
      const where = {
        creatorId,
        ...(isSimulation !== null ? { isSimulation: Boolean(isSimulation) } : {}),
        ...(status && status !== 'ALL' ? { status } : {}),
      }

      const [items, total] = await Promise.all([
        prisma.autoDmQueueJob.findMany({
          where,
          include: {
            automation: {
              select: { id: true, name: true, triggerValue: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: Math.min(Number(limit) || 50, 100),
          skip: Number(offset) || 0,
        }),
        prisma.autoDmQueueJob.count({ where }),
      ])

      // Sanitize fields: never expose internal tokens or sensitive data
      const sanitized = items.map((j) => {
        const c = clean(j)
        return {
          id: c.id,
          status: c.status,
          automationId: c.automationId,
          automationName: c.automation?.name || 'Automation',
          triggerType: c.triggerType,
          commentId: c.commentId,
          recipientUsername: c.recipientUsername || 'Instagram User',
          message: c.message,
          buttonText: c.buttonText,
          destinationUrl: c.destinationUrl,
          commentReply: c.commentReply,
          attemptCount: c.attemptCount,
          maxAttempts: c.maxAttempts,
          scheduledAt: c.scheduledAt,
          nextAttemptAt: c.nextAttemptAt,
          sentAt: c.sentAt,
          failedAt: c.failedAt,
          lastErrorCategory: c.lastErrorCategory,
          lastErrorMessage: c.lastErrorMessage,
          createdAt: c.createdAt,
        }
      })

      return { items: sanitized, total }
    } catch (err) {
      console.error('autoDmQueueRepo.listJobsForCreator error:', err)
      return { items: [], total: 0 }
    }
  },

  async getStatsForCreator(creatorId, { isSimulation = false } = {}) {
    if (!creatorId) {
      return {
        pending: 0,
        processing: 0,
        retrying: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
        oldestPendingAgeSec: 0,
      }
    }

    try {
      const whereBase = {
        creatorId,
        ...(isSimulation !== null ? { isSimulation: Boolean(isSimulation) } : {}),
      }

      const [pending, processing, retrying, sent, failed, cancelled, oldestPending] = await Promise.all([
        prisma.autoDmQueueJob.count({ where: { ...whereBase, status: 'PENDING' } }),
        prisma.autoDmQueueJob.count({ where: { ...whereBase, status: 'PROCESSING' } }),
        prisma.autoDmQueueJob.count({ where: { ...whereBase, status: 'RETRYING' } }),
        prisma.autoDmQueueJob.count({ where: { ...whereBase, status: 'SENT' } }),
        prisma.autoDmQueueJob.count({ where: { ...whereBase, status: 'FAILED' } }),
        prisma.autoDmQueueJob.count({ where: { ...whereBase, status: 'CANCELLED' } }),
        prisma.autoDmQueueJob.findFirst({
          where: { ...whereBase, status: 'PENDING' },
          orderBy: { scheduledAt: 'asc' },
          select: { scheduledAt: true },
        }),
      ])

      const oldestPendingAgeSec = oldestPending?.scheduledAt
        ? Math.max(0, Math.floor((Date.now() - new Date(oldestPending.scheduledAt).getTime()) / 1000))
        : 0

      return {
        pending,
        processing,
        retrying,
        sent,
        failed,
        cancelled,
        total: pending + processing + retrying + sent + failed + cancelled,
        oldestPendingAgeSec,
      }
    } catch (err) {
      console.error('autoDmQueueRepo.getStatsForCreator error:', err)
      return {
        pending: 0,
        processing: 0,
        retrying: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
        oldestPendingAgeSec: 0,
      }
    }
  },

  async getJobById(jobId, creatorId) {
    if (!jobId || !creatorId) return null
    try {
      const job = await prisma.autoDmQueueJob.findFirst({
        where: { id: jobId, creatorId },
        include: { automation: true },
      })
      return clean(job)
    } catch (err) {
      console.error('autoDmQueueRepo.getJobById error:', err)
      return null
    }
  },

  async recoverStuckJobs(olderThanSeconds = 120) {
    const threshold = new Date(Date.now() - olderThanSeconds * 1000)
    try {
      const stuckJobs = await prisma.autoDmQueueJob.findMany({
        where: {
          status: 'PROCESSING',
          OR: [
            { lockExpiresAt: { lte: new Date() } },
            { lockedAt: { lte: threshold } },
          ],
        },
      })

      let recovered = 0
      for (const job of stuckJobs) {
        if (job.attemptCount >= job.maxAttempts) {
          await this.markFailed(job.id, {
            errorCategory: 'WORKER_TIMEOUT_EXHAUSTED',
            errorMessage: 'Worker lease timed out and attempt limit reached.',
          })
        } else {
          await prisma.autoDmQueueJob.update({
            where: { id: job.id },
            data: {
              status: 'RETRYING',
              nextAttemptAt: new Date(),
              lastErrorCategory: 'WORKER_RECOVERED',
              lastErrorMessage: 'Recovered after worker interruption/lease timeout.',
              lockedAt: null,
              lockedBy: null,
              lockExpiresAt: null,
              updatedAt: new Date(),
            },
          })
        }
        recovered++
      }

      if (recovered > 0) {
        console.log(`[AUTO_DM_QUEUE] Recovered ${recovered} abandoned/stuck jobs.`)
      }
      return recovered
    } catch (err) {
      console.error('autoDmQueueRepo.recoverStuckJobs error:', err)
      return 0
    }
  },
}

export const autoDmRateLimitsRepo = {
  async getOrInit(instagramAccountId, creatorId) {
    if (!instagramAccountId) return null
    try {
      let limit = await prisma.autoDmRateLimit.findUnique({
        where: { instagramAccountId },
      })
      if (!limit && creatorId) {
        limit = await prisma.autoDmRateLimit.create({
          data: {
            instagramAccountId,
            creatorId,
            minIntervalMs: 3000,
            maxPerHour: 200,
            maxPerMinute: 20,
            hourlyCount: 0,
            minuteCount: 0,
            isPaused: false,
          },
        })
      }
      return clean(limit)
    } catch (err) {
      console.error('autoDmRateLimitsRepo.getOrInit error:', err)
      return null
    }
  },

  /**
   * Atomically checks and acquires a dispatch slot for an Instagram account.
   * Uses PostgreSQL row-level locking (FOR UPDATE) to prevent distributed race conditions
   * where multiple workers evaluate rate limits simultaneously.
   *
   * The slot is committed BEFORE the external API call, ensuring that in-flight requests
   * conservatively count toward provider limits even if they fail.
   */
  async acquireDispatchSlot(instagramAccountId, creatorId = null) {
    if (!instagramAccountId) return { allowed: false, reason: 'MISSING_ACCOUNT' }

    try {
      await this.getOrInit(instagramAccountId, creatorId)

      return await prisma.$transaction(async (tx) => {
        let record = null
        try {
          const rows = await tx.$queryRaw`
            SELECT * FROM "auto_dm_rate_limits"
            WHERE "instagram_account_id" = ${instagramAccountId}::uuid
            FOR UPDATE;
          `
          if (rows && rows.length > 0) {
            record = rows[0]
          }
        } catch (rawErr) {
          // Fallback if raw query is not supported in offline mock environment
        }

        if (!record) {
          record = await tx.autoDmRateLimit.findUnique({
            where: { instagramAccountId },
          })
          if (!record) return { allowed: true }
        }

        const now = new Date()
        const nowMs = now.getTime()

        // 1. Check if paused
        const isPaused = record.is_paused ?? record.isPaused
        if (isPaused) {
          const pausedUntil = record.paused_until ?? record.pausedUntil
          if (pausedUntil && new Date(pausedUntil) <= now) {
            await tx.autoDmRateLimit.update({
              where: { id: record.id },
              data: {
                isPaused: false,
                pausedUntil: null,
                pauseReason: null,
                updatedAt: now,
              },
            })
          } else {
            const remainingSec = pausedUntil
              ? Math.ceil((new Date(pausedUntil).getTime() - nowMs) / 1000)
              : 900
            return {
              allowed: false,
              reason: 'PAUSED',
              pauseReason: record.pause_reason ?? record.pauseReason ?? 'Throttled by Meta',
              remainingSeconds: remainingSec,
            }
          }
        }

        // 2. Minimum interval pacing (e.g. 3000ms safety margin per account)
        const minIntervalMs = record.min_interval_ms ?? record.minIntervalMs ?? 3000
        const lastSentAt = record.last_sent_at ?? record.lastSentAt
        if (lastSentAt) {
          const elapsedSinceLastSend = nowMs - new Date(lastSentAt).getTime()
          if (elapsedSinceLastSend < minIntervalMs) {
            const waitMs = minIntervalMs - elapsedSinceLastSend
            return {
              allowed: false,
              reason: 'INTERVAL_PACING',
              waitMs,
            }
          }
        }

        // 3. Minute Rolling / Tumbling Window (default max 20 / minute)
        const maxPerMinute = record.max_per_minute ?? record.maxPerMinute ?? 20
        const minuteStart = record.minute_start ?? record.minuteStart
        const minuteStartMs = minuteStart ? new Date(minuteStart).getTime() : 0
        const minuteCount = record.minute_count ?? record.minuteCount ?? 0
        const resetMinute = nowMs - minuteStartMs >= 60000

        if (!resetMinute && minuteCount >= maxPerMinute) {
          const waitMs = 60000 - (nowMs - minuteStartMs)
          return {
            allowed: false,
            reason: 'MINUTE_LIMIT',
            waitMs,
          }
        }

        // 4. Hourly Window (default max 200 / hour)
        const maxPerHour = record.max_per_hour ?? record.maxPerHour ?? 200
        const hourlyStart = record.hourly_start ?? record.hourlyStart
        const hourlyStartMs = hourlyStart ? new Date(hourlyStart).getTime() : 0
        const hourlyCount = record.hourly_count ?? record.hourlyCount ?? 0
        const resetHourly = nowMs - hourlyStartMs >= 3600000

        if (!resetHourly && hourlyCount >= maxPerHour) {
          const waitMs = 3600000 - (nowMs - hourlyStartMs)
          return {
            allowed: false,
            reason: 'HOURLY_LIMIT',
            waitMs,
          }
        }

        // 5. ATOMIC DISPATCH-SLOT RESERVATION
        // Atomically commit the reservation prior to dispatch
        await tx.autoDmRateLimit.update({
          where: { id: record.id },
          data: {
            lastSentAt: now,
            minuteStart: resetMinute ? now : (minuteStart ? new Date(minuteStart) : now),
            minuteCount: resetMinute ? 1 : { increment: 1 },
            hourlyStart: resetHourly ? now : (hourlyStart ? new Date(hourlyStart) : now),
            hourlyCount: resetHourly ? 1 : { increment: 1 },
            updatedAt: now,
          },
        })

        return {
          allowed: true,
          reservedAt: now,
          minIntervalMs,
        }
      })
    } catch (err) {
      console.error('autoDmRateLimitsRepo.acquireDispatchSlot error:', err)
      return this.canSend(instagramAccountId, creatorId)
    }
  },

  async canSend(instagramAccountId, creatorId = null) {
    if (!instagramAccountId) return { allowed: false, reason: 'MISSING_ACCOUNT' }
    try {
      const record = await this.getOrInit(instagramAccountId, creatorId)
      if (!record) return { allowed: true } // If no record yet, allow send

      const now = new Date()
      const nowMs = now.getTime()

      // 1. Check if paused
      if (record.isPaused) {
        if (record.pausedUntil && new Date(record.pausedUntil) <= now) {
          // Automatic pause window expiration: resume account
          await prisma.autoDmRateLimit.update({
            where: { id: record.id },
            data: {
              isPaused: false,
              pausedUntil: null,
              pauseReason: null,
              updatedAt: now,
            },
          })
        } else {
          const remainingSec = record.pausedUntil
            ? Math.ceil((new Date(record.pausedUntil).getTime() - nowMs) / 1000)
            : 900
          return {
            allowed: false,
            reason: 'PAUSED',
            pauseReason: record.pauseReason || 'Throttled by Meta',
            remainingSeconds: remainingSec,
          }
        }
      }

      // 2. Minimum interval pacing (3000ms safety interval per account)
      const minIntervalMs = record.minIntervalMs || 3000
      if (record.lastSentAt) {
        const elapsedSinceLastSend = nowMs - new Date(record.lastSentAt).getTime()
        if (elapsedSinceLastSend < minIntervalMs) {
          const waitMs = minIntervalMs - elapsedSinceLastSend
          return {
            allowed: false,
            reason: 'INTERVAL_PACING',
            waitMs,
          }
        }
      }

      // 3. Minute Rolling / Tumbling Window (default max 20 / minute)
      const maxPerMinute = record.maxPerMinute || 20
      const minuteStartMs = record.minuteStart ? new Date(record.minuteStart).getTime() : 0
      if (nowMs - minuteStartMs < 60000) {
        if (record.minuteCount >= maxPerMinute) {
          const waitMs = 60000 - (nowMs - minuteStartMs)
          return {
            allowed: false,
            reason: 'MINUTE_LIMIT',
            waitMs,
          }
        }
      }

      // 4. Hourly Window (default max 200 / hour)
      const maxPerHour = record.maxPerHour || 200
      const hourlyStartMs = record.hourlyStart ? new Date(record.hourlyStart).getTime() : 0
      if (nowMs - hourlyStartMs < 3600000) {
        if (record.hourlyCount >= maxPerHour) {
          const waitMs = 3600000 - (nowMs - hourlyStartMs)
          return {
            allowed: false,
            reason: 'HOURLY_LIMIT',
            waitMs,
          }
        }
      }

      return { allowed: true }
    } catch (err) {
      console.error('autoDmRateLimitsRepo.canSend error:', err)
      return { allowed: true } // Graceful degradation
    }
  },

  async recordSend(instagramAccountId, creatorId = null) {
    if (!instagramAccountId) return null
    const now = new Date()
    const nowMs = now.getTime()

    try {
      const record = await this.getOrInit(instagramAccountId, creatorId)
      if (!record) return null

      const minuteStartMs = record.minuteStart ? new Date(record.minuteStart).getTime() : 0
      const resetMinute = nowMs - minuteStartMs >= 60000

      const hourlyStartMs = record.hourlyStart ? new Date(record.hourlyStart).getTime() : 0
      const resetHourly = nowMs - hourlyStartMs >= 3600000

      const updated = await prisma.autoDmRateLimit.update({
        where: { id: record.id },
        data: {
          lastSentAt: now,
          minuteStart: resetMinute ? now : record.minuteStart,
          minuteCount: resetMinute ? 1 : { increment: 1 },
          hourlyStart: resetHourly ? now : record.hourlyStart,
          hourlyCount: resetHourly ? 1 : { increment: 1 },
          updatedAt: now,
        },
      })
      return clean(updated)
    } catch (err) {
      console.error('autoDmRateLimitsRepo.recordSend error:', err)
      return null
    }
  },

  async pauseAccount(instagramAccountId, { pauseMinutes = 15, reason = 'THROTTLED_BY_META', creatorId = null } = {}) {
    if (!instagramAccountId) return null
    const now = new Date()
    const pausedUntil = new Date(now.getTime() + pauseMinutes * 60 * 1000)

    try {
      const existing = await prisma.autoDmRateLimit.findUnique({ where: { instagramAccountId } })
      let record
      if (existing) {
        record = await prisma.autoDmRateLimit.update({
          where: { instagramAccountId },
          data: {
            isPaused: true,
            pauseReason: reason,
            pausedUntil,
            updatedAt: now,
          },
        })
      } else {
        const resolvedCreatorId = creatorId || (await instagramRepo.getByPlatformUserId(instagramAccountId))?.creatorId || uuidv4()
        record = await prisma.autoDmRateLimit.create({
          data: {
            id: uuidv4(),
            instagramAccountId,
            creatorId: resolvedCreatorId,
            isPaused: true,
            pauseReason: reason,
            pausedUntil,
            minIntervalMs: 3000,
            maxPerHour: 200,
            maxPerMinute: 20,
          },
        })
      }
      console.warn(`[AUTO_DM_RATE_LIMITER] Account ${instagramAccountId} PAUSED for ${pauseMinutes}m. Reason: ${reason}`)
      return clean(record)
    } catch (err) {
      console.error('autoDmRateLimitsRepo.pauseAccount error:', err)
      return null
    }
  },

  async resumeAccount(instagramAccountId, creatorId) {
    if (!instagramAccountId) return { success: false, reason: 'Missing account ID' }
    try {
      const record = await prisma.autoDmRateLimit.findFirst({
        where: {
          instagramAccountId,
          ...(creatorId ? { creatorId } : {}),
        },
      })
      if (!record) {
        return { success: false, reason: 'Rate limit profile not found or unauthorized' }
      }

      const updated = await prisma.autoDmRateLimit.update({
        where: { id: record.id },
        data: {
          isPaused: false,
          pausedUntil: null,
          pauseReason: null,
          updatedAt: new Date(),
        },
      })
      return { success: true, record: clean(updated) }
    } catch (err) {
      console.error('autoDmRateLimitsRepo.resumeAccount error:', err)
      return { success: false, reason: err.message }
    }
  },

  async getStatus(instagramAccountId, creatorId) {
    if (!instagramAccountId) return null
    try {
      const record = await prisma.autoDmRateLimit.findFirst({
        where: {
          instagramAccountId,
          ...(creatorId ? { creatorId } : {}),
        },
      })
      return clean(record)
    } catch (err) {
      console.error('autoDmRateLimitsRepo.getStatus error:', err)
      return null
    }
  },
}
