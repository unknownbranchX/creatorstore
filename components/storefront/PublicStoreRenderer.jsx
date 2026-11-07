'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Instagram, Youtube, Twitter, Linkedin, Facebook, Globe, Music2,
  ArrowRight, Lock, Star, Sparkles, FileText, CheckCircle2, Package,
  Link2, Layers, ExternalLink, User, Video, Calendar, MoreVertical,
  Camera, Play
} from 'lucide-react'
import { formatMoney } from '@/lib/clientApi'
import { getThemeTokens } from '@/lib/themePresets'
import { patternPreviewStyle } from '@/lib/storefront-themes'
import { getThemeArtwork } from '@/lib/storefront-theme-artwork'
import { ensureGoogleFonts } from '@/lib/storefrontFonts'
import {
  getPagePillStyles,
  isLightColor,
  getAccessibleTextColor,
  getAccessibleMutedTextColor,
  getProductCtaStyles,
} from '@/lib/colorContrast'
import StorefrontFormCard from '@/components/storefront/StorefrontFormCard'
import StorefrontMediaCard from '@/components/storefront/StorefrontMediaCard'
import ImmersiveHeroHeader from '@/components/storefront/ImmersiveHeroHeader'
import { useImageContrastTheme } from '@/lib/imageContrast'
import {
  normalizeSectionLayout,
  leadingMedia,
  buttonRadiusCss,
  buttonShadowCss,
  buttonFaceStyle,
  getStorefrontTileStyle,
  storefrontTileRadiusCss,
  storefrontCardRadiusCss,
} from '@/lib/storefrontLayout'
import ClassicLinkPill from '@/components/storefront/ClassicLinkPill'
import { CreatorStoreMark, CreatorStoreLogoIcon } from '@/components/brand/CreatorStoreBrand'
import ProductPurchaseModalFlow from '@/components/storefront/ProductPurchaseModalFlow'
import PublicBookingModal from '@/components/storefront/PublicBookingModal'
import GalleryWizardModal from '@/components/storefront/GalleryWizardModal'
import { getSocialPlatform, resolveSocialStyle } from '@/lib/socialPlatforms'

export const SOCIAL_ICONS = {
  instagram: Instagram,
  youtube: Youtube,
  x: Twitter,
  twitter: Twitter,
  tiktok: Music2,
  linkedin: Linkedin,
  facebook: Facebook,
  website: Globe,
}

export function WallpaperBackdrop({ wallpaper, colors }) {
  const type = wallpaper.bgType || 'solid'
  const fill = colors.background || '#000000'

  let base = fill
  if (type === 'gradient') {
    const dir = wallpaper.gradientDirection || 'to bottom'
    const stops = wallpaper.gradientStops
    base = stops?.length >= 2
      ? `linear-gradient(${dir}, ${stops.join(', ')})`
      : `linear-gradient(${dir}, ${wallpaper.gradientStart || fill}, ${wallpaper.gradientEnd || '#121212'})`
  }

  const patternStyle = type === 'pattern'
    ? patternPreviewStyle(wallpaper.pattern || 'grid', fill)
    : null

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0" style={{ background: base }} />

      {type === 'blur' && (
        <>
          <div className="absolute -top-1/4 -left-1/4 h-[80%] w-[80%] rounded-full opacity-70" style={{ background: fill, filter: 'blur(80px)' }} />
          <div className="absolute -bottom-1/4 -right-1/4 h-[70%] w-[70%] rounded-full opacity-60" style={{ background: colors.buttonColor || fill, filter: 'blur(80px)' }} />
        </>
      )}

      {patternStyle && <div className="absolute inset-0" style={patternStyle} />}

      {wallpaper.overlay === 'spotlight' && (
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% -10%, rgba(232,160,80,0.45) 0%, transparent 58%)' }}
        />
      )}

      {wallpaper.accent === 'tide' && (
        <div
          className="absolute -top-10 right-[-20%] h-48 w-48 rounded-full opacity-70"
          style={{ background: 'var(--primary)', filter: 'blur(40px)' }}
        />
      )}

      {type === 'image' && wallpaper.backgroundImage && (
        <>
          <img
            src={wallpaper.backgroundImage}
            alt=""
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: wallpaper.backgroundFit || 'cover',
              objectPosition: wallpaper.backgroundPosition || 'center',
            }}
          />
          <div className="absolute inset-0 bg-black" style={{ opacity: wallpaper.backgroundOverlay !== undefined ? wallpaper.backgroundOverlay : 0.4 }} />
        </>
      )}

      {type === 'video' && wallpaper.backgroundVideo && (
        <video
          src={wallpaper.backgroundVideo}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      )}
    </div>
  )
}


/* ---------------- Reusable Product Thumbnail Component with Fallback ---------------- */
function ProductThumbnail({ thumbnail, title, type = 'DIGITAL', aspect = 'aspect-[2.1/1]', className = '', price = null, hasDiscount = false, discountPct = 0, theme = 'default' }) {
  const [imgError, setImgError] = useState(false)
  const showPlaceholder = !thumbnail || imgError
  const isCoaching = type === 'COACHING'

  if (showPlaceholder) {
    return (
      <div
        className={`${aspect} w-full overflow-hidden rounded-xl relative shrink-0 flex flex-col items-center justify-center p-3 transition-colors ${theme === 'luxury'
          ? 'bg-slate-900/90 border border-slate-800 text-[#D4AF37]/60'
          : theme === 'dark'
            ? 'bg-zinc-800/80 border border-zinc-700/80 text-zinc-400'
            : theme === 'editorial'
              ? 'bg-stone-100 border border-stone-200 text-stone-500'
              : theme === 'creator'
                ? 'bg-slate-900/80 border border-slate-800/80 text-white/50'
                : 'bg-slate-100/90 border border-slate-200/80 text-slate-500'
          } ${className}`}
      >
        {type === 'BUNDLE' ? (
          <>
            <Layers className="h-6 w-6 opacity-60 mb-0.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Bundle</span>
          </>
        ) : isCoaching ? (
          <>
            <Video className="h-6 w-6 opacity-60 mb-0.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">1:1 Session</span>
          </>
        ) : (
          <>
            <Package className="h-6 w-6 opacity-60 mb-0.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Product</span>
          </>
        )}
        {price !== null && Number(price) === 0 && (
          <span className="absolute top-2 left-2 bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs z-10">
            FREE
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`${aspect} w-full overflow-hidden rounded-xl relative shrink-0 ${className}`}>
      <img
        src={thumbnail}
        alt={title || 'Product'}
        onError={() => setImgError(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      {price !== null && Number(price) === 0 ? (
        <span className="absolute top-2 left-2 bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs z-10">
          FREE
        </span>
      ) : hasDiscount ? (
        <span className="absolute top-2 right-2 bg-emerald-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-xs z-10">
          {discountPct}% OFF
        </span>
      ) : null}
    </div>
  )
}

/* ---------------- Storefront Footer with CreatorStore Branding ---------------- */
export function StorefrontFooter({ editor = false, showBranding = true, tokens }) {
  if (showBranding === false) return null

  const bg = tokens?.contrast?.bg || tokens?.colors?.background || '#000000'
  const isLight = tokens?.contrast?.isLight ?? (bg ? isLightColor(bg) : false)
  const textColor = isLight ? '#0F172A' : '#FFFFFF'
  const mutedColor = isLight ? 'rgba(15, 23, 42, 0.68)' : 'rgba(255, 255, 255, 0.72)'
  const btnBg = isLight ? '#FFFFFF' : '#18181B'
  const btnBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.16)'

  return (
    <footer className="pt-10 pb-8 sm:pb-12 flex flex-col items-center justify-center gap-3.5 text-center shrink-0 w-full relative z-20">
      {/* CreatorStore Branded CTA Button */}
      <Link
        href="/signup"
        target={editor ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={editor ? (e) => e.preventDefault() : undefined}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all duration-200 shadow-sm text-xs font-semibold tracking-tight cursor-pointer group hover:scale-[1.02] active:scale-[0.98] border"
        style={{
          background: btnBg,
          borderColor: btnBorder,
          color: textColor,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
        aria-label="Get your own CreatorStore"
      >
        <CreatorStoreMark size="xs" color="brand" className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:rotate-12 duration-300" />
        <span>Get your own <span className="font-bold">CreatorStore</span></span>
      </Link>

      {/* Secondary Legal & Utility Navigation */}
      <nav aria-label="Storefront footer links" className="flex items-center justify-center gap-3.5 text-[11px] font-medium" style={{ color: mutedColor }}>
        <Link
          href="/terms"
          target={editor ? undefined : '_blank'}
          rel="noopener noreferrer"
          onClick={editor ? (e) => e.preventDefault() : undefined}
          className="hover:underline underline-offset-4 transition-opacity opacity-80 hover:opacity-100"
        >
          Terms
        </Link>
        <span className="opacity-30">·</span>
        <Link
          href="/privacy"
          target={editor ? undefined : '_blank'}
          rel="noopener noreferrer"
          onClick={editor ? (e) => e.preventDefault() : undefined}
          className="hover:underline underline-offset-4 transition-opacity opacity-80 hover:opacity-100"
        >
          Privacy
        </Link>
        <span className="opacity-30">·</span>
        <Link
          href="/contact"
          target={editor ? undefined : '_blank'}
          rel="noopener noreferrer"
          onClick={editor ? (e) => e.preventDefault() : undefined}
          className="hover:underline underline-offset-4 transition-opacity opacity-80 hover:opacity-100"
        >
          Report
        </Link>
      </nav>
    </footer>
  )
}

// PageSwitcherPills — Linktree-style segmented sliding pill toggle
function PageSwitcherPills({ pages, currentPageSlug, activePageId, editor = false, onSelectPage, tokens, onDirectionChange }) {
  if (!pages || pages.length <= 1) return null

  // Determine active page identifier
  let activePageObj = null
  if (activePageId !== undefined && activePageId !== null) {
    activePageObj = (activePageId === 'home')
      ? pages.find(p => p.isDefault || p.slug === 'home')
      : pages.find(p => p.id === activePageId || p.slug === activePageId)
  } else if (currentPageSlug) {
    activePageObj = (currentPageSlug === 'home')
      ? pages.find(p => p.isDefault || p.slug === 'home')
      : pages.find(p => p.slug === currentPageSlug || p.id === currentPageSlug)
  }
  if (!activePageObj && pages.length > 0) {
    activePageObj = pages.find(p => p.isDefault) || pages[0]
  }

  const activeKey = activePageObj?.id || activePageObj?.slug || 'home'
  const activeIdx = pages.findIndex(p => p.id === activeKey || p.slug === activeKey || (p.isDefault && activeKey === 'home'))
  const prevIdxRef = useRef(activeIdx >= 0 ? activeIdx : 0)

  const [indicator, setIndicator] = useState({ left: 4, width: 0, ready: false })
  const itemRefs = useRef({})
  const containerRef = useRef(null)

  const updateIndicator = useCallback(() => {
    const activeEl = itemRefs.current[activeKey]
    if (activeEl) {
      setIndicator({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        ready: true,
      })
    }
  }, [activeKey])

  useEffect(() => {
    updateIndicator()
    const timer = setTimeout(updateIndicator, 40)
    return () => clearTimeout(timer)
  }, [updateIndicator, pages])

  useEffect(() => {
    const handleResize = () => updateIndicator()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateIndicator])

  const handleSelect = (page, idx) => {
    const isPageHome = Boolean(page.isDefault || page.id === 'home' || page.slug === 'home')
    const currentIdx = prevIdxRef.current
    const dir = idx >= currentIdx ? 'right' : 'left'
    prevIdxRef.current = idx
    onDirectionChange?.(dir)

    if (editor) {
      onSelectPage?.(isPageHome ? null : page.id)
    } else {
      onSelectPage?.(isPageHome ? 'home' : (page.slug || page.id))
    }
  }

  const bgColor = tokens?.colors?.background || '#000000'
  const isLight = isLightColor(bgColor)

  return (
    <div className="flex justify-center w-full my-2 sm:my-3">
      <div
        ref={containerRef}
        className={`relative inline-flex items-center rounded-full p-1 max-w-full overflow-x-auto no-scrollbar shadow-xs transition-colors duration-200 ${
          isLight
            ? 'bg-[#8A8179]/90 text-white'
            : 'bg-white/15 text-white/90 border border-white/10'
        }`}
      >
        {/* Animated sliding active pill indicator */}
        <div
          className="absolute top-1 bottom-1 rounded-full bg-white border border-[#0052FF] shadow-sm pointer-events-none"
          style={{
            left: `${indicator.left}px`,
            width: `${indicator.width}px`,
            opacity: indicator.ready ? 1 : 0,
            transition: 'all 300ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
        />

        {pages.map((page, idx) => {
          const isPageHome = Boolean(page.isDefault || page.id === 'home' || page.slug === 'home')
          const isSelected = activePageObj
            ? (page.id === activePageObj.id || page.slug === activePageObj.slug || (isPageHome && (activePageObj.isDefault || activePageObj.slug === 'home' || activePageObj.id === 'home')))
            : isPageHome

          const pageKey = page.id || page.slug || 'home'

          return (
            <button
              key={pageKey}
              ref={(el) => {
                if (el) itemRefs.current[pageKey] = el
              }}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleSelect(page, idx)
              }}
              className={`relative z-10 shrink-0 inline-flex items-center justify-center px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-colors duration-200 whitespace-nowrap cursor-pointer select-none ${
                isSelected
                  ? 'text-[#1F1F1F] font-bold'
                  : 'text-white/85 font-medium hover:text-white'
              }`}
            >
              {page.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PublicStoreRenderer({
  store,
  profile,
  products = [],
  username,
  pages = [],
  currentPageSlug,
  activePageId,
  onSelectPage,
  editor = false,
  device = 'desktop',
  selectedId,
  onSelect,
  className = '',
  initialProduct = null,
  initialProductId = null,
  initialProductSlug = null,
}) {
  const resolvedUsername = username || store?.slug || store?.username || profile?.username
  const resolvedPages = pages.length > 0 ? pages : (Array.isArray(store?.pages) ? store.pages : [])

  const isImmersive = (store?.theme?.headerLayout || store?.theme?.header?.layout) === 'immersive'
  const heroAvatarUrl = store?.theme?.avatarUrl || profile?.avatarUrl || store?.avatarUrl || ''
  const contrastTheme = useImageContrastTheme(isImmersive ? heroAvatarUrl : null)

  const tokens = useMemo(() => {
    const baseTokens = getThemeTokens({
      ...(store?.theme || {}),
      avatarUrl: heroAvatarUrl,
    })
    if (baseTokens.header?.layout === 'immersive' && contrastTheme) {
      return {
        ...baseTokens,
        contrast: contrastTheme,
      }
    }
    return baseTokens
  }, [store?.theme, heroAvatarUrl, contrastTheme])
  const { colors, typography, layout, cards, buttons, wallpaper, header, footer, profile: profileTokens, social, hero, layoutPreset, layoutInfo } = tokens
  const allSections = store?.sections || []
  const profileSec = allSections.find((s) => s.type === 'profile')

  // Product Purchase & Download Modal Flow State
  const [modalProduct, setModalProduct] = useState(() => {
    if (initialProduct) return initialProduct
    if (initialProductId && products?.length) {
      return products.find((p) => String(p.id) === String(initialProductId)) || null
    }
    if (initialProductSlug && products?.length) {
      return products.find((p) => p.slug === initialProductSlug) || null
    }
    return null
  })
  const [modalStep, setModalStep] = useState('preview')

  useEffect(() => {
    if (initialProduct) {
      setModalProduct(initialProduct)
      setModalStep('preview')
    } else if (initialProductId && products?.length) {
      const match = products.find((p) => String(p.id) === String(initialProductId))
      if (match) {
        setModalProduct(match)
        setModalStep('preview')
      }
    } else if (initialProductSlug && products?.length) {
      const match = products.find((p) => p.slug === initialProductSlug)
      if (match) {
        setModalProduct(match)
        setModalStep('preview')
      }
    }
  }, [initialProduct, initialProductId, initialProductSlug, products])

  const handleProductClick = useCallback((clickedProduct) => {
    setModalProduct(clickedProduct)
    setModalStep('preview')
  }, [])

  // Dedicated Gallery Click-to-Open Image Wizard State (Reference Image 1)
  const [modalGallery, setModalGallery] = useState(null)

  const handleGalleryClick = useCallback((gallerySection) => {
    setModalGallery(gallerySection)
  }, [])

  // Filter sections by active page for both live storefront and dashboard editor
  let activePage = null
  if (activePageId !== undefined && activePageId !== null) {
    activePage = (activePageId === 'home')
      ? resolvedPages.find(p => p.isDefault || p.slug === 'home')
      : resolvedPages.find(p => p.id === activePageId || p.slug === activePageId)
  } else if (currentPageSlug) {
    activePage = (currentPageSlug === 'home')
      ? resolvedPages.find(p => p.isDefault || p.slug === 'home')
      : resolvedPages.find(p => p.slug === currentPageSlug || p.id === currentPageSlug)
  }

  // Fallback to default page or first page
  if (!activePage && resolvedPages.length > 0) {
    activePage = resolvedPages.find(p => p.isDefault) || resolvedPages[0]
  }

  const isHomeSelected = !activePage || Boolean(activePage.isDefault) || activePage.slug === 'home' || activePage.id === 'home'
  const selectedPageId = activePage?.id || null

  const pageFilteredSections = resolvedPages.length > 1
    ? allSections.filter((s) => {
        const sPageId = s.pageId || null
        if (isHomeSelected) {
          return !sPageId || sPageId === 'home' || (selectedPageId && sPageId === selectedPageId)
        }
        return sPageId === selectedPageId || (activePage?.slug && sPageId === activePage.slug)
      })
    : allSections

  // Canonical collection membership set for storefront & preview
  const collectionProductIds = useMemo(() => {
    const set = new Set()
    for (const s of allSections) {
      if (s.type === 'collection' || s.type === 'product_collection') {
        const items = s.props?.items
        if (Array.isArray(items)) {
          for (const it of items) {
            if (!it) continue
            if (it.productId) set.add(String(it.productId))
            if (it.courseId) set.add(String(it.courseId))
            if (it.type === 'product' && it.id) set.add(String(it.id))
          }
        }
      }
    }
    return set
  }, [allSections])

  const contentSections = pageFilteredSections.filter((s) => {
    if (s.type === 'profile') return false
    if (!editor && s.hidden) return false
    // If an item belongs to a collection, render it ONLY inside its collection (exclude from top-level)
    if (s.type === 'product' || s.type === 'course') {
      const pid = s.props?.productId || s.props?.courseId || s.props?.id || (!s.props?.productId && products?.[0]?.id ? products[0].id : null)
      if (pid && collectionProductIds.has(String(pid))) {
        return false
      }
    }
    return true
  })

  const [slideDirection, setSlideDirection] = useState('right')
  const prevPageKeyRef = useRef(currentPageSlug || activePageId || 'home')

  useEffect(() => {
    const currentKey = currentPageSlug || activePageId || 'home'
    if (currentKey !== prevPageKeyRef.current) {
      const prevIdx = resolvedPages.findIndex(
        (p) => p.id === prevPageKeyRef.current || p.slug === prevPageKeyRef.current || (p.isDefault && prevPageKeyRef.current === 'home')
      )
      const currIdx = resolvedPages.findIndex(
        (p) => p.id === currentKey || p.slug === currentKey || (p.isDefault && currentKey === 'home')
      )
      if (currIdx !== -1 && prevIdx !== -1) {
        setSlideDirection(currIdx >= prevIdx ? 'right' : 'left')
      }
      prevPageKeyRef.current = currentKey
    }
  }, [currentPageSlug, activePageId, resolvedPages])

  useEffect(() => {
    ensureGoogleFonts([store?.theme?.font, store?.theme?.titleFont].filter(Boolean))
  }, [store?.theme?.font, store?.theme?.titleFont])

  return (
    <div
      className={`min-h-full w-full transition-all duration-300 relative overflow-hidden ${className}`}
      style={{
        ...(tokens?.cssVariables || {}),
        backgroundColor: isImmersive ? (tokens?.contrast?.bg || colors.background) : undefined,
        color: isImmersive ? (tokens?.contrast?.text || colors.text) : colors.text,
        fontFamily: typography.bodyFont,
      }}
    >
      <WallpaperBackdrop
        wallpaper={isImmersive ? { ...wallpaper, bgType: 'solid' } : wallpaper}
        colors={isImmersive ? { ...colors, background: tokens?.contrast?.bg || colors.background } : colors}
      />

      <div className="relative z-10 min-h-full w-full">
        {isImmersive ? (
          <>
            {/* IMMERSIVE HERO FULL-WIDTH HEADER */}
            <div
              onClick={editor ? (e) => { e.stopPropagation(); onSelect?.(profileSec?.id || 'profile') } : undefined}
              className={
                editor
                  ? `group relative cursor-pointer transition-all ${
                      selectedId === (profileSec?.id || 'profile')
                        ? 'ring-2 ring-primary shadow-sm'
                        : 'hover:ring-2 hover:ring-primary/30'
                    }`
                  : ''
              }
            >
              <ImmersiveHeroHeader
                profile={profile}
                tokens={tokens}
                editor={editor}
                username={resolvedUsername}
                store={store}
                contrastTheme={contrastTheme}
              />
            </div>

            {/* CONTENT SECTIONS BELOW IMMERSIVE HERO */}
            <div className="w-full max-w-[480px] mx-auto flex flex-col gap-3.5 sm:gap-4 px-4 sm:px-5 pt-2 pb-12 relative z-20 box-sizing: border-box">
              {/* PAGE SWITCHER PILLS — Rendered when storefront has 2+ pages */}
              {resolvedPages.length > 1 && (
                <PageSwitcherPills
                  pages={resolvedPages}
                  currentPageSlug={currentPageSlug}
                  activePageId={activePageId}
                  editor={editor}
                  onSelectPage={onSelectPage}
                  tokens={tokens}
                  onDirectionChange={(dir) => setSlideDirection(dir)}
                />
              )}

              <div
                key={currentPageSlug || activePageId || 'home'}
                className={`flex flex-col gap-3.5 sm:gap-4 w-full ${
                  slideDirection === 'right'
                    ? 'storefront-slide-from-right'
                    : 'storefront-slide-from-left'
                }`}
              >
                {contentSections.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-surface-raised/40 p-8 text-center space-y-1">
                    <p className="text-xs font-semibold text-content-primary">Your storefront is ready to build.</p>
                    <p className="text-[11px] text-content-muted">
                      {editor ? 'Add your first section from the editor.' : 'No products or content published yet.'}
                    </p>
                  </div>
                ) : (
                  contentSections.map((section) => (
                    <div
                      key={section.id}
                      onClick={editor ? (e) => { e.stopPropagation(); onSelect?.(section.id) } : undefined}
                      className={
                        editor
                          ? `group relative cursor-pointer rounded-2xl transition-all p-1.5 ${
                              selectedId === section.id
                                ? 'ring-2 ring-primary shadow-sm'
                                : 'hover:ring-2 hover:ring-primary/30'
                            }`
                          : ''
                      }
                    >
                      {editor && section.hidden && (
                        <span className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                          <Lock className="h-3 w-3" /> Hidden
                        </span>
                      )}
                      <div className={editor && section.hidden ? 'opacity-40' : ''}>
                        <SectionRenderer
                          section={section}
                          tokens={tokens}
                          profile={profile}
                          products={products}
                          username={resolvedUsername}
                          editor={editor}
                          device={device}
                          store={store}
                          collectionProductIds={collectionProductIds}
                          onProductClick={handleProductClick}
                          onGalleryClick={handleGalleryClick}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* CreatorStore Footer */}
              <StorefrontFooter
                editor={editor}
                showBranding={footer?.showBranding !== false}
                tokens={tokens}
              />
            </div>
          </>
        ) : (
          <div className={`w-full max-w-[480px] mx-auto flex flex-col gap-3.5 sm:gap-4 px-4 sm:px-5 box-sizing: border-box ${header?.layout === 'hero' ? 'pt-3 pb-6 sm:pt-4 sm:pb-8' : 'py-6 sm:py-8'}`}>
            
            {/* STATIC PROFILE SECTION AT STARTING OF STOREFRONT (CREATORS CANNOT MOVE IT) */}
            <div
              onClick={editor ? (e) => { e.stopPropagation(); onSelect?.(profileSec?.id || 'profile') } : undefined}
              className={
                editor
                  ? `group relative cursor-pointer rounded-2xl transition-all ${header?.layout === 'hero' ? '' : 'p-1.5'} ${selectedId === (profileSec?.id || 'profile')
                    ? 'ring-2 ring-primary shadow-sm'
                    : 'hover:ring-2 hover:ring-primary/30'
                  }`
                  : ''
              }
            >
              <ProfileHeader
                profile={profile}
                tokens={tokens}
                editor={editor}
                username={resolvedUsername}
                store={store}
              />
            </div>

            {/* CONTENT SECTIONS (RENDERED SEQUENTIALLY BELOW THE STATIC PROFILE) */}
            {/* PAGE SWITCHER PILLS — Rendered when storefront has 2+ pages */}
            {resolvedPages.length > 1 && (
              <PageSwitcherPills
                pages={resolvedPages}
                currentPageSlug={currentPageSlug}
                activePageId={activePageId}
                editor={editor}
                onSelectPage={onSelectPage}
                tokens={tokens}
                onDirectionChange={(dir) => setSlideDirection(dir)}
              />
            )}

            <div
              key={currentPageSlug || activePageId || 'home'}
              className={`flex flex-col gap-3.5 sm:gap-4 w-full ${
                slideDirection === 'right'
                  ? 'storefront-slide-from-right'
                  : 'storefront-slide-from-left'
              }`}
            >
              {contentSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-surface-raised/40 p-8 text-center space-y-1">
                  <p className="text-xs font-semibold text-content-primary">Your storefront is ready to build.</p>
                  <p className="text-[11px] text-content-muted">
                    {editor ? 'Add your first section from the editor.' : 'No products or content published yet.'}
                  </p>
                </div>
              ) : (
                contentSections.map((section) => {
                  return (
                    <div
                      key={section.id}
                      onClick={editor ? (e) => { e.stopPropagation(); onSelect?.(section.id) } : undefined}
                      className={
                        editor
                          ? `group relative cursor-pointer rounded-2xl transition-all p-1.5 ${selectedId === section.id
                            ? 'ring-2 ring-primary shadow-sm'
                            : 'hover:ring-2 hover:ring-primary/30'
                          }`
                          : ''
                      }
                    >
                      {editor && section.hidden && (
                        <span className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                          <Lock className="h-3 w-3" /> Hidden
                        </span>
                      )}
                      <div className={editor && section.hidden ? 'opacity-40' : ''}>
                        <SectionRenderer
                          section={section}
                          tokens={tokens}
                          profile={profile}
                          products={products}
                          username={resolvedUsername}
                          editor={editor}
                          device={device}
                          store={store}
                          collectionProductIds={collectionProductIds}
                          onProductClick={handleProductClick}
                          onGalleryClick={handleGalleryClick}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* CreatorStore Footer */}
            <StorefrontFooter
              editor={editor}
              showBranding={footer?.showBranding !== false}
              tokens={tokens}
            />
          </div>
        )}
      </div>

      {/* Complete Product Purchase & Download Modal Flow / Dedicated Coaching Booking Modal (Linktree-inspired) */}
      {modalProduct && modalProduct.type === 'COACHING' ? (
        <PublicBookingModal
          product={modalProduct}
          creator={{
            name: profile?.name || store?.storeName || 'Creator',
            username: resolvedUsername,
            avatarUrl: profile?.avatarUrl || store?.avatarUrl || null,
          }}
          isOpen={Boolean(modalProduct)}
          onClose={() => setModalProduct(null)}
          tokens={tokens}
        />
      ) : modalProduct ? (
        <ProductPurchaseModalFlow
          product={modalProduct}
          creator={{
            name: profile?.name || store?.storeName || 'Creator',
            username: resolvedUsername,
            avatarUrl: profile?.avatarUrl || store?.avatarUrl || null,
          }}
          isOpen={Boolean(modalProduct)}
          onClose={() => setModalProduct(null)}
          initialStep={modalStep}
          tokens={tokens}
        />
      ) : null}

      {/* Dedicated Gallery Click-to-Open Image Wizard (Reference Image 1) */}
      {modalGallery && (
        <GalleryWizardModal
          gallery={modalGallery}
          creator={{
            name: profile?.name || store?.storeName || 'Creator',
            username: resolvedUsername,
            avatarUrl: profile?.avatarUrl || store?.avatarUrl || null,
          }}
          isOpen={Boolean(modalGallery)}
          onClose={() => setModalGallery(null)}
          onProductClick={handleProductClick}
        />
      )}
    </div>
  )
}

/* ---------------- HERO STOREFRONT LAYOUT ENGINE ---------------- */
function HeroStorefrontLayout({ store, profile, products, sections, tokens, username, editor, device, selectedId, onSelect, onProductClick, onGalleryClick }) {
  const { colors, typography, layout, cards, hero, layoutPreset } = tokens
  const name = profile?.name || 'Creator Name'
  const bio = profile?.bio || 'Digital Creator & Educator'
  const category = profile?.category || ''
  const avatarUrl = profile?.avatarUrl

  // Canonical collection membership set for Hero layout
  const collectionProductIds = useMemo(() => {
    const set = new Set()
    for (const s of (store?.sections || sections || [])) {
      if (s.type === 'collection' || s.type === 'product_collection') {
        const items = s.props?.items
        if (Array.isArray(items)) {
          for (const it of items) {
            if (!it) continue
            if (it.productId) set.add(String(it.productId))
            if (it.courseId) set.add(String(it.courseId))
            if (it.type === 'product' && it.id) set.add(String(it.id))
          }
        }
      }
    }
    return set
  }, [store?.sections, sections])

  // Filter out duplicate profile section and any collection items from top-level
  const contentSections = sections.filter((s) => {
    if (s.type === 'profile') return false
    if (!editor && s.hidden) return false
    if (s.type === 'product' || s.type === 'course') {
      const pid = s.props?.productId || s.props?.courseId || s.props?.id || (!s.props?.productId && products?.[0]?.id ? products[0].id : null)
      if (pid && collectionProductIds.has(String(pid))) return false
    }
    return true
  })
  const profileSec = sections.find((s) => s.type === 'profile')

  // Hero Height Calculations
  const heroHeightClass =
    hero.height === 'compact'
      ? 'h-[360px] sm:h-[400px]'
      : hero.height === 'medium'
        ? 'h-[460px] sm:h-[520px]'
        : hero.height === 'full'
          ? 'h-[680px] sm:h-[780px] min-h-[80vh]'
          : 'h-[560px] sm:h-[640px] min-h-[65vh]' // default 'large'

  // Overlap Negative Margin Calculations
  const overlapMarginClass =
    hero.overlapDepth === 'none'
      ? 'mt-4'
      : hero.overlapDepth === 'subtle'
        ? '-mt-10 sm:-mt-14'
        : hero.overlapDepth === 'strong'
          ? '-mt-24 sm:-mt-32'
          : '-mt-16 sm:-mt-20' // default 'medium'

  const overlayOpacity = hero.overlay ? hero.overlayStrength / 100 : 0

  return (
    <div className="w-full flex flex-col items-center">
      {/* 1. HERO BANNER HEADER */}
      <div className="w-full relative flex justify-center overflow-hidden">
        {/* Full Hero Container */}
        <div className={`w-full ${layout.containerWidth || 'max-w-6xl'} relative overflow-hidden ${heroHeightClass} ${layoutPreset === 'immersive-portrait' ? 'mx-4 mt-4 rounded-3xl shadow-xl border border-white/20' : ''}`}>

          {/* Creator Hero Photograph */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
              style={{ objectPosition: hero.position || 'center' }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 via-surface-card to-surface-base flex items-center justify-center text-7xl font-black text-white/30">
              {name.slice(0, 1)}
            </div>
          )}

          {/* Vignette & Gradient Overlay for High Text Readability */}
          {hero.overlay && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,${overlayOpacity}) 100%)`,
              }}
            />
          )}

          {/* Editorial Overlay Header (Name above image for editorial-overlay) */}
          {layoutPreset === 'editorial-overlay' && (
            <div className="absolute top-6 inset-x-0 text-center z-10 px-4 sm:px-6">
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-normal italic tracking-tight text-white drop-shadow-md" style={{ fontFamily: typography.headingFont }}>
                {name}
              </h1>
            </div>
          )}

          {/* Identity Overlay on Image (Name, Category, Bio, Socials) */}
          <div
            onClick={editor && profileSec ? (e) => { e.stopPropagation(); onSelect?.(profileSec.id) } : undefined}
            className={`absolute bottom-16 sm:bottom-20 inset-x-0 p-6 sm:p-10 z-10 flex flex-col items-center text-center space-y-3 text-white ${editor && profileSec ? 'cursor-pointer transition-all hover:ring-2 hover:ring-primary/60 rounded-2xl' : ''
              }`}
          >
            {layoutPreset !== 'editorial-overlay' && (
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight drop-shadow-lg" style={{ fontFamily: typography.headingFont }}>
                {name}
              </h1>
            )}

            {category && (
              <span className="px-3.5 py-1 text-xs sm:text-sm font-black uppercase tracking-wider rounded-full bg-[#1A1A1A] border border-[#2E2E2E] text-white shadow-sm">
                {category}
              </span>
            )}

            {bio && (
              <p className="text-xs sm:text-base font-medium opacity-90 max-w-xl leading-relaxed drop-shadow-sm">
                {bio}
              </p>
            )}

            <SocialLinks links={profile?.socialLinks} socialStyle={layoutPreset === 'glass-creator' ? 'glass' : 'glass'} colors={colors} editor={editor} />
          </div>
        </div>
      </div>

      {/* 2. OVERLAPPING / FLOATING PRODUCTS & SECTIONS CONTAINER */}
      <div className={`w-full max-w-[480px] mx-auto px-4 sm:px-5 z-20 ${overlapMarginClass} transition-all duration-300 box-sizing: border-box`}>

        {/* Creator Canvas: Bottom Sheet Container Wrapper */}
        {layoutPreset === 'creator-canvas' ? (
          <div className="bg-white rounded-t-3xl p-6 sm:p-8 md:p-10 shadow-2xl border border-white/10 space-y-6 sm:space-y-8">
            <SectionsStack
              sections={contentSections}
              tokens={tokens}
              profile={profile}
              products={products}
              username={username}
              editor={editor}
              device={device}
              selectedId={selectedId}
              onSelect={onSelect}
              onProductClick={onProductClick}
            />
          </div>
        ) : layoutPreset === 'glass-creator' ? (
          /* Studio Creator: opaque layered container */
          <div className="rounded-3xl p-5 sm:p-8 md:p-10 bg-[#1A1A1A] border border-[#2E2E2E] shadow-2xl space-y-6 sm:space-y-8">
            <SectionsStack
              sections={contentSections}
              tokens={tokens}
              profile={profile}
              products={products}
              username={username}
              editor={editor}
              device={device}
              selectedId={selectedId}
              onSelect={onSelect}
              onProductClick={onProductClick}
            />
          </div>
        ) : (
          /* Standard Floating Cards Layout Stack */
          <div className="w-full">
            <SectionsStack
              sections={contentSections}
              tokens={tokens}
              profile={profile}
              products={products}
              username={username}
              editor={editor}
              device={device}
              selectedId={selectedId}
              onSelect={onSelect}
              onProductClick={onProductClick}
            />
          </div>
        )}

        {/* CreatorStore Footer */}
        <StorefrontFooter
          editor={editor}
          showBranding={tokens?.footer?.showBranding !== false}
        />
      </div>
    </div>
  )
}

function SectionsStack({ sections, tokens, profile, products, username, editor, device, selectedId, onSelect, onProductClick }) {
  if (!sections.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-surface-raised/40 p-8 text-center space-y-1">
        <p className="text-xs font-semibold text-content-primary">Your storefront is ready to build.</p>
        <p className="text-[11px] text-content-muted">{editor ? 'Add your first section from the editor.' : 'No products or content published yet.'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4 w-full">
      {sections.map((section) => (
        <div
          key={section.id}
          onClick={editor ? (e) => { e.stopPropagation(); onSelect?.(section.id) } : undefined}
          className={
            editor
              ? `group relative cursor-pointer rounded-2xl p-1.5 transition-all ${selectedId === section.id
                ? 'ring-2 ring-primary shadow-sm'
                : 'hover:ring-2 hover:ring-primary/30'
              }`
              : ''
          }
        >
          {editor && section.hidden && (
            <span className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              <Lock className="h-3 w-3" /> Hidden
            </span>
          )}
          <div className={editor && section.hidden ? 'opacity-40' : ''}>
            <SectionRenderer
              section={section}
              tokens={tokens}
              profile={profile}
              products={products}
              username={username}
              editor={editor}
              device={device}
              onProductClick={onProductClick}
              onGalleryClick={onGalleryClick}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionRenderer({ section, tokens, profile, products, username, editor, device, store, collectionProductIds, onProductClick, onGalleryClick }) {
  const { colors, typography, layout, cards, buttons, profile: profileTokens, social, semantic = {} } = tokens
  const align = section.props?.align || 'center'
  const alignClass = align === 'left' ? 'text-left items-start' : align === 'right' ? 'text-right items-end' : 'text-center items-center'

  const cardBg = semantic.surfaceBackground || cards.bg || '#12141C'
  const cardBorder = semantic.borderColor ? `1px solid ${semantic.borderColor}` : (cards.border || '1px solid rgba(255,255,255,0.1)')
  const cardShadow = semantic.cardShadow || cards.shadow || '0 8px 24px 0 rgba(0, 0, 0, 0.25)'
  const cardRadius = storefrontCardRadiusCss ? storefrontCardRadiusCss(tokens) : '20px'
  const primaryText = semantic.primaryText || colors.text || '#FFFFFF'
  const secondaryText = semantic.secondaryText || colors.mutedText || 'rgba(255,255,255,0.68)'
  const mutedText = semantic.mutedText || colors.mutedText || 'rgba(255,255,255,0.5)'

  switch (section.type) {
    case 'profile':
      return <ProfileHeader profile={profile} tokens={tokens} editor={editor} username={username} store={store} />

    case 'heading':
    case 'heading_text': {
      const headingText = section.props?.text ?? section.props?.title ?? 'Welcome to my store'
      const subtitleText = section.props?.subtitle
      return (
        <div className={`flex flex-col ${alignClass} w-full px-2 pt-2 pb-0.5`}>
          <h2
            className={`text-xl sm:text-2xl ${typography.titleWeight || 'font-bold'} w-full leading-tight`}
            style={{ fontFamily: typography.headingFont, color: colors.title || colors.text }}
          >
            {headingText}
          </h2>
          {subtitleText ? (
            <p
              className="text-xs sm:text-sm opacity-75 mt-1 w-full leading-relaxed"
              style={{ color: colors.text }}
            >
              {subtitleText}
            </p>
          ) : null}
        </div>
      )
    }

    case 'text':
    case 'text_block':
    case 'paragraph_text': {
      const textContent = section.props?.text ?? section.props?.content ?? 'Explore my exclusive digital products.'
      return (
        <div
          className={`w-full ${alignClass} text-sm sm:text-base leading-relaxed opacity-85 px-2 py-0.5 whitespace-pre-wrap break-words`}
          style={{ color: colors.text }}
        >
          {textContent}
        </div>
      )
    }

    case 'button': {
      const label = section.props?.label || 'Click Here'
      const url = section.props?.url || '#'
      const thumbnail = section.props?.thumbnail
      const isFeatured = normalizeSectionLayout('button', section.props?.layout) === 'featured'
      const media = leadingMedia({ thumbnail, url, title: label })

      if (isFeatured) {
        const featBg = tokens?.adaptivePalette?.featuredCard?.background || cardBg
        const featBorder = tokens?.adaptivePalette?.featuredCard?.border || cardBorder
        const featShadow = tokens?.adaptivePalette?.featuredCard?.shadow || cardShadow
        const featTitleColor = tokens?.adaptivePalette?.featuredCard?.text || primaryText
        const featMutedColor = tokens?.adaptivePalette?.featuredCard?.mutedText || mutedText

        const card = (
          <div
            className="w-full overflow-hidden space-y-2.5 transition-all duration-200"
            style={{ borderRadius: cardRadius, border: featBorder, backgroundColor: featBg, boxShadow: featShadow }}
          >
            <div className="aspect-[2.1/1] w-full overflow-hidden bg-slate-900">
              {media.type === 'image' ? (
                <img src={media.src} alt={label} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/80" style={{ background: colors.buttonColor || '#194DF5' }}>
                  {media.letter}
                </div>
              )}
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-bold" style={{ color: featTitleColor }}>{label}</h3>
                {url && url !== '#' && <p className="text-xs truncate" style={{ color: featMutedColor }}>{url}</p>}
              </div>
              <ProductCtaButton label="OPEN" cardBg={featBg} tokens={tokens} fullWidth />
            </div>
          </div>
        )
        return (
          <div className="w-full">
            {editor || !url || url === '#' ? card : (
              <a href={url} target="_blank" rel="noreferrer" className="block w-full group">{card}</a>
            )}
          </div>
        )
      }

      const pill = <ClassicLinkPill label={label} media={media} tokens={tokens} align={section.props?.align} />
      return (
        <div className="w-full">
          {editor || !url || url === '#' ? pill : (
            <a href={url} target="_blank" rel="noreferrer" className="block w-full">{pill}</a>
          )}
        </div>
      )
    }

    case 'social':
    case 'instagram': {
      const platformId = section.props?.platform || (section.type === 'instagram' ? 'instagram' : 'generic')
      const platform = getSocialPlatform(platformId)
      const PlatformIcon = platform.icon
      const label = section.props?.title || section.props?.label || platform.name
      const url = section.props?.url || '#'
      const thumbnail = section.props?.thumbnail || section.props?.customThumbnail
      const style = resolveSocialStyle(section.props?.layout || section.props?.displayMode || section.props?.displayStyle, platform.id)

      const isInstagram = platform.id === 'instagram'
      const igData = section.props?.instagramData || null
      const isIgConnected = Boolean(igData?.connected)
      const igProfile = igData?.profile || null
      const igMedia = Array.isArray(igData?.media) ? igData.media : []
      const igUsername = igData?.username || igProfile?.username || ''
      const targetUrl = (isInstagram && isIgConnected && igProfile?.profileUrl) ? igProfile.profileUrl : url

      if (style === 'cards') {
        const hasRealPost = isInstagram && isIgConnected && igMedia.length > 0
        const post = hasRealPost ? igMedia[0] : null
        const postImg = post ? (post.thumbnailUrl || post.mediaUrl) : thumbnail
        const postUrl = post?.permalink || targetUrl

        const card = (
          <div
            className="w-full overflow-hidden space-y-2.5 transition-all duration-200"
            style={{ borderRadius: cardRadius, border: cardBorder, backgroundColor: cardBg, boxShadow: cardShadow }}
          >
            <div className="aspect-[2.1/1] w-full overflow-hidden bg-slate-900 relative flex items-center justify-center">
              {postImg ? (
                <img src={postImg} alt={label} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${platform.color}25` }}>
                  <PlatformIcon className="h-12 w-12" style={{ color: platform.color }} />
                </div>
              )}
              <div
                className="absolute bottom-2.5 right-2.5 h-7 w-7 rounded-full flex items-center justify-center shadow"
                style={{ backgroundColor: platform.color, color: '#FFFFFF' }}
              >
                <PlatformIcon className="h-4 w-4" />
              </div>
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-bold" style={{ color: primaryText }}>{label}</h3>
                {post?.caption ? (
                  <p className="text-xs line-clamp-2" style={{ color: secondaryText }}>{post.caption}</p>
                ) : url && url !== '#' ? (
                  <p className="text-xs truncate" style={{ color: mutedText }}>{url.replace(/^https?:\/\//, '')}</p>
                ) : null}
              </div>
              <StyledButton label={hasRealPost ? 'View on Instagram' : `Follow on ${platform.name}`} tokens={tokens} fullWidth />
            </div>
          </div>
        )
        return (
          <div className="w-full">
            {editor || !postUrl || postUrl === '#' ? card : (
              <a href={postUrl} target="_blank" rel="noopener noreferrer" className="block w-full group">{card}</a>
            )}
          </div>
        )
      }

      if (style === 'grid') {
        const gridCard = (
          <div
            className="w-full overflow-hidden p-3.5 space-y-3 transition-all duration-200"
            style={{ borderRadius: cardRadius, border: cardBorder, backgroundColor: cardBg, boxShadow: cardShadow }}
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 shadow"
                  style={{ backgroundColor: platform.color, color: '#FFFFFF' }}
                >
                  <PlatformIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate" style={{ color: primaryText }}>{label}</h3>
                  <p className="text-[11px] truncate" style={{ color: mutedText }}>
                    {isInstagram && isIgConnected ? `@${igUsername}` : (url && url !== '#' ? url.replace(/^https?:\/\//, '') : platform.name)}
                  </p>
                </div>
              </div>
              {isInstagram && isIgConnected && (
                <span className="text-[11px]" style={{ color: mutedText }}>
                  {igMedia.length} posts
                </span>
              )}
            </div>

            {isInstagram && isIgConnected ? (
              igMedia.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {igMedia.slice(0, 4).map((item, i) => (
                    <a
                      key={item.id || i}
                      href={item.permalink || targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden relative flex items-center justify-center group/item block transition-transform duration-200"
                      style={{ backgroundColor: semantic.surfaceElevated || '#1E293B', border: cardBorder }}
                    >
                      <img src={item.thumbnailUrl || item.mediaUrl} alt={item.caption || 'Instagram Post'} className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-200" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="aspect-[2/1] rounded-lg border border-dashed flex flex-col items-center justify-center p-3 text-center" style={{ borderColor: semantic.borderColor || 'rgba(255,255,255,0.15)', backgroundColor: semantic.surfaceElevated || 'rgba(255,255,255,0.05)' }}>
                  <PlatformIcon className="h-6 w-6 mb-1" style={{ color: mutedText }} />
                  <p className="text-xs" style={{ color: secondaryText }}>No Instagram posts found</p>
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="aspect-square rounded-lg overflow-hidden relative flex items-center justify-center" style={{ backgroundColor: semantic.surfaceElevated || '#1E293B', border: cardBorder }}>
                  {thumbnail ? (
                    <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <PlatformIcon className="h-8 w-8" style={{ color: platform.color }} />
                  )}
                </div>
                <div className="aspect-square rounded-lg overflow-hidden flex flex-col items-center justify-center p-2 text-center" style={{ backgroundColor: semantic.surfaceElevated || '#1E293B', border: cardBorder }}>
                  <p className="text-[11px]" style={{ color: mutedText }}>{platform.name} Feed</p>
                </div>
              </div>
            )}

            <StyledButton label={`Follow on ${platform.name}`} tokens={tokens} fullWidth />
          </div>
        )
        return (
          <div className="w-full">
            {editor || !targetUrl || targetUrl === '#' ? gridCard : (
              <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="block w-full group">{gridCard}</a>
            )}
          </div>
        )
      }

      if (style === 'carousel') {
        const carouselCard = (
          <div
            className="w-full overflow-hidden p-3.5 space-y-3 transition-all duration-200"
            style={{ borderRadius: cardRadius, border: cardBorder, backgroundColor: cardBg, boxShadow: cardShadow }}
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 shadow"
                  style={{ backgroundColor: platform.color, color: '#FFFFFF' }}
                >
                  <PlatformIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate" style={{ color: primaryText }}>{label}</h3>
                  <p className="text-[11px] truncate" style={{ color: mutedText }}>
                    {isInstagram && isIgConnected ? `@${igUsername}` : (url && url !== '#' ? url.replace(/^https?:\/\//, '') : platform.name)}
                  </p>
                </div>
              </div>
            </div>

            {isInstagram && isIgConnected ? (
              igMedia.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                  {igMedia.map((slide, i) => (
                    <a
                      key={slide.id || i}
                      href={slide.permalink || targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-32 h-44 shrink-0 rounded-xl overflow-hidden relative flex items-center justify-center group/slide block"
                      style={{ backgroundColor: semantic.surfaceElevated || '#1E293B', border: cardBorder }}
                    >
                      <img src={slide.thumbnailUrl || slide.mediaUrl} alt={slide.caption || 'Instagram Post'} className="w-full h-full object-cover group-hover/slide:scale-105 transition-transform duration-200" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="h-32 w-full rounded-xl border border-dashed flex flex-col items-center justify-center p-3 text-center" style={{ borderColor: semantic.borderColor || 'rgba(255,255,255,0.15)', backgroundColor: semantic.surfaceElevated || 'rgba(255,255,255,0.05)' }}>
                  <PlatformIcon className="h-6 w-6 mb-1" style={{ color: mutedText }} />
                  <p className="text-xs" style={{ color: secondaryText }}>No Instagram posts found</p>
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                <div className="w-32 h-44 shrink-0 rounded-xl overflow-hidden relative flex items-center justify-center" style={{ backgroundColor: semantic.surfaceElevated || '#1E293B', border: cardBorder }}>
                  {thumbnail ? (
                    <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <PlatformIcon className="h-10 w-10" style={{ color: platform.color }} />
                  )}
                </div>
              </div>
            )}

            <StyledButton label={`Follow on ${platform.name}`} tokens={tokens} fullWidth />
          </div>
        )
        return (
          <div className="w-full">
            {editor || !targetUrl || targetUrl === '#' ? carouselCard : (
              <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="block w-full group">{carouselCard}</a>
            )}
          </div>
        )
      }

      if (style === 'profile') {
        const profileImg = (isInstagram && isIgConnected && igProfile?.profilePictureUrl) ? igProfile.profilePictureUrl : thumbnail
        const profileName = (isInstagram && isIgConnected && igProfile?.name) ? igProfile.name : label

        const profileCard = (
          <div
            className="w-full overflow-hidden p-4 space-y-3.5 text-center transition-all duration-200"
            style={{ borderRadius: cardRadius, border: cardBorder, backgroundColor: cardBg, boxShadow: cardShadow }}
          >
            <div className="relative inline-block mx-auto">
              <div className="h-16 w-16 rounded-full overflow-hidden mx-auto flex items-center justify-center shadow-inner" style={{ backgroundColor: semantic.surfaceElevated || '#1E293B', border: cardBorder }}>
                {profileImg ? (
                  <img src={profileImg} alt={profileName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${platform.color}30` }}>
                    <PlatformIcon className="h-8 w-8" style={{ color: platform.color }} />
                  </div>
                )}
              </div>
              <div
                className="absolute bottom-0 right-0 h-6 w-6 rounded-full flex items-center justify-center shadow"
                style={{ backgroundColor: platform.color, color: '#FFFFFF' }}
              >
                <PlatformIcon className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-base font-bold truncate" style={{ color: primaryText }}>{profileName}</h3>
              <p className="text-xs truncate" style={{ color: mutedText }}>
                {isInstagram && isIgConnected ? `@${igUsername}` : (url && url !== '#' ? url.replace(/^https?:\/\//, '') : platform.name)}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2" style={{ borderTop: cardBorder, borderBottom: cardBorder }}>
              <div className="text-center">
                <div className="text-xs font-bold" style={{ color: primaryText }}>
                  {isInstagram && isIgConnected
                    ? (typeof igProfile?.mediaCount === 'number' ? igProfile.mediaCount : (igMedia.length || 0))
                    : 'Feed'}
                </div>
                <div className="text-[11px]" style={{ color: mutedText }}>Posts</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-bold" style={{ color: primaryText }}>
                  {isInstagram && isIgConnected
                    ? (igProfile?.followersCount != null
                        ? Number(igProfile.followersCount).toLocaleString()
                        : (igProfile?.followerCount != null
                            ? Number(igProfile.followerCount).toLocaleString()
                            : 'Unavailable'))
                    : platform.name}
                </div>
                <div className="text-[11px]" style={{ color: mutedText }}>Followers</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-bold" style={{ color: primaryText }}>
                  {isInstagram && isIgConnected
                    ? (igProfile?.followingCount != null
                        ? Number(igProfile.followingCount).toLocaleString()
                        : (igProfile?.followsCount != null
                            ? Number(igProfile.followsCount).toLocaleString()
                            : 'Unavailable'))
                    : 'Profile'}
                </div>
                <div className="text-[11px]" style={{ color: mutedText }}>Following</div>
              </div>
            </div>
            <StyledButton label={`Follow on ${platform.name}`} tokens={tokens} fullWidth />
          </div>
        )
        return (
          <div className="w-full">
            {editor || !targetUrl || targetUrl === '#' ? profileCard : (
              <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="block w-full group">{profileCard}</a>
            )}
          </div>
        )
      }

      if (style === 'single') {
        const hasRealPost = isInstagram && isIgConnected && igMedia.length > 0
        const post = hasRealPost ? igMedia[0] : null
        const postImg = post ? (post.thumbnailUrl || post.mediaUrl) : thumbnail
        const postUrl = post?.permalink || targetUrl

        const singleCard = (
          <div
            className="w-full overflow-hidden space-y-2.5 transition-all duration-200"
            style={{ borderRadius: cardRadius, border: cardBorder, backgroundColor: cardBg, boxShadow: cardShadow }}
          >
            <div className="aspect-square w-full overflow-hidden relative flex items-center justify-center" style={{ backgroundColor: semantic.surfaceElevated || '#0F172A' }}>
              {postImg ? (
                <img src={postImg} alt={label} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${platform.color}25` }}>
                  <PlatformIcon className="h-16 w-16" style={{ color: platform.color }} />
                </div>
              )}
              <div
                className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center shadow"
                style={{ backgroundColor: platform.color, color: '#FFFFFF' }}
              >
                <PlatformIcon className="h-4 w-4" />
              </div>
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-bold" style={{ color: primaryText }}>{label}</h3>
                {post?.caption ? (
                  <p className="text-xs line-clamp-2" style={{ color: secondaryText }}>{post.caption}</p>
                ) : url && url !== '#' ? (
                  <p className="text-xs truncate" style={{ color: mutedText }}>{url.replace(/^https?:\/\//, '')}</p>
                ) : null}
              </div>
              <StyledButton label={hasRealPost ? 'View on Instagram' : `View on ${platform.name}`} tokens={tokens} fullWidth />
            </div>
          </div>
        )
        return (
          <div className="w-full">
            {editor || !postUrl || postUrl === '#' ? singleCard : (
              <a href={postUrl} target="_blank" rel="noopener noreferrer" className="block w-full group">{singleCard}</a>
            )}
          </div>
        )
      }

      // Classic pill (default)
      const media = thumbnail
        ? { type: 'image', src: thumbnail }
        : { type: 'icon', Icon: PlatformIcon, color: platform.color }

      const pill = <ClassicLinkPill label={label} media={media} tokens={tokens} align={section.props?.align} />
      return (
        <div className="w-full">
          {editor || !url || url === '#' ? pill : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full">{pill}</a>
          )}
        </div>
      )
    }

    case 'image':
      return section.props?.url ? (
        <img
          src={section.props.url}
          alt={section.props?.alt || ''}
          className="w-full max-h-[450px] sm:max-h-[550px] md:max-h-[650px] object-cover shadow-sm"
          style={{ borderRadius: cardRadius }}
        />
      ) : (
        <div
          className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed text-sm font-medium"
          style={{ borderRadius: cardRadius, border: cardBorder, backgroundColor: cardBg, color: mutedText }}
        >
          Add image URL
        </div>
      )

    case 'social_links':
      return <SocialLinks links={section.props?.links || profile?.socialLinks} socialStyle={social.style} colors={colors} tokens={tokens} editor={editor} />

    case 'divider':
      return <div className="my-2 h-px w-full opacity-20" style={{ background: colors.text }} />

    case 'product': {
      const p = products.find((x) => x.id === section.props?.productId) || (section.props?.productId ? null : products[0])
      if (!p) return <div className="rounded-2xl border border-dashed p-6 text-center text-xs" style={{ border: cardBorder, backgroundColor: cardBg, color: secondaryText }}>No products added yet.</div>

      const productLayout = section.props?.layout || p.displayMode || 'classic'
      const isClassic = normalizeSectionLayout('product', productLayout) === 'classic'
      const href = username ? `/${username}/${p.slug}` : `/checkout/${p.id}`

      if (isClassic) {
        const isBundle = p.type === 'BUNDLE'
        const count = p.productCount || p.bundleProducts?.length || p.bundleItems?.length || 0
        const priceLabel = Number(p.price) === 0 ? 'FREE' : formatMoney(p.price, p.currency)
        const meta = isBundle && count > 0 ? `${count} ${count === 1 ? 'item' : 'items'} · ${priceLabel}` : priceLabel
        const media = leadingMedia({ thumbnail: p.thumbnail, title: p.title })
        const pill = (
          <ClassicLinkPill
            label={p.title}
            meta={meta}
            metaIcon={isBundle ? Layers : undefined}
            media={media}
            tokens={tokens}
          />
        )
        return (
          <div className="w-full">
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onProductClick?.(p)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onProductClick?.(p)
                }
              }}
              className="block cursor-pointer text-left w-full"
            >
              {pill}
            </div>
          </div>
        )
      }

      return (
        <div className="w-full">
          <ProductCard product={p} tokens={tokens} username={username} editor={editor} ctaOverride={section.props?.ctaLabel} onProductClick={onProductClick} />
        </div>
      )
    }

    case 'product_grid': {
      const list = section.props?.source === 'all' || !section.props?.productIds
        ? products.filter((p) => !collectionProductIds?.has(String(p.id)))
        : products.filter((p) => section.props.productIds.includes(p.id))

      if (!list.length) {
        return (
          <div className="rounded-2xl border border-dashed p-6 text-center text-xs" style={{ border: cardBorder, backgroundColor: cardBg, color: secondaryText }}>
            No products added yet.
          </div>
        )
      }

      const hasDrafts = editor && list.some(p => p.status !== 'PUBLISHED')
      const gridColsClass = device === 'mobile' ? 'grid-cols-1 gap-3.5' : 'grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'

      return (
        <div className="space-y-4">
          <div className={`grid ${gridColsClass}`}>
            {list.map((p) => (
              <ProductCard key={p.id} product={p} tokens={tokens} username={username} editor={editor} onProductClick={onProductClick} />
            ))}
          </div>
          {hasDrafts && (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 rounded-xl px-3.5 py-2 text-center shadow-xs">
              ⚠️ Note: Draft products appear here in Store Builder preview, but must be Published to appear on your live store link.
            </p>
          )}
        </div>
      )
    }

    case 'collection':
    case 'product_collection': {
      const title = section.props?.title || 'Collection'
      const rawLayout = section.props?.displayMode || section.props?.layout || 'list'
      const layout = (rawLayout === 'stack' || !rawLayout) ? 'list' : rawLayout
      const items = Array.isArray(section.props?.items) ? section.props.items : []
      const isLight = tokens?.contrast?.isLight ?? false
      const collSemantic = tokens?.semantic || {}
      const cardBg = collSemantic.surfaceBackground || cards.bg || (isLight ? '#FFFFFF' : '#000000')
      const cardTitleColor = collSemantic.primaryText || getAccessibleTextColor(cardBg, null, 4.5)
      const cardMutedColor = collSemantic.mutedText || getAccessibleMutedTextColor(cardBg)
      const cardBorder = collSemantic.borderColor ? `1px solid ${collSemantic.borderColor}` : (cards.border || (isLight ? '1px solid rgba(0, 0, 0, 0.10)' : '1px solid #39414D'))

      const renderCollectionItem = (item, idx) => {
        if (!item) return null
        if (item.type === 'product' || item.type === 'course') {
          const targetId = String(item.productId || item.courseId || item.id || '')
          const p = products.find((x) => String(x.id) === targetId || String(x.productId) === targetId || String(x.courseId) === targetId)
          if (!p) return null
          return (
            <ProductCard
              key={item.id || item.productId || item.courseId || idx}
              product={p}
              tokens={tokens}
              username={username}
              editor={editor}
              onProductClick={onProductClick}
            />
          )
        }
        if (item.type === 'link') {
          const linkUrl = item.url ? (item.url.startsWith('http://') || item.url.startsWith('https://') ? item.url : `https://${item.url}`) : '#'
          return (
            <a
              key={item.id || idx}
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="block group w-full h-full"
            >
              <div
                className="flex items-center justify-between p-3.5 rounded-xl transition-all group-hover:-translate-y-0.5 shadow-sm h-full"
                style={{ borderRadius: `${cards.radius}px`, border: cardBorder, background: cardBg }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 font-bold"
                    style={{
                      background: isLight ? '#F4F4F4' : '#242424',
                      border: isLight ? '1px solid #E5E5E5' : '1px solid #2E2E2E',
                      color: isLight ? '#111111' : '#D4D4D8',
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <h4 className="text-sm font-bold truncate" style={{ color: cardTitleColor }}>{item.title || 'External Link'}</h4>
                    {item.url && <p className="text-xs truncate" style={{ color: cardMutedColor }}>{item.url}</p>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 group-hover:translate-x-1 transition-transform" style={{ color: tokens?.buttons?.color || '#194DF5' }} />
              </div>
            </a>
          )
        }
        return null
      }

      // Check whether this collection has any renderable items
      const hasValidItems = items.some((item) => {
        if (!item) return false
        if (item.type === 'product' || item.type === 'course') {
          const targetId = String(item.productId || item.courseId || item.id || '')
          return products.some((x) => String(x.id) === targetId || String(x.productId) === targetId || String(x.courseId) === targetId)
        }
        return item.type === 'link'
      })

      if (!hasValidItems) {
        if (editor) {
          return (
            <div
              className="w-full p-4 rounded-xl border border-dashed text-center text-xs font-medium"
              style={{ backgroundColor: cardBg, borderColor: cardBorder, color: secondaryText }}
            >
              <p className="font-bold mb-1" style={{ color: primaryText }}>{title}</p>
              <p>Your collection is empty. Add products or links to group related content.</p>
            </div>
          )
        }
        return null
      }

      return (
        <div className="w-full space-y-3">
          {title && (
            <div className="flex items-center gap-2 pt-1 pb-0.5">
              <Layers className="h-4 w-4 text-primary shrink-0 opacity-80" />
              <h3
                className="text-sm sm:text-base font-bold tracking-tight"
                style={{ color: colors.title || colors.text }}
              >
                {title}
              </h3>
            </div>
          )}

          {/* LIST LAYOUT (DEFAULT) */}
          {(layout === 'list' || !['grid', 'carousel', 'showcase'].includes(layout)) && (
            <div className="space-y-3">
              {items.map((item, idx) => renderCollectionItem(item, idx))}
            </div>
          )}

          {/* GRID LAYOUT */}
          {layout === 'grid' && (
            <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
              {items.map((item, idx) => {
                const rendered = renderCollectionItem(item, idx)
                if (!rendered) return null
                return (
                  <div key={item.id || item.productId || item.courseId || idx} className="h-full">
                    {rendered}
                  </div>
                )
              })}
            </div>
          )}

          {/* CAROUSEL LAYOUT */}
          {layout === 'carousel' && (
            <div className="relative -mx-2 px-2 sm:mx-0 sm:px-0">
              <div className="flex gap-3 overflow-x-auto pb-2.5 pt-0.5 scroll-smooth snap-x snap-mandatory no-scrollbar [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
                {items.map((item, idx) => {
                  const rendered = renderCollectionItem(item, idx)
                  if (!rendered) return null
                  return (
                    <div key={item.id || item.productId || item.courseId || idx} className="shrink-0 w-[240px] sm:w-[260px] snap-start h-full">
                      {rendered}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* SHOWCASE LAYOUT */}
          {layout === 'showcase' && (
            <div className="space-y-3">
              {items.length > 0 && (
                <div className="w-full">
                  {renderCollectionItem(items[0], 0)}
                </div>
              )}
              {items.length > 1 && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {items.slice(1).map((item, idx) => {
                    const rendered = renderCollectionItem(item, idx + 1)
                    if (!rendered) return null
                    return (
                      <div key={item.id || item.productId || item.courseId || idx + 1} className="h-full">
                        {rendered}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    case 'form':
      return (
        <StorefrontFormCard
          section={section}
          tokens={tokens}
          editor={editor}
          username={username}
        />
      )

    case 'video':
    case 'youtube':
    case 'tiktok':
    case 'vimeo':
    case 'gallery':
    case 'audio':
    case 'pdf':
      return (
        <StorefrontMediaCard
          section={section}
          tokens={tokens}
          editor={editor}
          username={username}
          products={products}
          onProductClick={onProductClick}
          onGalleryClick={onGalleryClick}
        />
      )

    default:
      return null
  }
}

/* ---------------- Profile Header Structural Variants ---------------- */
function ProfileHeader({ profile, tokens, editor, username, store }) {
  const { colors, typography, social, header } = tokens

  if (header?.layout === 'immersive') {
    return (
      <ImmersiveHeroHeader
        profile={profile}
        tokens={tokens}
        editor={editor}
        username={username}
        store={store}
        contrastTheme={tokens?.contrast}
      />
    )
  }

  const handle = username || profile?.username || store?.username || store?.slug || ''

  // Guard against email or email-prefix fallback in header.title
  const rawHeaderTitle = typeof header?.title === 'string' ? header.title.trim() : ''
  const isEmailOrPrefix = rawHeaderTitle && (
    rawHeaderTitle.includes('@') ||
    (profile?.email && rawHeaderTitle.toLowerCase() === profile.email.split('@')[0].toLowerCase())
  )
  const validHeaderTitle = (!isEmailOrPrefix && rawHeaderTitle) ? rawHeaderTitle : null

  // Priority for visible storefront name:
  // 1. Explicit valid header title (if customized and not an email prefix)
  // 2. store.storeName (Store Name)
  // 3. profile.name (Creator Full Name)
  // 4. @handle fallback (never email)
  const name = validHeaderTitle || store?.storeName || profile?.name || (handle ? `@${handle}` : 'Creator Store')
  const bio = header?.bio !== undefined && header?.bio !== null ? header.bio : (profile?.bio || store?.bio || '')
  const themeId = String(tokens?.galleryThemeId || store?.theme?.galleryThemeId || '').toLowerCase().trim()
  const themeArtwork = getThemeArtwork(themeId)
  const hasCustomAvatar = Boolean(header?.avatarUrl || store?.avatarUrl || profile?.avatarUrl)
  const customAvatarUrl = header?.avatarUrl || store?.avatarUrl || profile?.avatarUrl || ''
  const avatarUrl = hasCustomAvatar ? customAvatarUrl : (store?.theme?.headerImageUrl || themeArtwork?.svgDataUri || '')
  const titleStyle = header?.titleStyle === 'logo' && header?.logoUrl ? 'logo' : 'text'
  const isHero = header?.layout === 'hero'
  const showAvatar = header?.showAvatar !== false
  const showTitle = header?.showUsername !== false
  const showBio = header?.showBio !== false
  const igHandle = profile?.instagramUsername || ''
  const igHref = profile?.socialLinks?.instagram
    || (igHandle ? `https://instagram.com/${String(igHandle).replace(/^@/, '')}` : '')
  const showIg = header?.showSocials !== false

  const titleNode = !showTitle ? null : titleStyle === 'logo' ? (
    <img src={header.logoUrl} alt={name} className="h-10 sm:h-12 max-w-[220px] object-contain mx-auto" />
  ) : (
    <div className="space-y-0.5">
      <h1
        className={`text-xl sm:text-2xl font-bold tracking-tight ${typography.titleWeight || ''}`}
        style={{ fontFamily: typography.headingFont, color: colors.title || colors.text }}
      >
        {name}
      </h1>
      {handle && name !== `@${handle}` && (
        <p className="text-xs sm:text-sm font-medium opacity-60 tracking-normal" style={{ color: colors.text }}>
          @{handle.replace(/^@/, '')}
        </p>
      )}
    </div>
  )

  const bioNode = showBio && bio ? (
    <p className="text-xs sm:text-sm leading-relaxed opacity-75 max-w-sm sm:max-w-md mx-auto break-words pt-0.5" style={{ color: colors.text }}>{bio}</p>
  ) : null

  const igIconStyle = {
    backgroundColor: tokens?.semantic?.surfaceElevated || tokens?.semantic?.surfaceBackground || '#1A1A1A',
    borderColor: tokens?.semantic?.borderColor || '#2E2E2E',
    borderWidth: 1,
    borderStyle: 'solid',
    color: tokens?.semantic?.iconColor || tokens?.semantic?.primaryText || '#D4D4D8',
  }

  const igIcon = showIg ? (
    !editor && igHref ? (
      <a
        href={igHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
        style={igIconStyle}
      >
        <Instagram className="h-4 w-4" />
      </a>
    ) : (
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-full"
        style={igIconStyle}
      >
        <Instagram className="h-4 w-4" />
      </span>
    )
  ) : null

  if (isHero) {
    const overlayTitle = !showTitle ? null : titleStyle === 'logo' ? (
      <img src={header.logoUrl} alt={name} className="h-10 sm:h-12 max-w-[220px] object-contain mx-auto drop-shadow-md" />
    ) : (
      <h1
        className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-md"
        style={{ fontFamily: typography.headingFont, color: colors.title || '#FFFFFF' }}
      >
        {name}
      </h1>
    )

    return (
      <div className="flex flex-col items-center text-center gap-3">
        {showAvatar && (
          <div className="relative w-full h-[320px] overflow-hidden rounded-card bg-[#12141c]">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-b from-[#39414D] to-[#121212] flex items-center justify-center">
                <User className="h-16 w-16 text-white/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent pointer-events-none" />
            <div className="absolute bottom-5 inset-x-0 z-10 flex flex-col items-center gap-2 px-4">
              {overlayTitle}
              {igIcon}
            </div>
          </div>
        )}
        {(bioNode || header?.showSocials !== false) && (
          <div className="space-y-2 max-w-xl mx-auto">
            {bioNode}
            {header?.showSocials !== false && (
              <SocialLinks
                links={Object.fromEntries(Object.entries(profile?.socialLinks || {}).filter(([k]) => k !== 'instagram'))}
                socialStyle={social.style}
                colors={colors}
                tokens={tokens}
                editor={editor}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center gap-3 pt-2">
      {showAvatar && (
        !hasCustomAvatar && themeId === 'vox' ? (
          <div className="relative overflow-hidden w-48 h-20 shadow-md ring-2 ring-red-900/30 flex items-center justify-center shrink-0 rounded-xl">
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          </div>
        ) : !hasCustomAvatar && (themeId === 'sweat' || themeId === 'encore') ? (
          <div className="relative overflow-hidden w-full max-w-[340px] h-36 sm:h-44 shadow-md ring-1 ring-white/10 flex items-center justify-center shrink-0 rounded-2xl">
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          </div>
        ) : !hasCustomAvatar && themeId === 'nourish' ? (
          <div className="relative overflow-hidden h-24 w-24 sm:h-28 sm:w-28 shadow-sm ring-2 ring-white/20 bg-[#465328] flex items-center justify-center shrink-0 rounded-full">
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="relative overflow-hidden h-20 w-20 sm:h-24 sm:w-24 shadow-xs ring-2 ring-black/5 dark:ring-white/10 bg-slate-100 dark:bg-zinc-800/80 flex items-center justify-center shrink-0 rounded-full">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl sm:text-3xl font-extrabold uppercase select-none opacity-70" style={{ color: colors.text }}>
                {String(name).replace(/^@/, '').slice(0, 1)}
              </span>
            )}
          </div>
        )
      )}
      {(titleNode || bioNode) && (
        <div className="space-y-1 w-full mx-auto">
          {titleNode}
          {bioNode}
        </div>
      )}
      <SocialLinks links={profile?.socialLinks} socialStyle={social.style} colors={colors} tokens={tokens} editor={editor} />
    </div>
  )
}

/* ---------------- Structural Product Card Variants (5 Premium Themes) ---------------- */
function ProductCard({ product, tokens, username, editor, ctaOverride, onProductClick }) {
  const { colors, typography, layout, cards, buttons, header } = tokens
  const href = username ? `/${username}/${product.slug}` : `/checkout/${product.id}`

  const isDraft = editor && product.status !== 'PUBLISHED'

  const Wrapper = ({ children }) =>
    editor ? (
      <div
        className="w-full relative group h-full min-w-0 cursor-pointer"
        onClick={() => onProductClick?.(product)}
      >
        {isDraft && (
          <span className="absolute top-2.5 right-2.5 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider z-20 shadow-md">
            DRAFT
          </span>
        )}
        {children}
      </div>
    ) : (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onProductClick?.(product)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onProductClick?.(product)
          }
        }}
        className="w-full block group h-full min-w-0 cursor-pointer text-left"
      >
        {children}
      </div>
    )

  const hasDiscount = product.originalPrice && Number(product.originalPrice) > Number(product.price)
  const isCoaching = product.type === 'COACHING'
  const isBundle = product.type === 'BUNDLE'
  const bundleCount = product.productCount || product.bundleProducts?.length || product.bundleItems?.length || 0
  const defaultCta = isBundle
    ? (Number(product.price) === 0 ? 'Get Bundle Free' : (ctaOverride || 'Get Bundle'))
    : isCoaching
    ? (Number(product.price) === 0 ? 'Book Free' : (ctaOverride || 'Book Session'))
    : (Number(product.price) === 0 ? 'Get it Free' : (ctaOverride || 'Get it'))

  const discountPct = hasDiscount
    ? Math.round(((Number(product.originalPrice) - Number(product.price)) / Number(product.originalPrice)) * 100)
    : 0

  const priceDisplay = Number(product.price) === 0 ? 'Free' : formatMoney(product.price, product.currency)
  const origPriceDisplay = product.originalPrice ? formatMoney(product.originalPrice, product.currency) : null
  const cardRadius = storefrontCardRadiusCss ? storefrontCardRadiusCss(tokens) : '20px'
  const resolvedThumbnail = product.thumbnail || (isBundle ? (product.bundleProducts?.find(bp => bp?.thumbnail)?.thumbnail || product.bundleItems?.find(bi => bi?.product?.thumbnail)?.product?.thumbnail) : null)

  // 1. MINIMAL CARD (Minimal Theme)
  if (layout.productCardStyle === 'flat-minimal' || tokens.presetId === 'minimal') {
    const cardBg = tokens?.adaptivePalette?.productCard?.background || tokens?.semantic?.surfaceBackground || cards.bg || '#FFFFFF'
    const cardTitleColor = tokens?.adaptivePalette?.productCard?.text || tokens?.semantic?.primaryText || getAccessibleTextColor(cardBg, null, 4.5)
    const cardMutedColor = tokens?.adaptivePalette?.productCard?.mutedText || tokens?.semantic?.mutedText || getAccessibleMutedTextColor(cardBg)

    return (
      <Wrapper>
        <div
          className="p-3.5 sm:p-4 transition-all duration-200 border border-slate-200/80 bg-white hover:border-slate-300 rounded-2xl flex flex-col justify-between h-full gap-3 overflow-hidden shadow-xs hover:scale-[1.01] active:scale-[0.99]"
          style={{
            borderRadius: cardRadius,
            border: cards.border || '1px solid rgba(0,0,0,0.08)',
            background: cardBg,
          }}
        >
          <ProductThumbnail
            thumbnail={resolvedThumbnail}
            title={product.title}
            type={product.type}
            price={product.price}
            theme="minimal"
            aspect="aspect-[16/10]"
          />
          <div className="space-y-2 flex-1 min-w-0">
            {isBundle ? (
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800">
                    <Layers className="h-3 w-3 shrink-0" />
                    Bundle{bundleCount > 0 ? ` · ${bundleCount} ${bundleCount === 1 ? 'item' : 'items'}` : ''}
                  </span>
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-sm sm:text-base font-extrabold" style={{ color: cardTitleColor }}>{priceDisplay}</span>
                    {origPriceDisplay && <span className="text-xs font-semibold line-through opacity-60" style={{ color: cardMutedColor }}>{origPriceDisplay}</span>}
                  </div>
                </div>
                <h3 className="text-sm sm:text-base font-bold leading-snug break-words line-clamp-2" style={{ color: cardTitleColor }}>{product.title}</h3>
                {product.shortDescription && (
                  <p className="text-xs line-clamp-2 leading-relaxed break-words opacity-75" style={{ color: cardMutedColor }}>{product.shortDescription}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-bold leading-snug break-words line-clamp-2" style={{ color: cardTitleColor }}>{product.title}</h3>
                {product.shortDescription && (
                  <p className="text-xs line-clamp-2 leading-relaxed break-words opacity-75" style={{ color: cardMutedColor }}>{product.shortDescription}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-auto min-w-0">
            {!isBundle && (
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-sm sm:text-base font-extrabold" style={{ color: cardTitleColor }}>{priceDisplay}</span>
                {origPriceDisplay && <span className="text-xs font-semibold line-through opacity-60" style={{ color: cardMutedColor }}>{origPriceDisplay}</span>}
              </div>
            )}
            <ProductCtaButton label={defaultCta} cardBg={cardBg} tokens={tokens} fullWidth={isBundle} />
          </div>
        </div>
      </Wrapper>
    )
  }

  // 2. LUXURY CARD (Luxury Theme)
  if (layout.productCardStyle === 'luxury-card' || tokens.presetId === 'luxury') {
    return (
      <Wrapper>
        <div
          className="p-3.5 sm:p-4 flex flex-col justify-between h-full gap-3 transition-all duration-200 border border-slate-800/80 bg-[#111827] rounded-2xl hover:border-[#D4AF37]/50 shadow-sm overflow-hidden hover:scale-[1.01] active:scale-[0.99]"
          style={{
            borderRadius: cardRadius,
            boxShadow: cards.shadow || '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <ProductThumbnail
            thumbnail={resolvedThumbnail}
            title={product.title}
            type={product.type}
            price={product.price}
            hasDiscount={hasDiscount}
            discountPct={discountPct}
            theme="luxury"
            aspect="aspect-[16/10]"
          />
          <div className="space-y-2 flex-1 min-w-0">
            {isBundle ? (
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37]">
                    <Layers className="h-3 w-3 shrink-0" />
                    Bundle{bundleCount > 0 ? ` · ${bundleCount} ${bundleCount === 1 ? 'item' : 'items'}` : ''}
                  </span>
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-base sm:text-lg font-bold text-[#D4AF37]">{priceDisplay}</span>
                    {origPriceDisplay && <span className="text-xs text-[rgba(244,242,236,0.6)] line-through">{origPriceDisplay}</span>}
                  </div>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6] leading-snug break-words line-clamp-2" style={{ fontFamily: typography.headingFont }}>
                  {product.title}
                </h3>
                {product.shortDescription && (
                  <p className="text-xs text-[rgba(244,242,236,0.65)] line-clamp-2 leading-relaxed break-words">{product.shortDescription}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6] leading-snug break-words line-clamp-2" style={{ fontFamily: typography.headingFont }}>
                  {product.title}
                </h3>
                {product.shortDescription && (
                  <p className="text-xs text-[rgba(244,242,236,0.65)] line-clamp-2 leading-relaxed break-words">{product.shortDescription}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 mt-auto min-w-0">
            {!isBundle && (
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-base sm:text-lg font-bold text-[#D4AF37]">{priceDisplay}</span>
                {origPriceDisplay && <span className="text-xs text-[rgba(244,242,236,0.6)] line-through">{origPriceDisplay}</span>}
              </div>
            )}
            <ProductCtaButton label={defaultCta} cardBg="#111827" tokens={tokens} fullWidth={isBundle} />
          </div>
        </div>
      </Wrapper>
    )
  }

  // 3. MIDNIGHT DARK CARD (Dark Theme)
  if (layout.productCardStyle === 'midnight-dark' || tokens.presetId === 'dark') {
    return (
      <Wrapper>
        <div
          className="p-3.5 sm:p-4 flex flex-col justify-between h-full gap-3 transition-all duration-200 border border-[#27272A] bg-[#18181B] rounded-2xl hover:border-slate-600 shadow-sm overflow-hidden hover:scale-[1.01] active:scale-[0.99]"
          style={{
            borderRadius: cardRadius,
            boxShadow: cards.shadow || '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {isBundle ? (
            <div className="space-y-3">
              <ProductThumbnail
                thumbnail={resolvedThumbnail}
                title={product.title}
                type={product.type}
                aspect="aspect-[16/10]"
                theme="dark"
              />
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/10 text-white">
                    <Layers className="h-3 w-3 shrink-0" />
                    Bundle{bundleCount > 0 ? ` · ${bundleCount} items` : ''}
                  </span>
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-base sm:text-lg font-black text-white">{priceDisplay}</span>
                    {origPriceDisplay && <span className="text-xs font-bold text-[rgba(244,242,236,0.6)] line-through">{origPriceDisplay}</span>}
                  </div>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white leading-snug break-words line-clamp-2">{product.title}</h3>
                {product.shortDescription && (
                  <p className="text-xs text-[rgba(244,242,236,0.6)] line-clamp-2 leading-relaxed break-words">{product.shortDescription}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3.5">
                <ProductThumbnail
                  thumbnail={resolvedThumbnail}
                  title={product.title}
                  type={product.type}
                  aspect="w-14 h-14"
                  theme="dark"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-white leading-snug break-words line-clamp-2">{product.title}</h3>
                  {product.shortDescription && (
                    <p className="text-xs text-[rgba(244,242,236,0.6)] line-clamp-2 leading-relaxed break-words">{product.shortDescription}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-base sm:text-lg font-black text-white">{priceDisplay}</span>
                  {origPriceDisplay && <span className="text-xs font-bold text-[rgba(244,242,236,0.6)] line-through">{origPriceDisplay}</span>}
                </div>
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded-md text-xs font-bold text-slate-200 shrink-0">
                  <Star className="h-3 w-3 fill-white text-white" /> 5.0
                </div>
              </div>
            </>
          )}

          <div className="mt-auto pt-1">
            <ProductCtaButton label={defaultCta} cardBg="#18181B" tokens={tokens} fullWidth />
          </div>
        </div>
      </Wrapper>
    )
  }

  // 4. EDITORIAL ASYMMETRIC CARD (Editorial Theme)
  if (layout.productCardStyle === 'editorial-asymmetric' || tokens.presetId === 'editorial') {
    return (
      <Wrapper>
        <div
          className="p-3.5 sm:p-4 flex flex-col justify-between h-full gap-3 transition-all duration-200 border border-[#E7E5E4] bg-white hover:border-stone-400 rounded-2xl shadow-xs overflow-hidden hover:scale-[1.01] active:scale-[0.99]"
          style={{
            borderRadius: cardRadius,
          }}
        >
          <div className="flex flex-col sm:flex-row gap-3.5 items-start flex-1 min-w-0">
            <ProductThumbnail
              thumbnail={resolvedThumbnail}
              title={product.title}
              type={product.type}
              aspect="w-full sm:w-2/5 aspect-[16/10] sm:aspect-[4/4.5]"
              theme="editorial"
            />
            <div className="flex-1 space-y-1.5 min-w-0 flex flex-col justify-between h-full">
              <div>
                {isBundle && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-800 mb-1">
                    <Layers className="h-3 w-3 shrink-0" />
                    Bundle{bundleCount > 0 ? ` · ${bundleCount} items` : ''}
                  </span>
                )}
                <h3 className="text-sm sm:text-base font-semibold tracking-tight leading-snug break-words line-clamp-2" style={{ fontFamily: typography.headingFont, color: colors.text }}>
                  {product.title}
                </h3>
                {product.shortDescription && (
                  <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed break-words pt-0.5">{product.shortDescription}</p>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="text-sm sm:text-base font-bold italic" style={{ color: colors.text }}>{priceDisplay}</span>
                {origPriceDisplay && <span className="text-xs text-stone-400 line-through italic">{origPriceDisplay}</span>}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-stone-100 mt-auto">
            <ProductCtaButton label={defaultCta} cardBg="#FFFFFF" tokens={tokens} fullWidth />
          </div>
        </div>
      </Wrapper>
    )
  }

  // 5. CREATOR CLASSIC CARD (Creator Theme)
  const isLight = tokens?.contrast?.isLight ?? false
  const semantic = tokens?.semantic || {}
  const cardBg = (header?.layout === 'immersive' && tokens?.contrast?.surface)
    ? tokens.contrast.surface
    : (tokens?.adaptivePalette?.productCard?.background || semantic.surfaceBackground || cards.bg || (isLight ? '#FFFFFF' : '#12141A'))
  const cardTitleColor = (header?.layout === 'immersive' && tokens?.contrast?.text)
    ? tokens.contrast.text
    : (tokens?.adaptivePalette?.productCard?.text || semantic.primaryText || getAccessibleTextColor(cardBg, null, 4.5))
  const cardMutedColor = (header?.layout === 'immersive' && tokens?.contrast?.textSecondary)
    ? tokens.contrast.textSecondary
    : (tokens?.adaptivePalette?.productCard?.mutedText || semantic.mutedText || getAccessibleMutedTextColor(cardBg))
  const cardBorder = (header?.layout === 'immersive' && tokens?.contrast?.border)
    ? `1px solid ${tokens.contrast.border}`
    : (tokens?.adaptivePalette?.productCard?.border || (semantic.borderColor ? `1px solid ${semantic.borderColor}` : (cards.border || (isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)'))))

  return (
    <Wrapper>
      <div
        className="overflow-hidden flex flex-col justify-between h-full transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] rounded-2xl shadow-xs border text-left p-3.5 sm:p-4 gap-3"
        style={{
          borderRadius: cardRadius,
          background: cardBg,
          border: cardBorder,
          boxShadow: cards.shadow || semantic.cardShadow || '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <ProductThumbnail
          thumbnail={resolvedThumbnail}
          title={product.title}
          type={product.type}
          aspect="aspect-[16/10]"
          price={product.price}
          hasDiscount={hasDiscount}
          discountPct={discountPct}
          theme={isLight ? 'minimal' : 'creator'}
        />
        <div className="space-y-2 flex flex-col justify-between flex-1 min-w-0">
          {isBundle ? (
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: tokens?.adaptivePalette?.productCard?.badgeBg || (isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)'),
                    color: tokens?.adaptivePalette?.productCard?.badgeText || (isLight ? '#0F172A' : '#F8FAFC'),
                    border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.16)',
                  }}
                >
                  <Layers className="h-3 w-3 shrink-0" />
                  Bundle{bundleCount > 0 ? ` · ${bundleCount} ${bundleCount === 1 ? 'product' : 'products'}` : ''}
                </span>
                <div className="shrink-0 text-right font-extrabold text-base sm:text-lg tracking-tight" style={{ color: tokens?.adaptivePalette?.productCard?.priceText || cardTitleColor }}>
                  <div>{priceDisplay}</div>
                  {origPriceDisplay && <div className="text-[11px] font-semibold line-through opacity-60" style={{ color: cardMutedColor }}>{origPriceDisplay}</div>}
                </div>
              </div>
              <h3 className="text-sm sm:text-base font-bold tracking-tight leading-snug line-clamp-2 break-words" style={{ color: cardTitleColor }}>
                {product.title}
              </h3>
              {product.shortDescription && (
                <p className="text-xs line-clamp-2 leading-relaxed break-words opacity-75" style={{ color: cardMutedColor }}>
                  {product.shortDescription}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                <h3 className="text-sm sm:text-base font-bold tracking-tight leading-snug line-clamp-2 break-words" style={{ color: cardTitleColor }}>
                  {product.title}
                </h3>
                {product.shortDescription && (
                  <p className="text-xs line-clamp-2 leading-relaxed break-words opacity-75" style={{ color: cardMutedColor }}>
                    {product.shortDescription}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right font-bold text-sm sm:text-base" style={{ color: cardTitleColor }}>
                <div>{priceDisplay}</div>
                {origPriceDisplay && <div className="text-[11px] font-semibold line-through opacity-60" style={{ color: cardMutedColor }}>{origPriceDisplay}</div>}
              </div>
            </div>
          )}
          <div className="mt-auto pt-1">
            <ProductCtaButton label={defaultCta} cardBg={cardBg} tokens={tokens} fullWidth />
          </div>
        </div>
      </div>
    </Wrapper>
  )
}

export { ClassicLinkPill }

function stripTrailingArrow(str) {
  if (!str) return ''
  return String(str).replace(/(\s|[→➜➡]|->|–>)+$/, '').trim()
}

/* ---------------- Product CTA Button Component ---------------- */
export function ProductCtaButton({ label = 'Get the Guide', cardBg, tokens, fullWidth = true }) {
  const ctaStyles = getProductCtaStyles(cardBg, tokens)
  // Clean label to ensure only a single arrow icon is rendered
  const cleanLabel = stripTrailingArrow(label) || 'Get the Guide'
  const btnRadius = buttonRadiusCss ? buttonRadiusCss(tokens?.buttons) : '8px'
  const btnShadow = tokens?.buttons?.shadow === 'none'
    ? 'none'
    : (tokens?.buttons ? buttonShadowCss(tokens.buttons.shadow, tokens.buttons.shadowColor) : ctaStyles.shadow)

  return (
    <div
      className={`group/cta flex items-center justify-center gap-2 w-full h-[40px] sm:h-[42px] font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer select-none shrink-0 ${
        fullWidth ? 'w-full' : ''
      }`}
      style={{
        borderRadius: btnRadius,
        background: ctaStyles.background,
        color: ctaStyles.color,
        border: ctaStyles.border,
        boxShadow: btnShadow,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = ctaStyles.hoverBackground
        e.currentTarget.style.border = ctaStyles.hoverBorder
        e.currentTarget.style.boxShadow = ctaStyles.hoverShadow || btnShadow
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = ctaStyles.background
        e.currentTarget.style.border = ctaStyles.border
        e.currentTarget.style.boxShadow = btnShadow
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <span className="truncate">{cleanLabel}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover/cta:translate-x-0.5" style={{ color: ctaStyles.iconColor }} />
    </div>
  )
}

/* ---------------- Reusable Button Component ---------------- */
function StyledButton({ label, tokens, fullWidth = false }) {
  const { colors, buttons } = tokens
  const radius = buttonRadiusCss(buttons)
  const cleanLabel = stripTrailingArrow(label)

  if (buttons.style === 'creator-tactile') {
    const btnBg = buttons.color || colors.buttonColor || '#194DF5'
    const btnTxt = buttons.textColor || colors.buttonText || '#000000'

    return (
      <div className={`group/btn relative inline-block transition-transform duration-200 cursor-pointer shrink-0 max-w-full ${fullWidth ? 'w-full' : ''}`}>
        <div
          className="w-full inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-black uppercase tracking-wider border border-black transition-transform duration-200 group-hover/btn:-translate-x-1 group-hover/btn:-translate-y-1 shadow-xs whitespace-nowrap min-h-[40px] max-w-full overflow-hidden text-ellipsis"
          style={{ borderRadius: radius, background: btnBg, color: btnTxt }}
        >
          <span className="truncate">{cleanLabel}</span>
          {buttons.iconArrow !== false && <ArrowRight className="h-4 w-4 shrink-0" />}
        </div>
        <div
          className="absolute inset-0 bg-[#CBE957] border border-black -z-10 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-200"
          style={{ borderRadius: radius, transform: 'translate(4px, 4px)' }}
        />
        <div
          className="absolute inset-0 bg-[#F0441E] border border-black -z-20 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-200"
          style={{ borderRadius: radius, transform: 'translate(8px, 8px)' }}
        />
      </div>
    )
  }

  const btnStyle = buttonFaceStyle(tokens)

  return (
    <div
      className={`inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm ${buttons.textTransform || 'font-bold'} transition-all hover:opacity-90 hover:scale-[1.01] whitespace-nowrap min-h-[40px] shrink-0 max-w-full ${fullWidth ? 'w-full' : ''
        }`}
      style={btnStyle}
    >
      <span className="truncate">{cleanLabel}</span>
      {buttons.iconArrow !== false && <ArrowRight className="h-4 w-4 shrink-0" />}
    </div>
  )
}

/* ---------------- Social Links Component ---------------- */
function SocialLinks({ links = {}, socialStyle = 'pills', colors, tokens, editor }) {
  const entries = Object.entries(links || {}).filter(([, v]) => v)
  if (!entries.length) return null

  const isLight = tokens?.contrast?.isLight ?? (colors?.background ? isLightColor(colors.background) : false)
  const textColor = tokens?.contrast?.foreground || colors?.text || (isLight ? '#0F172A' : '#FFFFFF')

  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
      {entries.map(([key, val]) => {
        const Icon = SOCIAL_ICONS[key] || Globe
        const strVal = typeof val === 'string' ? val : ''
        const href = strVal.startsWith('http') ? strVal : `https://${strVal}`

        const semantic = tokens?.semantic || {}
        let circleStyle = {
          background: semantic.surfaceElevated || (isLight ? '#F4F4F4' : '#1A1A1A'),
          color: semantic.iconColor || semantic.primaryText || (isLight ? '#0F172A' : '#D4D4D8'),
          border: `1px solid ${semantic.borderColor || (isLight ? '#E5E5E5' : '#2E2E2E')}`,
        }

        if (socialStyle === 'filled-dark') {
          circleStyle = { background: '#1E293B', color: '#FFFFFF', border: 'none' }
        } else if (socialStyle === 'outlined-dark') {
          circleStyle = isLight
            ? { background: '#FFFFFF', color: '#0F172A', border: '1px solid rgba(0, 0, 0, 0.20)' }
            : { background: '#121212', color: '#FFFFFF', border: '1px solid #333333' }
        } else if (socialStyle === 'glass') {
          circleStyle = isLight
            ? { background: '#F4F4F4', color: '#0F172A', border: '1px solid #E5E5E5' }
            : { background: '#1A1A1A', color: '#D4D4D8', border: '1px solid #2E2E2E' }
        } else if (socialStyle === 'editorial-ring') {
          circleStyle = { background: 'transparent', color: textColor, border: `1px solid ${textColor}` }
        } else if (socialStyle === 'soft-peach') {
          circleStyle = { background: '#F5EBE0', color: '#44403C', border: 'none' }
        }

        const iconNode = (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full shadow-xs hover:scale-105 transition-transform"
            style={circleStyle}
          >
            <Icon className="h-4 w-4" />
          </span>
        )

        return editor ? <span key={key}>{iconNode}</span> : <a key={key} href={href} target="_blank" rel="noreferrer">{iconNode}</a>
      })}
    </div>
  )
}
