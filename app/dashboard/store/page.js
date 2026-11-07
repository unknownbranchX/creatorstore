'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import { api, formatMoney } from '@/lib/clientApi'
import { useDashboard } from '@/components/dashboard/DashboardContext'
import { useDashboardHeader } from '@/components/dashboard/HeaderContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BaseModal, ModalFooterActions } from '@/components/ui/base-modal'
import { TextInput } from '@/components/ui/text-input'
import { SelectableCard, SelectableCardGrid } from '@/components/ui/selectable-card'
import { Switch } from '@/components/ui/switch'
import { CreatorStoreMark } from '@/components/brand/CreatorStoreBrand'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'
import {
  Loader2, Plus, Trash2, Copy, Eye, EyeOff, GripVertical, Smartphone, Monitor,
  User, Type, AlignLeft, MousePointerClick, Image as ImageIcon, Package, Grid3x3,
  Share2, Minus, Check, Rocket, ExternalLink, Palette, Settings2, Cloud, CloudOff, Sparkles,
  ChevronDown, ChevronUp, ChevronRight, CheckCircle2, Layers, Camera, Instagram, Search, ArrowRight,
  ShoppingBag, Video, FileText, Link2, X, Upload, ArrowLeft, AlertCircle, Edit3, Folder, FolderPlus, MoveUp, MoveDown,
  Pencil, ClipboardList, Mail, Star, Send, HelpCircle, Play, Images, Headphones, Music, GraduationCap,
  MoreVertical, Archive, SlidersHorizontal, Users, Wrench, Power, Globe, Youtube, Zap, Calendar, Music2, PlayCircle
} from 'lucide-react'
import AddFormConfig, { FORM_TYPES } from '@/components/dashboard/AddFormConfig'
import AddMediaConfig from '@/components/dashboard/AddMediaConfig'
import { STORE_PRESETS, STORE_LAYOUTS, STORE_TEMPLATES, LEGACY_THEME_ALIASES } from '@/lib/themePresets'
import { resolveCreatorPlan, PLAN_FEATURES } from '@/lib/plans'
import {
  ROUNDNESS_PRESETS,
  roundnessKeyFromTheme,
  shadowKeyFromTheme,
  styleKeyFromTheme,
} from '@/lib/storefrontLayout'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import StorePreview from '@/components/storefront/StorePreview'
import LinkLayoutPicker from '@/components/dashboard/LinkLayoutPicker'
import AddToStoreMenuView from '@/components/dashboard/AddToStoreMenuView'
import {
  trackStorePublished,
  trackStoreUpdated,
  trackStoreDesignUpdated,
  trackStoreLinkAdded,
  trackProductCreated,
  trackProductPublished,
} from '@/lib/analytics'
import StorefrontThemeGallery from '@/components/dashboard/StorefrontThemeGallery'
import { getGalleryTheme, getGalleryThemeId, wallpaperStyleFromTheme, STOREFRONT_GALLERY_THEMES, themePatchFromGallery } from '@/lib/storefront-themes'
import ThemePanel from '@/components/dashboard/design/ThemePanel'
import WallpaperPanel from '@/components/dashboard/design/WallpaperPanel'
import TextPanel from '@/components/dashboard/design/TextPanel'
import ColorsPanel from '@/components/dashboard/design/ColorsPanel'
import ButtonsPanel from '@/components/dashboard/design/ButtonsPanel'
import HeaderPanel from '@/components/dashboard/design/HeaderPanel'
import PanelHeader from '@/components/dashboard/design/PanelHeader'
import ThemeMatchModal from '@/components/dashboard/design/ThemeMatchModal'
import { extractImagePalette } from '@/lib/imageContrast'
import StorefrontStatusCard from '@/components/dashboard/StorefrontStatusCard'
import ProductEditor from '@/components/products/ProductEditor'
import GalleryEditor from '@/components/dashboard/editors/GalleryEditor'
import LinkEditor from '@/components/dashboard/editors/LinkEditor'
import CollectionEditor from '@/components/dashboard/editors/CollectionEditor'
import MediaEditor from '@/components/dashboard/editors/MediaEditor'
import BookingEditor from '@/components/dashboard/editors/BookingEditor'
import HeadingEditor from '@/components/dashboard/editors/HeadingEditor'
import TextBlockEditor from '@/components/dashboard/editors/TextBlockEditor'
import YouTubeEditor from '@/components/dashboard/editors/YouTubeEditor'
import MediaContentEditor from '@/components/dashboard/editors/MediaContentEditor'
import AddYouTubeModalView from '@/components/dashboard/AddYouTubeModalView'
import AddMediaModalView from '@/components/dashboard/AddMediaModalView'
import SocialDisplaySelectModalView from '@/components/dashboard/SocialDisplaySelectModalView'
import SocialItemEditor from '@/components/dashboard/editors/SocialItemEditor'
import MobileStoreDashboard from '@/components/dashboard/MobileStoreDashboard'
import { getSocialPlatform, resolveSocialStyle } from '@/lib/socialPlatforms'
import { isBookingItem, isBundleItem, resolveSectionProduct } from '@/lib/bookingItemUtils'
export { isBookingItem, isBundleItem, resolveSectionProduct }
import BundleEditor from '@/components/dashboard/editors/BundleEditor'
import ProductBundleModal from '@/components/dashboard/ProductBundleModal'
import { IconBadge, ICON_BADGE_COLORS } from '@/components/ui/icon-badge'
import { AddOptionRow, SettingsRow, SettingsValuePill } from '@/components/ui/settings-row'
import CoachingBookingWizardModal, { CoachingBookingWizardContent } from '@/components/coaching/CoachingBookingWizardModal'
import DashboardPageTransition from '@/components/dashboard/DashboardPageTransition'
import { getPreviewButtonStyles } from '@/lib/colorContrast'
import { isThemeDirty } from '@/lib/themeComparison'

const QRCodeCanvas = dynamic(() => import('qrcode.react').then((m) => m.QRCodeCanvas), { ssr: false })

// One-shot consume of `?add=` from Earn Overview so remounts don't reopen
// the wizard (React Strict Mode) and a refresh doesn't start another one.
let consumedAddIntent = null



function toPreviewProduct(p) {
  const bundleProductIds = p.bundleProductIds || p.bundleItems?.map((bi) => bi.productId) || p.productIds || []
  const bundleProducts = p.bundleProducts || p.bundleItems?.map((bi) => bi.product).filter(Boolean) || []
  return {
    id: p.id,
    courseId: p.courseId || (p.type === 'COURSE' || String(p.type).toLowerCase() === 'course' ? (p.courseId || p.id) : null),
    creatorId: p.creatorId,
    title: p.title,
    slug: p.slug,
    type: p.type || 'DIGITAL_DOWNLOAD',
    status: p.status,
    price: Number(p.price || 0),
    originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
    currency: p.currency || 'INR',
    shortDescription: p.shortDescription || p.description || '',
    description: p.description || '',
    thumbnail: p.thumbnail || p.coverImage || null,
    bundleItems: p.bundleItems || [],
    bundleProducts,
    bundleProductIds,
    productIds: bundleProductIds,
    productCount: bundleProducts.length || p.productCount || bundleProductIds.length || 0,
    fileId: p.fileId || p.files?.[0]?.id || null,
    fileName: p.fileName || p.files?.[0]?.name || null,
    fileSize: p.fileSize || p.files?.[0]?.size || null,
    files: p.files || (p.fileId ? [{ id: p.fileId, name: p.fileName, size: p.fileSize }] : []),
    redirectUrl: p.redirectUrl || null,
    displayMode: p.displayMode || 'classic',
    customFields: p.customFields || [],
    supportEmail: p.supportEmail || null,
    customTermsEnabled: p.customTermsEnabled || false,
    customTerms: p.customTerms || '',
    mailingListOptIn: p.mailingListOptIn ?? true,
  }
}

const COMPONENTS = [
  { type: 'heading', label: 'Heading', icon: Type },
  { type: 'text', label: 'Text', icon: AlignLeft },
  { type: 'button', label: 'Button', icon: MousePointerClick },
  { type: 'product', label: 'Product', icon: Package },
  { type: 'product_grid', label: 'Product Grid', icon: Grid3x3 },
  { type: 'collection', label: 'Collection', icon: Layers },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'social_links', label: 'Socials', icon: Share2 },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'form', label: 'Form', icon: ClipboardList },
  { type: 'video', label: 'Video', icon: Play },
  { type: 'youtube', label: 'YouTube', icon: Video },
  { type: 'gallery', label: 'Image Gallery', icon: Images },
  { type: 'audio', label: 'Audio', icon: Headphones },
  { type: 'pdf', label: 'PDF Display', icon: FileText },
  { type: 'booking', label: 'Bookings', icon: Calendar },
]
const ICONS = {
  ...Object.fromEntries(COMPONENTS.map((c) => [c.type, c.icon])),
  profile: User,
  heading_text: Type,
  text_block: AlignLeft,
  paragraph_text: AlignLeft,
  product_collection: Layers,
  booking: Calendar,
  bookings: Calendar,
  coaching: Calendar,
  session: Calendar,
  sessions: Calendar,
  calendar: Calendar,
  youtube: Youtube,
  tiktok: Music2,
  vimeo: PlayCircle,
  video: Play,
}
const LABELS = {
  ...Object.fromEntries(COMPONENTS.map((c) => [c.type, c.label])),
  profile: 'Profile',
  heading_text: 'Heading',
  text: 'Text block',
  text_block: 'Text block',
  paragraph_text: 'Text block',
  product_collection: 'Collection',
  booking: 'Bookings',
  bookings: 'Bookings',
  coaching: 'Bookings',
  session: 'Bookings',
  sessions: 'Bookings',
  youtube: 'YouTube',
  tiktok: 'TikTok Video',
  vimeo: 'Vimeo',
  video: 'Video',
  social: 'Social Link',
  instagram: 'Instagram',
}

function defaultProps(type, products = []) {
  switch (type) {
    case 'profile': return {}
    case 'heading':
    case 'heading_text': return { text: 'Welcome to my store', align: 'center' }
    case 'text':
    case 'text_block':
    case 'paragraph_text': return { text: 'Explore my exclusive digital products.', content: 'Explore my exclusive digital products.', align: 'left' }
    case 'button': return { label: 'Follow me', url: '', layout: 'classic' }
    case 'social':
    case 'instagram': return {
      platform: 'instagram',
      title: 'Instagram',
      label: 'Instagram',
      url: '',
      layout: 'classic',
      displayMode: 'classic',
      thumbnail: null,
      customThumbnail: null,
    }
    case 'image': return { url: '', alt: '' }
    case 'product': return { productId: products[0]?.id, layout: 'classic' }
    case 'booking':
    case 'bookings':
    case 'coaching':
    case 'session':
    case 'calendar': return {
      productId: products.find((p) => String(p.type || '').toUpperCase() === 'COACHING')?.id || products[0]?.id || null,
      title: 'Book a session',
      layout: 'classic',
      displayMode: 'classic',
    }
    case 'product_grid': return { source: 'all' }
    case 'collection':
    case 'product_collection': return { title: 'New Collection', layout: 'list', displayMode: 'list', items: [] }
    case 'social_links': return { links: {} }
    case 'form': return {
      formType: 'contact',
      title: 'Get in Touch',
      subtitle: 'Have a question or proposal? Send me a direct message.',
      buttonText: 'Send Message',
      notificationEmail: '',
      successMessage: 'Thank you! Your message has been sent successfully.',
    }
    case 'youtube': return {
      url: '',
      title: 'YouTube Video',
      caption: '',
      embedType: 'youtube',
      mediaType: 'youtube',
      thumbnail: null,
      customThumbnail: null,
      layout: 'classic',
      displayMode: 'classic',
    }
    case 'tiktok': return {
      url: '',
      title: 'TikTok Video',
      caption: '',
      embedType: 'tiktok',
      mediaType: 'tiktok',
      thumbnail: null,
      customThumbnail: null,
      layout: 'classic',
      displayMode: 'classic',
    }
    case 'vimeo': return {
      url: '',
      title: 'Vimeo Video',
      caption: '',
      embedType: 'vimeo',
      mediaType: 'vimeo',
      thumbnail: null,
      customThumbnail: null,
      layout: 'classic',
      displayMode: 'classic',
    }
    case 'video': return {
      url: '',
      title: 'Featured Video',
      caption: '',
      embedType: 'generic',
      mediaType: 'video',
      embedUrl: null,
      thumbnail: null,
      customThumbnail: null,
      layout: 'classic',
      displayMode: 'classic',
    }
    case 'gallery': return {
      title: 'Image Gallery',
      caption: '',
      images: [],
    }
    case 'audio': return {
      url: '',
      title: 'Audio Track',
      caption: '',
      embedType: 'generic',
      embedUrl: null,
    }
    case 'pdf': return {
      url: '',
      fileName: 'Document.pdf',
      fileSize: '',
      title: 'PDF Document',
      caption: '',
    }
    default: return {}
  }
}

function CollectionContentCard({
  s,
  itemIdx,
  selectedId,
  setSelectedId,
  products = [],
  dragControls,
  updateCollectionProps,
  addItemToCollection,
  removeItemFromCollection,
  moveItemInCollection,
  toggleHidden,
  remove,
  duplicate,
  moveSectionUp,
  movingUpId,
  isFirst,
  setEditingCollection,
  setEditingSectionId,
  setAddContentModalOpen,
  setAddContentType,
  isDropTarget = false,
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(s.props?.title || 'New Collection')
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setTitleInput(s.props?.title || 'New Collection')
  }, [s.props?.title])

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingTitle])

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim()
    const finalTitle = trimmed || s.props?.title || 'New Collection'
    setTitleInput(finalTitle)
    if (typeof updateCollectionProps === 'function') {
      updateCollectionProps(s.id, { title: finalTitle })
    }
    setIsEditingTitle(false)
  }

  const rawLayout = s.props?.displayMode || s.props?.layout || 'list'
  const activeLayout = (rawLayout === 'stack' || !rawLayout) ? 'list' : rawLayout
  const items = Array.isArray(s.props?.items) ? s.props.items : []

  const LAYOUT_OPTIONS = [
    {
      id: 'list',
      label: 'List',
      icon: (
        <svg className="w-5 h-4" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="1" width="18" height="4" rx="1.5" />
          <rect x="1" y="9" width="18" height="4" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'grid',
      label: 'Grid',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
          <rect x="9.5" y="1" width="5.5" height="5.5" rx="1" />
          <rect x="1" y="9.5" width="5.5" height="5.5" rx="1" />
          <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" />
        </svg>
      ),
    },
    {
      id: 'carousel',
      label: 'Carousel',
      icon: (
        <svg className="w-5 h-4" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5.5" y="1" width="9" height="12" rx="1.5" />
          <rect x="1" y="2.5" width="2.5" height="9" rx="0.75" />
          <rect x="16.5" y="2.5" width="2.5" height="9" rx="0.75" />
        </svg>
      ),
    },
    {
      id: 'showcase',
      label: 'Showcase',
      icon: (
        <svg className="w-5 h-4" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="1" width="18" height="14" rx="2" />
          <rect x="3.5" y="3.5" width="6" height="5" rx="1" />
          <line x1="12" y1="5" x2="16.5" y2="5" />
          <line x1="12" y1="8" x2="15" y2="8" />
          <line x1="3.5" y1="12" x2="16.5" y2="12" />
        </svg>
      ),
    },
  ]

  return (
    <Reorder.Item
      key={s.id}
      value={s}
      dragListener={false}
      dragControls={dragControls}
      data-collection-id={s.id}
      className={`group rounded-2xl border p-3.5 sm:p-4 transition-all w-full relative ${
        isDropTarget
          ? 'border-[#3B82F6] bg-[#F0F7FF] ring-2 ring-[#3B82F6]/30 shadow-md'
          : selectedId === s.id
            ? 'border-[#222222] ring-1 ring-[#222222] bg-[#FFFFFF] shadow-2xs'
            : 'border-[#E8E8E8] bg-[#FFFFFF] hover:border-[#D0D0CE] hover:shadow-2xs'
      }`}
    >
      {/* TOP HEADER ROW */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* DRAG HANDLE */}
          <div
            onPointerDown={(e) => {
              if (e.button !== undefined && e.button !== 0) return
              e.preventDefault()
              dragControls?.start(e)
            }}
            className="text-[#999995] hover:text-[#222222] cursor-grab active:cursor-grabbing shrink-0 transition-colors touch-none select-none p-1.5 -m-1 rounded"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* FOLDER ICON */}
          <div
            onClick={() => setEditingSectionId?.(s.id)}
            className="h-10 w-10 rounded-[12px] bg-[#F2F2F2] hover:bg-[#E8E8E8] text-[#222222] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            title="Edit collection"
          >
            <Folder className="h-5 w-5" />
          </div>

          {/* EDITABLE TITLE */}
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSaveTitle()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setTitleInput(s.props?.title || 'New Collection')
                    setIsEditingTitle(false)
                  }
                }}
                placeholder="Add collection title"
                className="h-8.5 px-2.5 w-full rounded-lg border border-[#E8E8E8] bg-white text-sm font-bold text-[#222222] focus:outline-none focus:border-[#222222] focus:ring-1 focus:ring-[#222222]"
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="h-8.5 w-8.5 rounded-lg bg-[#1F1F1F] hover:bg-black text-white flex items-center justify-center shrink-0 cursor-pointer shadow-xs transition-colors"
                title="Save title"
              >
                <Check className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => {
                setTitleInput(s.props?.title || '')
                setIsEditingTitle(true)
              }}
              className="flex items-center gap-2 cursor-pointer group/title flex-1 min-w-0 py-1"
              title="Click to edit collection title"
            >
              <h4 className={`text-sm sm:text-base font-bold text-[#222222] truncate group-hover/title:text-black ${s.hidden ? 'line-through text-[#999995]' : ''}`}>
                {s.props?.title || 'Add collection title'}
              </h4>
              <Edit3 className="h-3 w-3 text-[#999995] opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
            </div>
          )}
        </div>

        {/* RIGHT CONTROLS: COLLAPSE/EXPAND + 3-DOTS */}
        <div className="flex items-center gap-1 shrink-0">
          {!isExpanded && (
            <span className="text-xs text-[#777777] font-normal mr-1 hidden sm:inline">
              {s.hidden ? 'Hidden' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-[#777777] hover:text-[#222222] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse collection' : 'Expand collection'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* 3-DOTS MENU */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded-full text-[#777777] hover:text-[#222222] hover:bg-[#F2F2F2] active:scale-95 flex items-center justify-center transition-all cursor-pointer"
              title="More options"
              aria-label="More options"
            >
              <MoreVertical className="h-4.5 w-4.5" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-30 w-48 rounded-2xl border border-[#E8E8E8] bg-[#FFFFFF] p-1.5 shadow-lg space-y-0.5 animate-in fade-in zoom-in-95">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setEditingSectionId?.(s.id)
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    <Edit3 className="h-4 w-4 text-[#777777]" />
                    <span>Edit collection</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setIsEditingTitle(true)
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    <Pencil className="h-4 w-4 text-[#777777]" />
                    <span>Rename</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      toggleHidden?.(s.id)
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    {s.hidden ? <Eye className="h-4 w-4 text-[#777777]" /> : <EyeOff className="h-4 w-4 text-[#777777]" />}
                    <span>{s.hidden ? 'Show on store' : 'Hide from store'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isFirst || movingUpId === s.id}
                    onClick={() => {
                      setMenuOpen(false)
                      moveSectionUp?.(s.id)
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors ${
                      isFirst ? 'text-[#999995] cursor-not-allowed opacity-40' : 'text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] cursor-pointer'
                    }`}
                  >
                    <MoveUp className="h-4 w-4 text-[#777777]" />
                    <span>Move up</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      duplicate?.(s.id)
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    <Copy className="h-4 w-4 text-[#777777]" />
                    <span>Duplicate</span>
                  </button>

                  <div className="h-px bg-[#E8E8E8] my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      remove?.(s.id)
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#DC2626] hover:bg-rose-50 active:bg-rose-100 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-4 w-4 text-[#DC2626]" />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* DRAG-OVER DROP BANNER */}
      {isDropTarget && (
        <div className="mt-2.5 py-2 px-3 rounded-xl bg-[#DBEAFE] border border-[#BFDBFE] text-center text-xs font-semibold text-[#1D4ED8] flex items-center justify-center gap-1.5 animate-in fade-in duration-150">
          <FolderPlus className="h-4 w-4 text-[#2563EB]" />
          <span>Drop to add to this collection</span>
        </div>
      )}

      {/* EXPANDED CONTENT: LAYOUT SELECTOR + ITEMS + ADD BUTTON */}
      {isExpanded && (
        <div className="mt-3.5 pt-3.5 border-t border-[#E5E5E3] space-y-3.5">
          {/* LAYOUT SELECTOR */}
          <div className="grid grid-cols-4 gap-2">
            {LAYOUT_OPTIONS.map((opt) => {
              const isSelected = activeLayout === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (typeof updateCollectionProps === 'function') {
                      updateCollectionProps(s.id, { layout: opt.id, displayMode: opt.id })
                    }
                  }}
                  className={`py-2 px-1 sm:py-2.5 sm:px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer select-none ${
                    isSelected
                      ? 'border border-[#222222] ring-1 ring-[#222222] bg-[#FFFFFF] text-[#222222] shadow-2xs'
                      : 'border border-[#E8E8E8] bg-[#FFFFFF] hover:bg-[#F2F2F2] hover:border-[#D0D0CE] text-[#777777]'
                  }`}
                  aria-pressed={isSelected}
                  title={`${opt.label} display layout`}
                >
                  <div className={isSelected ? 'text-[#1F1F1F]' : 'text-[#6F6F6B]'}>
                    {opt.icon}
                  </div>
                  <span className="text-[11px] sm:text-xs leading-none">{opt.label}</span>
                </button>
              )
            })}
          </div>

          {/* COLLECTION ITEMS LIST OR EMPTY PLACEHOLDER */}
          {!items.length ? (
            <div className={`py-6 px-4 rounded-xl border border-dashed text-center text-xs font-medium transition-colors ${
              isDropTarget
                ? 'bg-[#DBEAFE]/40 border-[#3B82F6] text-[#1D4ED8]'
                : 'bg-[#F2F2F2] border-[#E8E8E8] text-[#777777]'
            }`}>
              {isDropTarget ? 'Drop product here to add' : 'Add or drag items into this collection'}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {items.map((it, idx) => {
                const isProd = it.type === 'product'
                const p = isProd ? products.find((x) => x.id === it.productId) : null
                const itTitle = isProd ? (p?.title || 'Digital Product') : (it.title || 'External Link')
                const itSub = isProd ? (Number(p?.price) === 0 ? 'Free' : formatMoney(p?.price, p?.currency)) : (it.url || 'Link')
                return (
                  <div
                    key={it.id || it.productId || idx}
                    className="flex items-center justify-between gap-2.5 p-2 sm:p-2.5 rounded-xl border border-[#E8E8E8] bg-[#FFFFFF] hover:bg-[#F2F2F2] hover:border-[#D0D0CE] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="h-8 w-8 rounded-lg bg-[#F2F2F2] border border-[#E8E8E8] flex items-center justify-center shrink-0 overflow-hidden">
                        {isProd ? (
                          p?.thumbnail ? <img src={p.thumbnail} alt="" className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-[#1F1F1F]" />
                        ) : (
                          <ExternalLink className="h-4 w-4 text-[#1F1F1F]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#1F1F1F] truncate">{itTitle}</p>
                        <p className="text-[11px] text-[#6F6F6B] truncate">{itSub}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveItemInCollection?.(s.id, idx, -1)}
                        className="p-1 rounded text-[#999995] hover:text-[#1F1F1F] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Move up"
                      >
                        <MoveUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === items.length - 1}
                        onClick={() => moveItemInCollection?.(s.id, idx, 1)}
                        className="p-1 rounded text-[#999995] hover:text-[#1F1F1F] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Move down"
                      >
                        <MoveDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItemFromCollection?.(s.id, it.id || it.productId)}
                        className="p-1 rounded text-[#999995] hover:text-[#DC2626] transition-colors cursor-pointer"
                        title="Remove from collection"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* + ADD BUTTON */}
          <button
            type="button"
            onClick={() => {
              if (typeof setSelectedId === 'function') setSelectedId(s.id)
              if (typeof setEditingCollection === 'function') setEditingCollection(s)
              if (typeof setAddContentType === 'function') setAddContentType('selector')
              if (typeof setAddContentModalOpen === 'function') setAddContentModalOpen(true)
            }}
            className="w-full h-10 rounded-xl bg-[#F5F5F3] hover:bg-[#E5E5E3] active:bg-[#DADAD7] text-[#1F1F1F] font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>
      )}
    </Reorder.Item>
  )
}

function StoreContentCard({
  s,
  itemIdx,
  selectedId,
  products,
  availableCollections = [],
  activeDraggingProduct,
  setActiveDraggingProduct,
  dropTargetCollectionId,
  setDropTargetCollectionId,
  setDragCursorPos,
  inlineTitleId,
  setInlineTitleId,
  inlineTitleVal,
  setInlineTitleVal,
  updateSectionProps,
  updateCollectionProps,
  addItemToCollection,
  removeItemFromCollection,
  moveItemInCollection,
  setSelectedId,
  setEditingCollection,
  toggleHidden,
  remove,
  duplicate,
  moveSectionUp,
  movingUpId,
  setSelectedFormType,
  setEditingFormSection,
  setAddModalType,
  setAddModalOpen,
  setSelectedMediaType,
  setEditingMediaSection,
  setCoachingWizardProductId,
  setEditingProductId,
  setEditingSectionId,
  resumeDigitalProductDraft,
  inlineProdKey,
  setInlineProdKey,
  inlineProdVal,
  setInlineProdVal,
  commitInlineProductEdit,
  savedProductId,
  setAddContentModalOpen,
  setAddContentType,
}) {
  const dragControls = useDragControls()
  const isFirst = itemIdx === 0
  const isMovingUp = movingUpId === s.id
  const [menuOpen, setMenuOpen] = useState(false)

  // Dedicated Collection Card matching Linktree UX reference
  if (s.type === 'collection' || s.type === 'product_collection') {
    return (
      <CollectionContentCard
        s={s}
        itemIdx={itemIdx}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        products={products}
        dragControls={dragControls}
        updateCollectionProps={updateCollectionProps}
        addItemToCollection={addItemToCollection}
        removeItemFromCollection={removeItemFromCollection}
        moveItemInCollection={moveItemInCollection}
        toggleHidden={toggleHidden}
        remove={remove}
        duplicate={duplicate}
        moveSectionUp={moveSectionUp}
        movingUpId={movingUpId}
        isFirst={isFirst}
        setEditingCollection={setEditingCollection}
        setEditingSectionId={setEditingSectionId}
        setAddContentModalOpen={setAddContentModalOpen}
        setAddContentType={setAddContentType}
        isDropTarget={dropTargetCollectionId === s.id}
      />
    )
  }

  const isBooking = isBookingItem(s, products)
  const Icon = ICONS[s.type] || (isBooking ? Calendar : (s.type === 'course' ? GraduationCap : Package))
  const prod = resolveSectionProduct(s, products) || ((s.type === 'product' || s.type === 'course')
    ? (products.find((p) =>
      p.id === s.props?.productId ||
      p.courseId === s.props?.productId ||
      p.id === s.props?.courseId ||
      p.courseId === s.props?.courseId
    ) || (s.type === 'product' && !s.props?.productId && products.length > 0 ? products[0] : null))
    : null)
  const title = prod ? prod.title : (s.props?.label || s.props?.text || s.props?.title || s.props?.content || LABELS[s.type] || (isBooking ? 'Book a session' : 'Untitled'))
  const price = prod ? (Number(prod.price) === 0 ? 'Free' : formatMoney(prod.price, prod.currency)) : null
  const origPrice = prod?.originalPrice ? formatMoney(prod.originalPrice, prod.currency) : null
  const isDraftItem = Boolean(prod && prod.status === 'DRAFT')

  // Get specific icon and theme colors matching the reference
  const getBadgeStyle = () => {
    if (s.type === 'heading' || s.type === 'heading_text') return { bg: 'bg-[#F3F4F6]', text: 'text-[#1F1F1F]', border: 'border-[#E5E7EB]', icon: Type, label: 'Heading' }
    if (s.type === 'text' || s.type === 'text_block' || s.type === 'paragraph_text') return { bg: 'bg-[#F8FAFC]', text: 'text-[#475569]', border: 'border-[#E2E8F0]', icon: AlignLeft, label: 'Text block' }
    if (s.type === 'pdf') return { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', border: 'border-[#FFEDD5]', icon: FileText, label: 'PDF' }
    if (s.type === 'youtube' || s.props?.mediaType === 'youtube' || s.props?.embedType === 'youtube') return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', border: 'border-[#FEE2E2]', icon: Youtube, label: 'YouTube' }
    if (s.type === 'tiktok' || s.props?.mediaType === 'tiktok' || s.props?.embedType === 'tiktok') return { bg: 'bg-[#F4F4F5]', text: 'text-[#18181B]', border: 'border-[#E4E4E7]', icon: Music2, label: 'TikTok' }
    if (s.type === 'vimeo' || s.props?.mediaType === 'vimeo' || s.props?.embedType === 'vimeo') return { bg: 'bg-[#ECFEFF]', text: 'text-[#0891B2]', border: 'border-[#CFFAFE]', icon: PlayCircle, label: 'Vimeo' }
    if (s.type === 'video' || s.props?.mediaType === 'video' || s.props?.embedType === 'video') return { bg: 'bg-[#F7FEE7]', text: 'text-[#65A30D]', border: 'border-[#ECFCCB]', icon: Video, label: 'Video' }
    if (s.type === 'gallery') return { bg: 'bg-[#FAF5FF]', text: 'text-[#9333EA]', border: 'border-[#F3E8FF]', icon: Images, label: 'Gallery' }
    if (s.type === 'audio') return { bg: 'bg-[#ECFEFF]', text: 'text-[#0891B2]', border: 'border-[#CFFAFE]', icon: Headphones, label: 'Audio' }
    if (s.type === 'social' || s.type === 'instagram' || s.props?.platform) {
      const p = getSocialPlatform(s.props?.platform || (s.type === 'instagram' ? 'instagram' : 'generic'))
      return { bg: 'bg-[#F4F4F5]', text: 'text-[#18181B]', border: 'border-[#E4E4E7]', icon: p?.icon || Share2, label: p?.name || 'Social' }
    }
    if (s.type === 'form') return { bg: 'bg-[#F0FDFA]', text: 'text-[#0D9488]', border: 'border-[#CCFBF1]', icon: ClipboardList, label: 'Form' }
    if (s.type === 'collection' || s.type === 'product_collection') return { bg: 'bg-[#EEF2FF]', text: 'text-[#4F46E5]', border: 'border-[#E0E7FF]', icon: Layers, label: 'Collection' }
    if (s.type === 'course' || prod?.type === 'COURSE') return { bg: 'bg-[#F5F5F3]', text: 'text-[#1F1F1F]', border: 'border-[#E5E5E3]', icon: GraduationCap, label: 'Course' }
    if (isBooking || prod?.type === 'COACHING') return { bg: 'bg-[#F5F5F3]', text: 'text-[#1F1F1F]', border: 'border-[#E5E5E3]', icon: Calendar, label: '1:1 Session' }
    return { bg: 'bg-[#F5F5F3]', text: 'text-[#1F1F1F]', border: 'border-[#E5E5E3]', icon: Package, label: 'Product' }
  }

  const badge = getBadgeStyle()
  const BadgeIcon = badge.icon
  const thumbnailImg = prod?.thumbnail || s.props?.customThumbnail || s.props?.thumbnail || (s.type === 'gallery' && s.props?.images?.[0]?.url ? s.props.images[0].url : null)

  const handleEdit = () => {
    if (s.type === 'collection' || s.type === 'product_collection') {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingCollection?.(s)
      setEditingSectionId?.(s.id)
    } else if (s.type === 'form') {
      setSelectedFormType(s.props?.formType || 'contact')
      setEditingFormSection(s)
      setAddModalType('form_config')
      setAddModalOpen(true)
    } else if (isBooking || prod?.type === 'COACHING' || String(prod?.type || '').toUpperCase() === 'COACHING') {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    } else if (s.type === 'gallery') {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    } else if (['social', 'instagram'].includes(s.type) || s.props?.platform) {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    } else if (['button', 'link', 'url'].includes(s.type)) {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    } else if (['video', 'youtube', 'tiktok', 'vimeo', 'audio', 'pdf'].includes(s.type)) {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    } else if (['heading', 'heading_text', 'text', 'text_block', 'paragraph_text'].includes(s.type)) {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    } else if (prod) {
      setEditingSectionId?.(null)
      setEditingProductId(prod.id)
    } else {
      setSelectedId(s.id)
      setEditingProductId?.(null)
      setEditingSectionId?.(s.id)
    }
  }

  const handleProductPointerDown = (e) => {
    // Only primary mouse button (left click)
    if (e.button !== 0) return
    // Never hijack touch scrolling on mobile devices
    if (e.pointerType === 'touch') return
    // Never start drag when clicking interactive buttons, inputs, links, or grip handle
    if (e.target.closest('button, a, input, select, textarea, [data-no-drag]')) return
    if (!prod) return

    const startX = e.clientX
    const startY = e.clientY
    let hasMoved = false

    const handlePointerMove = (moveEvt) => {
      const dist = Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY)
      if (!hasMoved && dist > 6) {
        hasMoved = true
        setActiveDraggingProduct?.(prod)
      }
      if (hasMoved) {
        setDragCursorPos?.({ x: moveEvt.clientX, y: moveEvt.clientY })
        const el = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY)
        const collEl = el?.closest('[data-collection-id]')
        const collId = collEl?.getAttribute('data-collection-id') || null
        setDropTargetCollectionId?.(collId)
      }
    }

    const handlePointerUp = (upEvt) => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)

      if (hasMoved) {
        const el = document.elementFromPoint(upEvt.clientX, upEvt.clientY)
        const collEl = el?.closest('[data-collection-id]')
        const collId = collEl?.getAttribute('data-collection-id')
        if (collId && typeof addItemToCollection === 'function') {
          addItemToCollection(collId, {
            id: uuidv4(),
            type: 'product',
            productId: prod.id,
          })
        }
        setActiveDraggingProduct?.(null)
        setDropTargetCollectionId?.(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }

  return (
    <Reorder.Item
      key={s.id}
      value={s}
      dragListener={false}
      dragControls={dragControls}
      onPointerDown={prod ? handleProductPointerDown : undefined}
      className={`group rounded-2xl border p-3 sm:p-3.5 transition-all w-full flex items-center justify-between gap-3 relative cursor-pointer ${
        prod ? 'cursor-grab active:cursor-grabbing' : ''
      } ${selectedId === s.id
        ? 'border-[#222222] ring-1 ring-[#222222] bg-[#FFFFFF] shadow-2xs'
        : 'border-[#E8E8E8] bg-[#FFFFFF] hover:border-[#D0D0CE] hover:shadow-2xs'
        }`}
      onClick={handleEdit}
    >
      {/* LEFT: DRAG HANDLE + THUMBNAIL + TITLE/SUBTITLE */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* 6-DOT DRAG HANDLE */}
        <div
          data-no-drag="true"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            if (e.button !== undefined && e.button !== 0) return
            e.preventDefault()
            dragControls.start(e)
          }}
          className="text-[#999995] hover:text-[#222222] cursor-grab active:cursor-grabbing shrink-0 transition-colors touch-none select-none p-1.5 -m-1 rounded"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* THUMBNAIL / ICON BADGE */}
        <div
          className={`h-12 w-12 rounded-[14px] ${badge.bg} border border-[#E8E8E8] ${badge.text} flex items-center justify-center shrink-0 overflow-hidden shadow-2xs`}
        >
          {thumbnailImg ? (
            <img src={thumbnailImg} alt="" className="h-full w-full object-cover" />
          ) : (
            <BadgeIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          )}
        </div>

        {/* DETAILS: TITLE & SUBTITLE */}
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <h4
              className={`text-sm sm:text-base font-bold text-[#222222] truncate hover:text-black transition-colors ${s.hidden ? 'line-through text-[#999995]' : ''}`}
            >
              {title || 'Untitled'}
            </h4>
          </div>

          <p className="text-xs text-[#777777] font-normal truncate mt-0.5">
            {s.type === 'pdf' ? `PDF • ${s.props?.fileSize || '30 pages'}` :
              s.type === 'collection' || s.type === 'product_collection' ? `${s.props?.items?.length || 0} items` :
                s.type === 'gallery' ? `${s.props?.images?.length || 0} photos` :
                  prod ? (price ? `${price} • ${prod.shortDescription || 'Digital Product'}` : '0 clicks') :
                    '0 clicks'}
          </p>
        </div>
      </div>

      {/* RIGHT: SETUP BUTTON (IF DRAFT) & 3-DOTS MENU */}
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {s.hidden && (
          <span className="text-[11px] font-semibold text-[#777777] bg-[#F2F2F2] px-2.5 py-0.5 rounded-full border border-[#E8E8E8] hidden sm:inline-flex items-center gap-1">
            <EyeOff className="h-3 w-3" />
            <span>Hidden</span>
          </span>
        )}

        {/* SETUP BUTTON (IF DRAFT) */}
        {isDraftItem && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleEdit()
            }}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#D97706] text-xs font-bold transition-all cursor-pointer hover:bg-[#FDE68A] active:scale-95 shadow-2xs"
          >
            <Wrench className="h-3 w-3 text-[#D97706]" />
            <span>Setup</span>
          </button>
        )}

        {/* 3-DOTS MORE ACTIONS MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            className="w-9 h-9 rounded-full text-[#777777] hover:text-[#222222] hover:bg-[#F2F2F2] active:scale-95 flex items-center justify-center transition-all cursor-pointer"
            title="More Options"
            aria-label="More options"
          >
            <MoreVertical className="h-4.5 w-4.5" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-30 w-48 rounded-2xl border border-[#E8E8E8] bg-[#FFFFFF] p-1.5 shadow-lg space-y-0.5 animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleEdit() }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Edit3 className="h-4 w-4 text-[#777777]" />
                  <span>Edit details</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    toggleHidden(s.id)
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  {s.hidden ? <Eye className="h-4 w-4 text-[#777777]" /> : <EyeOff className="h-4 w-4 text-[#777777]" />}
                  <span>{s.hidden ? 'Show on store' : 'Hide from store'}</span>
                </button>

                <button
                  type="button"
                  disabled={isFirst || isMovingUp}
                  onClick={() => { setMenuOpen(false); moveSectionUp(s.id) }}
                  className={`w-full px-3 py-2 text-left text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors ${
                    isFirst ? 'text-[#999995] cursor-not-allowed opacity-40' : 'text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] cursor-pointer'
                  }`}
                >
                  <MoveUp className="h-4 w-4 text-[#777777]" />
                  <span>Move up</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); duplicate(s.id) }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Copy className="h-4 w-4 text-[#777777]" />
                  <span>Duplicate</span>
                </button>

                {prod && (
                  <Link
                    href={prod.type === 'COURSE' || String(prod.type).toLowerCase() === 'course' ? `/dashboard/courses/${prod.courseId || prod.id}` : `/dashboard/products/${prod.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    <Eye className="h-4 w-4 text-[#777777]" />
                    <span>View analytics</span>
                  </Link>
                )}

                {prod && availableCollections?.length > 0 && (
                  <>
                    <div className="h-px bg-[#E8E8E8] my-1" />
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8C8C88]">
                      Add to collection
                    </div>
                    {availableCollections.map((col) => {
                      const colTitle = col.props?.title || 'Untitled Collection'
                      const isAlreadyIn = Array.isArray(col.props?.items) && col.props.items.some(
                        (it) => it.type === 'product' && it.productId === prod.id
                      )
                      return (
                        <button
                          key={col.id}
                          type="button"
                          disabled={isAlreadyIn}
                          onClick={() => {
                            setMenuOpen(false)
                            if (!isAlreadyIn) {
                              addItemToCollection(col.id, {
                                id: uuidv4(),
                                type: 'product',
                                productId: prod.id,
                              })
                            }
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs font-medium rounded-lg flex items-center justify-between gap-2 transition-colors ${
                            isAlreadyIn
                              ? 'text-[#999995] cursor-not-allowed bg-transparent'
                              : 'text-[#222222] hover:bg-[#F2F2F2] active:bg-[#E8E8E8] cursor-pointer'
                          }`}
                        >
                          <span className="truncate flex items-center gap-2">
                            <Folder className="h-3.5 w-3.5 text-[#777777] shrink-0" />
                            <span className="truncate">{colTitle}</span>
                          </span>
                          {isAlreadyIn ? (
                            <span className="text-[10px] text-[#999995] font-normal shrink-0">Added</span>
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-[#222222] shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </>
                )}

                <div className="h-px bg-[#E8E8E8] my-1" />

                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); remove(s.id) }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-[#DC2626] hover:bg-rose-50 active:bg-rose-100 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-[#DC2626]" />
                  <span>Delete</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Reorder.Item>
  )
}

export default function StoreBuilderPage() {
  const { me, updateProfile: updateDashboardProfile, updateStore: updateDashboardStore, refreshMe } = useDashboard()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams?.get('tab') === 'design' ? 'design' : 'section'
  const [store, setStore] = useState(null)
  const [savedTheme, setSavedTheme] = useState(null)
  const hasUnsavedThemeChanges = useMemo(() => {
    return isThemeDirty(store?.theme, savedTheme)
  }, [store?.theme, savedTheme])
  const [products, setProducts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [device, setDevice] = useState('mobile')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('saved') // saved | saving | dirty
  const [themeSaveState, setThemeSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const themeSaveSeqRef = useRef(0)
  const themeSaveTimerRef = useRef(null)
  const isSavingTheme = themeSaveState === 'saving'
  const [navConfirmOpen, setNavConfirmOpen] = useState(false)
  const [pendingNavTab, setPendingNavTab] = useState(null)
  const [pendingNavHref, setPendingNavHref] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addModalType, setAddModalType] = useState('menu') // 'menu' | 'link' | 'product' | 'digital_product' | 'edit_product' | 'forms_menu' | 'form_config' | 'media_config'
  const [modalOrigin, setModalOrigin] = useState('menu') // 'menu' | 'direct'
  const [addModalCategory, setAddModalCategory] = useState('suggested')
  const [addModalSearch, setAddModalSearch] = useState('')
  const [selectedFormType, setSelectedFormType] = useState('contact')
  const [linkDirectUrl, setLinkDirectUrl] = useState('')
  const [linkDirectTitle, setLinkDirectTitle] = useState('')
  const [editingFormSection, setEditingFormSection] = useState(null)
  const [selectedMediaType, setSelectedMediaType] = useState('video')
  const [editingMediaSection, setEditingMediaSection] = useState(null)
  const [selectedSocialPlatform, setSelectedSocialPlatform] = useState('instagram')
  const [wizardStep, setWizardStep] = useState(1)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingSectionId, setEditingSectionId] = useState(null)
  const [editingSectionObject, setEditingSectionObject] = useState(null)
  const [bundleModalOpen, setBundleModalOpen] = useState(false)
  const [editingBundle, setEditingBundle] = useState(null)

  const editingSection = useMemo(() => {
    if (!editingSectionId) return null
    return (store?.sections || []).find((s) => s.id === editingSectionId) || (editingSectionObject?.id === editingSectionId ? editingSectionObject : null) || null
  }, [editingSectionId, store?.sections, editingSectionObject])
  const [coachingWizardOpen, setCoachingWizardOpen] = useState(false)
  const [coachingWizardProductId, setCoachingWizardProductId] = useState(null)
  // Legacy unfinished drafts (already in the DB) can still be resumed.
  // New Digital Product creates stay in memory until the final Complete step.
  const [draftProductId, setDraftProductId] = useState(null)
  const [draftSectionId, setDraftSectionId] = useState(null)
  const [draftSaveState, setDraftSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [wizardDirty, setWizardDirty] = useState(false)
  const [completingProduct, setCompletingProduct] = useState(false)
  const draftPatchTimer = useRef(null)
  const draftSavedTimer = useRef(null)
  const pendingDraftPatch = useRef({})
  const pendingCreateId = useRef(null)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [igAccount, setIgAccount] = useState({ connected: false, username: '' })
  const [bioInput, setBioInput] = useState('')
  const [isEditingBio, setIsEditingBio] = useState(false)
  const [contentTypeTab, setContentTypeTab] = useState('links')
  const [storeStatusLoading, setStoreStatusLoading] = useState(false)
  const avatarFileRef = useRef(null)
  const saveTimer = useRef(null)
  const saveSeqRef = useRef(0)
  const storeRef = useRef(null)

  // Collection States
  const [editingCollection, setEditingCollection] = useState(null)
  const [addCollectionOpen, setAddCollectionOpen] = useState(false)
  const [addCollectionName, setAddCollectionName] = useState('')
  const [addContentModalOpen, setAddContentModalOpen] = useState(false)
  const [addContentType, setAddContentType] = useState(null)
  const [activeDraggingProduct, setActiveDraggingProduct] = useState(null)
  const [dropTargetCollectionId, setDropTargetCollectionId] = useState(null)
  const [dragCursorPos, setDragCursorPos] = useState({ x: 0, y: 0 })
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [inlineTitleId, setInlineTitleId] = useState(null)
  const [inlineTitleVal, setInlineTitleVal] = useState('')
  // Lightweight inline edits on a product card: `${productId}:${field}`
  const [inlineProdKey, setInlineProdKey] = useState(null)
  const [inlineProdVal, setInlineProdVal] = useState('')
  const [savedProductId, setSavedProductId] = useState(null)

  // Multi-page state
  const [pages, setPages] = useState([]) // [{ id, name, slug, isDefault, position }]
  const [activePageId, setActivePageId] = useState(null) // null = home page
  const [addPageOpen, setAddPageOpen] = useState(false)
  const [addPageName, setAddPageName] = useState('')
  const [addPageLoading, setAddPageLoading] = useState(false)
  const [renamePageOpen, setRenamePageOpen] = useState(false)
  const [renamePageTarget, setRenamePageTarget] = useState(null) // { id, name }
  const [renamePageName, setRenamePageName] = useState('')
  const [renamePageLoading, setRenamePageLoading] = useState(false)
  const [deletePageOpen, setDeletePageOpen] = useState(false)
  const [deletePageTarget, setDeletePageTarget] = useState(null) // { id, name }
  const [deletePageLoading, setDeletePageLoading] = useState(false)
  const [duplicatePageLoadingId, setDuplicatePageLoadingId] = useState(null)
  const [pageLimitModalOpen, setPageLimitModalOpen] = useState(false)
  const [pageLimitErrorData, setPageLimitErrorData] = useState(null)

  const currentPlan = resolveCreatorPlan(me?.subscription)
  const isPro = currentPlan === 'PRO'
  const maxPages = isPro ? Infinity : (PLAN_FEATURES[currentPlan]?.entitlements?.storePagesLimit || 3)
  const currentPagesCount = pages.length || 1
  const isPageLimitReached = !isPro && currentPagesCount >= maxPages


  function handleCreateCollection(customTitle) {
    const isHome = !activePageId || activePageId === 'home' || Boolean(pages.find(p => p.id === activePageId || p.slug === activePageId)?.isDefault)
    const targetPageId = isHome ? null : activePageId
    const finalTitle = (typeof customTitle === 'string' && customTitle.trim()) ? customTitle.trim() : (addCollectionName?.trim() || 'New Collection')
    const section = {
      id: uuidv4(),
      type: 'collection',
      hidden: false,
      pageId: targetPageId,
      props: {
        title: finalTitle,
        layout: 'list',
        displayMode: 'list',
        items: [],
      },
    }
    updateStore((s) => {
      s.sections.push(section)
      return s
    }, { immediate: true })
    setSelectedId(section.id)
    setEditingCollection(section)
    setAddCollectionOpen(false)
    setAddCollectionName('')
    toast.success('Collection created!')
  }

  function updateCollectionProps(sectionId, patchProps) {
    const isImmediate = patchProps.layout !== undefined || patchProps.displayMode !== undefined
    updateStore((s) => {
      const sec = s.sections.find((x) => x.id === sectionId)
      if (sec) {
        sec.props = { ...sec.props, ...patchProps }
      }
      return s
    }, { immediate: isImmediate })
    setEditingCollection((prev) => (prev && prev.id === sectionId ? { ...prev, props: { ...prev.props, ...patchProps } } : prev))
  }

  function addItemToCollection(sectionId, itemObj) {
    let alreadyExists = false
    let targetCollection = null
    const candidateId = String(itemObj.productId || itemObj.id || '')
    updateStore((s) => {
      const sec = s.sections.find((x) => x.id === sectionId)
      if (sec) {
        const curItems = Array.isArray(sec.props?.items) ? sec.props.items : []
        if (curItems.some((it) => {
          const itId = String(it.productId || it.courseId || it.id || '')
          return candidateId && itId === candidateId
        })) {
          alreadyExists = true
          return s
        }
        sec.props = { ...sec.props, items: [...curItems, itemObj] }
        targetCollection = sec
      }
      return s
    }, { immediate: true })
    if (alreadyExists) {
      toast('Already in this collection')
      return false
    }
    setEditingCollection((prev) => {
      if (!prev || prev.id !== sectionId) return targetCollection || prev
      const curItems = Array.isArray(prev.props?.items) ? prev.props.items : []
      return { ...prev, props: { ...prev.props, items: [...curItems, itemObj] } }
    })
    toast.success('Added item to collection')
    return true
  }

  function removeItemFromCollection(sectionId, itemId) {
    let targetCollection = null
    const targetStrId = String(itemId)
    updateStore((s) => {
      const sec = s.sections.find((x) => x.id === sectionId)
      if (sec) {
        const curItems = Array.isArray(sec.props?.items) ? sec.props.items : []
        const removedItem = curItems.find((it) => String(it.id || it.productId || it.courseId) === targetStrId)
        const remainingItems = curItems.filter((it) => String(it.id || it.productId || it.courseId) !== targetStrId)
        sec.props = { ...sec.props, items: remainingItems }
        targetCollection = sec

        // Guarantee safety: if removed item was a product/course and there is no top-level section for it, create one
        if (removedItem && (removedItem.productId || removedItem.courseId || removedItem.id)) {
          const prodId = String(removedItem.productId || removedItem.courseId || removedItem.id)
          const hasSection = s.sections.some(
            (x) => (x.type === 'product' || x.type === 'course') &&
              (String(x.props?.productId) === prodId || String(x.props?.courseId) === prodId)
          )
          if (!hasSection) {
            s.sections.push({
              id: uuidv4(),
              type: removedItem.type === 'course' ? 'course' : 'product',
              hidden: false,
              pageId: sec.pageId || null,
              props: removedItem.type === 'course' ? { courseId: prodId, layout: 'classic' } : { productId: prodId, layout: 'classic' }
            })
          }
        }
      }
      return s
    }, { immediate: true })
    setEditingCollection((prev) => {
      if (!prev || prev.id !== sectionId) return targetCollection || prev
      const curItems = Array.isArray(prev.props?.items) ? prev.props.items : []
      return { ...prev, props: { ...prev.props, items: curItems.filter((it) => String(it.id || it.productId || it.courseId) !== targetStrId) } }
    })
    toast.success('Removed item from collection')
  }

  function moveItemInCollection(sectionId, itemIndex, direction) {
    updateStore((s) => {
      const sec = s.sections.find((x) => x.id === sectionId)
      if (sec && Array.isArray(sec.props?.items)) {
        const items = [...sec.props.items]
        const targetIndex = itemIndex + direction
        if (targetIndex >= 0 && targetIndex < items.length) {
          const [moved] = items.splice(itemIndex, 1)
          items.splice(targetIndex, 0, moved)
          sec.props.items = items
        }
      }
      return s
    }, { immediate: true })
    setEditingCollection((prev) => {
      if (!prev || prev.id !== sectionId || !Array.isArray(prev.props?.items)) return prev
      const items = [...prev.props.items]
      const targetIndex = itemIndex + direction
      if (targetIndex >= 0 && targetIndex < items.length) {
        const [moved] = items.splice(itemIndex, 1)
        items.splice(targetIndex, 0, moved)
        return { ...prev, props: { ...prev.props, items } }
      }
      return prev
    })
  }

  const { setHeaderConfig, setPricingModalOpen } = useDashboardHeader()

  // --- Draft digital product lifecycle -------------------------------------
  const discardPendingCreate = useCallback(() => {
    const orphanId = pendingCreateId.current
    pendingCreateId.current = null
    if (orphanId) {
      api.del(`/products/${orphanId}`).catch(() => { /* best-effort cleanup */ })
    }
  }, [])

  const handleAddToStore = useCallback((category = 'suggested') => {
    setModalOrigin('menu')
    setAddModalCategory(category)
    setAddModalType('menu')
    setAddModalSearch('')
    setAddModalOpen(true)
  }, [])

  const sub = me?.subscription
  const isPaid = Boolean(sub?.status === 'ACTIVE' && !sub?.isTrial && sub?.planId !== 'UNSUBSCRIBED' && sub?.plan !== 'UNSUBSCRIBED')
  const isTrialActive = Boolean(
    !isPaid &&
    (sub?.isTrial || sub?.status === 'TRIALING' || sub?.trialStatus === 'ACTIVE') &&
    !sub?.isTrialExpired &&
    sub?.trialStatus !== 'EXPIRED' &&
    sub?.status !== 'EXPIRED' &&
    (!sub?.trialEndsAt || new Date(sub.trialEndsAt).getTime() > Date.now())
  )
  const canCreate = isPaid || isTrialActive

  const canRemoveFooterBranding = Boolean(
    (isPaid || isTrialActive) &&
    (sub?.planId === 'PRO' || sub?.plan === 'PRO' || sub?.entitlements?.removeBranding)
  )

  const previewStore = useMemo(() => {
    if (!store) return {}
    return {
      ...store,
      theme: {
        ...(store.theme || {}),
        showFooterBranding: canRemoveFooterBranding ? (store.theme?.showFooterBranding ?? true) : true,
      },
    }
  }, [store, canRemoveFooterBranding])

  const handleToggleFooterBranding = useCallback(async (newVal) => {
    if (!newVal && !canRemoveFooterBranding) {
      toast.error('A Pro subscription is required to hide the CreatorStore footer branding.')
      setPricingModalOpen(true)
      return
    }

    updateStore((prev) => ({
      ...prev,
      theme: {
        ...(prev?.theme || {}),
        showFooterBranding: newVal,
      },
    }))

    try {
      await api.patch('/creator/store/settings', {
        theme: {
          showFooterBranding: newVal,
        },
      })
      toast.success(newVal ? 'Footer branding enabled' : 'Footer branding hidden')
      if (refreshMe) await refreshMe()
    } catch (err) {
      updateStore((prev) => ({
        ...prev,
        theme: {
          ...(prev?.theme || {}),
          showFooterBranding: !newVal,
        },
      }))
      if (err?.code === 'PLAN_UPGRADE_REQUIRED' || err?.status === 403) {
        toast.error('A Pro subscription is required to hide the CreatorStore footer branding.')
        setPricingModalOpen(true)
      } else {
        toast.error(err?.message || 'Failed to update footer branding.')
      }
    }
  }, [canRemoveFooterBranding, updateStore, refreshMe, setPricingModalOpen])

  const handleToggleStoreLive = useCallback(async () => {
    const isLive = Boolean(store?.published)
    if (!isLive && !canCreate) {
      toast.error('Your Pro trial has ended. An active paid plan is required to turn on your storefront.')
      setPricingModalOpen(true)
      return
    }
    setStoreStatusLoading(true)
    try {
      if (isLive) {
        const res = await api.post('/storefront/deactivate')
        if (res?.store || res?.success) {
          toast.info('Storefront is now offline.')
          setStore((s) => ({ ...s, published: false }))
          if (refreshMe) await refreshMe()
        }
      } else {
        const res = await api.post('/storefront/activate')
        if (res?.store || res?.success) {
          toast.success('🎉 Storefront is now LIVE!')
          setStore((s) => ({ ...s, published: true }))
          trackStorePublished()
          if (refreshMe) await refreshMe()
        }
      }
    } catch (err) {
      if (err?.code === 'PAID_PLAN_REQUIRED' || err?.code === 'PLAN_UPGRADE_REQUIRED' || err?.status === 403) {
        toast.error('Your Pro trial has ended. Upgrade your plan to activate your store.')
        setPricingModalOpen(true)
      } else {
        toast.error(err?.message || 'Failed to update store status.')
      }
    } finally {
      setStoreStatusLoading(false)
    }
  }, [store?.published, canCreate, refreshMe, setPricingModalOpen])

  const handleNewProduct = useCallback(() => {
    if (!canCreate) {
      toast.error('Your Pro trial has ended. Upgrade your plan to create products and continue selling.')
      setPricingModalOpen(true)
      return
    }
    handleAddToStore('suggested')
  }, [canCreate, handleAddToStore, setPricingModalOpen])

  const openDigitalProductWizard = useCallback(() => {
    if (!canCreate) {
      toast.error('Your Pro trial has ended. Upgrade your plan to create products and continue selling.')
      setPricingModalOpen(true)
      return
    }
    discardPendingCreate()
    setDraftProductId(null)
    setDraftSectionId(null)
    setDraftSaveState('idle')
    setWizardDirty(false)
    setModalOrigin('menu')
    setAddModalType('digital_product')
    setWizardStep(1)
    setAddModalOpen(true)
  }, [canCreate, discardPendingCreate, setPricingModalOpen])

  const openCoachingCreationFlow = useCallback(() => {
    if (!canCreate) {
      toast.error('Your Pro trial has ended. Upgrade your plan to create products and continue selling.')
      setPricingModalOpen(true)
      return
    }
    setAddModalOpen(false)
    setAddModalType('menu')
    setCoachingWizardProductId(null)
    setCoachingWizardOpen(true)
  }, [canCreate, setPricingModalOpen])


  const openBundleCreationFlow = useCallback(() => {
    if (!canCreate) {
      toast.error('Your Pro trial has ended. Upgrade your plan to create products and continue selling.')
      setPricingModalOpen(true)
      return
    }
    setAddModalOpen(false)
    setEditingBundle(null)
    setBundleModalOpen(true)
  }, [canCreate, setPricingModalOpen])

  const handleMobileAddOption = useCallback((type, payload) => {
    if (type === 'link') {
      setLinkDirectUrl('')
      setLinkDirectTitle('')
      setAddModalType('link')
      setAddModalOpen(true)
    } else if (type === 'link_direct') {
      setLinkDirectUrl(payload?.url || '')
      setLinkDirectTitle(payload?.title || '')
      setAddModalType('link')
      setAddModalOpen(true)
    } else if (type === 'coaching') {
      openCoachingCreationFlow()
    } else if (type === 'bundle') {
      openBundleCreationFlow()
    } else if (type === 'form' || type === 'forms_menu') {
      setAddModalType('forms_menu')
      setAddModalOpen(true)
    } else if (type === 'form_contact') {
      setSelectedFormType('contact')
      setEditingFormSection(null)
      setAddModalType('form_config')
      setAddModalOpen(true)
    } else if (type === 'form_newsletter') {
      setSelectedFormType('newsletter')
      setEditingFormSection(null)
      setAddModalType('form_config')
      setAddModalOpen(true)
    } else if (type === 'instagram' || type === 'social') {
      setAddModalType('social_display_select')
      setAddModalOpen(true)
    } else if (type === 'add_youtube' || type === 'youtube') {
      setAddModalType('add_youtube')
      setAddModalOpen(true)
    } else if (type === 'add_tiktok' || type === 'tiktok') {
      setAddModalType('add_tiktok')
      setAddModalOpen(true)
    } else if (type === 'audio' || type === 'spotify') {
      setAddModalType('media_config')
      setAddModalOpen(true)
    } else {
      handleAddToStore(type)
    }
  }, [openCoachingCreationFlow, openBundleCreationFlow, handleAddToStore])

  const handleTabChange = useCallback((newTab) => {
    if (tab === 'design' && newTab !== 'design' && hasUnsavedThemeChanges) {
      setPendingNavTab(newTab)
      setNavConfirmOpen(true)
      return
    }
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (newTab === 'design') params.set('tab', 'design')
    else params.delete('tab')
    const qs = params.toString()
    router.replace(qs ? `/dashboard/store?${qs}` : '/dashboard/store', { scroll: false })
  }, [router, searchParams, tab, hasUnsavedThemeChanges])

  // Intercept in-app link clicks when there are unsaved theme changes
  useEffect(() => {
    if (!hasUnsavedThemeChanges || tab !== 'design') return

    const handleAnchorClick = (e) => {
      const anchor = e.target.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
      if (anchor.target === '_blank') return

      e.preventDefault()
      e.stopPropagation()
      setPendingNavHref(href)
      setNavConfirmOpen(true)
    }

    document.addEventListener('click', handleAnchorClick, true)
    return () => {
      document.removeEventListener('click', handleAnchorClick, true)
    }
  }, [hasUnsavedThemeChanges, tab])

  // Browser beforeunload warning when there are unsaved theme changes
  useEffect(() => {
    if (!hasUnsavedThemeChanges || tab !== 'design') return
    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedThemeChanges, tab])

  const refreshStoreData = useCallback(async () => {
    try {
      const [s, p, cRes] = await Promise.all([
        api.get('/store'),
        api.get('/products'),
        api.get('/courses').catch(() => ({ courses: [] })),
      ])
      const rawProducts = p?.products || []
      const rawCourses = Array.isArray(cRes?.courses) ? cRes.courses : Array.isArray(cRes) ? cRes : (cRes?.items || [])

      const loadedProducts = rawProducts.map((prod) => {
        const preview = toPreviewProduct(prod)
        if (preview.type === 'COURSE' || String(preview.type).toLowerCase() === 'course') {
          const matchedCourse = rawCourses.find(c => c.id === preview.id || c.productId === preview.id || c.courseId === preview.id || (c.slug && preview.slug && c.slug === preview.slug))
          if (matchedCourse) {
            preview.courseId = matchedCourse.id || matchedCourse.courseId
            if (!preview.thumbnail && (matchedCourse.thumbnail || matchedCourse.coverImage)) {
              preview.thumbnail = matchedCourse.thumbnail || matchedCourse.coverImage
            }
            if (!preview.shortDescription && matchedCourse.shortDescription) {
              preview.shortDescription = matchedCourse.shortDescription
            }
          }
        }
        return preview
      })

      for (const crs of rawCourses) {
        const exists = loadedProducts.some(lp => lp.id === crs.id || lp.id === crs.productId || lp.courseId === crs.id || (crs.slug && lp.slug === crs.slug))
        if (!exists) {
          loadedProducts.push(toPreviewProduct({
            id: crs.productId || crs.id,
            courseId: crs.id,
            creatorId: crs.creatorId,
            title: crs.title,
            slug: crs.slug,
            type: 'COURSE',
            status: crs.status || 'DRAFT',
            price: Number(crs.price || 0),
            currency: crs.currency || 'INR',
            shortDescription: crs.shortDescription || crs.description || '',
            description: crs.description || '',
            thumbnail: crs.thumbnail || crs.coverImage || null,
          }))
        }
      }

      let loadedStore = s?.store
      if (loadedStore) {
        setStore(loadedStore)
        setSavedTheme(structuredClone(loadedStore.theme || {}))
        storeRef.current = loadedStore
      }
      setProducts(loadedProducts)
      return { store: loadedStore, products: loadedProducts }
    } catch (err) {
      console.error('Failed to refresh store and products:', err)
    }
  }, [])

  const loadStoreData = refreshStoreData

  const savedScrollYRef = useRef(0)

  const captureScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') return
    const scrollEl = document.querySelector('div.overflow-y-auto')
    const pos = scrollEl ? scrollEl.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0)
    savedScrollYRef.current = pos
    try {
      sessionStorage.setItem('creatorstore_overview_scroll_top', String(pos))
    } catch {}
  }, [])

  const restoreScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') return
    setTimeout(() => {
      let pos = savedScrollYRef.current
      if (!pos) {
        try {
          const stored = sessionStorage.getItem('creatorstore_overview_scroll_top')
          if (stored) pos = parseInt(stored, 10)
        } catch {}
      }
      if (pos > 0) {
        const scrollEl = document.querySelector('div.overflow-y-auto')
        if (scrollEl) {
          scrollEl.scrollTop = pos
        }
        window.scrollTo(0, pos)
      }
    }, 60)
  }, [])

  const handleCloseEditor = useCallback(() => {
    setEditingProductId(null)
    setEditingSectionId(null)
    setEditingSectionObject(null)
    setSelectedId(null)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('intent')
      url.searchParams.delete('productId')
      url.searchParams.delete('sectionId')
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''))
    }
    refreshStoreData()
    restoreScrollPosition()
  }, [refreshStoreData, restoreScrollPosition])

  const handleEditProductNav = useCallback((pid) => {
    captureScrollPosition()
    setEditingSectionId(null)
    setEditingSectionObject(null)
    setEditingProductId(pid)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('intent', 'edit_product')
      url.searchParams.set('productId', pid)
      window.history.pushState({ editingProductId: pid }, '', url.pathname + url.search)
    }
  }, [captureScrollPosition])

  const handleEditSectionNav = useCallback((sec) => {
    if (!sec) return
    if (sec.type === 'form') {
      setSelectedFormType(sec.props?.formType || 'contact')
      setEditingFormSection(sec)
      setAddModalType('form_config')
      setAddModalOpen(true)
      return
    }
    captureScrollPosition()
    setEditingProductId(null)
    setEditingSectionId(sec.id)
    setEditingSectionObject(sec)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('intent', 'edit_section')
      url.searchParams.set('sectionId', sec.id)
      window.history.pushState({ editingSectionId: sec.id }, '', url.pathname + url.search)
    }
  }, [captureScrollPosition])

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return
      const sp = new URLSearchParams(window.location.search)
      const intent = sp.get('intent')
      const pid = sp.get('productId')
      const secId = sp.get('sectionId')
      if (intent === 'edit_product' && pid) {
        setEditingSectionId(null)
        setEditingSectionObject(null)
        setEditingProductId(pid)
      } else if (intent === 'edit_section' && secId) {
        setEditingProductId(null)
        setEditingSectionId(secId)
      } else {
        setEditingProductId(null)
        setEditingSectionId(null)
        setEditingSectionObject(null)
        setSelectedId(null)
        restoreScrollPosition()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [restoreScrollPosition])

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.get('/store'),
      api.get('/products'),
      api.get('/courses').catch(() => ({ courses: [] })),
      api.get('/integrations/instagram/account').catch(() => ({ account: null })),
    ])
      .then(([s, p, cRes, igRes]) => {
        if (mounted) {
          const rawProducts = p?.products || []
          const rawCourses = Array.isArray(cRes?.courses) ? cRes.courses : Array.isArray(cRes) ? cRes : (cRes?.items || [])

          const loadedProducts = rawProducts.map((prod) => {
            const preview = toPreviewProduct(prod)
            if (preview.type === 'COURSE' || String(preview.type).toLowerCase() === 'course') {
              const matchedCourse = rawCourses.find(c => c.id === preview.id || c.productId === preview.id || c.courseId === preview.id || (c.slug && preview.slug && c.slug === preview.slug))
              if (matchedCourse) {
                preview.courseId = matchedCourse.id || matchedCourse.courseId
                if (!preview.thumbnail && (matchedCourse.thumbnail || matchedCourse.coverImage)) {
                  preview.thumbnail = matchedCourse.thumbnail || matchedCourse.coverImage
                }
                if (!preview.shortDescription && matchedCourse.shortDescription) {
                  preview.shortDescription = matchedCourse.shortDescription
                }
              }
            }
            return preview
          })

          for (const crs of rawCourses) {
            const exists = loadedProducts.some(lp => lp.id === crs.id || lp.id === crs.productId || lp.courseId === crs.id || (crs.slug && lp.slug === crs.slug))
            if (!exists) {
              loadedProducts.push(toPreviewProduct({
                id: crs.productId || crs.id,
                courseId: crs.id,
                creatorId: crs.creatorId,
                title: crs.title,
                slug: crs.slug,
                type: 'COURSE',
                status: crs.status || 'DRAFT',
                price: Number(crs.price || 0),
                currency: crs.currency || 'INR',
                shortDescription: crs.shortDescription || crs.description || '',
                description: crs.description || '',
                thumbnail: crs.thumbnail || crs.coverImage || null,
              }))
            }
          }

          let loadedStore = s.store

          if (loadedStore) {
            setStore(loadedStore)
            setSavedTheme(structuredClone(loadedStore?.theme || {}))
            storeRef.current = loadedStore
          }
          setProducts(loadedProducts)
          setBioInput(loadedStore?.bio || me?.profile?.bio || '')
          if (igRes) {
            const acc = igRes.account || igRes
            if (acc && acc.connected !== undefined) {
              setIgAccount(acc)
            }
          }
          // Load pages
          const storePagesRaw = Array.isArray(loadedStore?.pages) ? loadedStore.pages : []
          const hasHome = storePagesRaw.some(p => p.isDefault)
          const storePages = hasHome ? storePagesRaw : [
            { id: 'home', name: 'Home', slug: 'home', isDefault: true, position: 0 },
            ...storePagesRaw.filter(p => !p.isDefault)
          ]
          setPages(storePages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
          setActivePageId(null) // null = home page
        }
      })
      .catch(() => { if (mounted) toast.error('Could not load your store') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [me])

  useEffect(() => {
    if (me?.store) {
      const canonicalUsername = me.store.username || me.store.slug
      const canonicalSlug = me.store.slug || me.store.username
      if (canonicalUsername || canonicalSlug) {
        setStore((prev) => {
          if (!prev) return prev
          if (prev.username !== canonicalUsername || prev.slug !== canonicalSlug) {
            const next = { ...prev, username: canonicalUsername, slug: canonicalSlug }
            storeRef.current = next
            return next
          }
          return prev
        })
      }
    }
  }, [me?.store?.username, me?.store?.slug])


  async function persistAvatarUrl(url) {
    const nextUrl = url || null
    clearTimeout(saveTimer.current)
    setStore((prev) => {
      if (!prev) return prev
      const next = {
        ...prev,
        avatarUrl: nextUrl,
        theme: { ...(prev.theme || {}), avatarUrl: nextUrl },
      }
      storeRef.current = next
      return next
    })
    updateDashboardProfile?.({ avatarUrl: nextUrl })
    setSavedTheme((prev) => (prev ? { ...prev, avatarUrl: nextUrl } : prev))
    const themeToSave = { ...(storeRef.current?.theme || {}), avatarUrl: nextUrl }
    await Promise.all([
      api.patch('/store', { avatarUrl: nextUrl, theme: themeToSave }),
      api.patch('/me/profile', { avatarUrl: nextUrl }),
    ])
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      if (res?.url) {
        await persistAvatarUrl(res.url)
        setAvatarModalOpen(false)
        toast.success('Profile image updated!')
      }
    } catch (err) {
      toast.error(err.message || 'Avatar upload failed')
    } finally {
      setUploadingAvatar(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleConnectInstagram() {
    try {
      const res = await api.get('/integrations/instagram/oauth?returnUrl=/dashboard/store')
      if (res?.url) {
        window.location.href = res.url
      }
    } catch (err) {
      toast.error(err.message || 'Failed to initiate Instagram OAuth')
    }
  }

  async function handleDisconnectInstagram() {
    try {
      await api.delete('/integrations/instagram/account')
      setIgAccount({ connected: false, username: '' })
      toast.success('Instagram disconnected')
    } catch (err) {
      toast.error(err.message || 'Failed to disconnect Instagram')
    }
  }

  const connectInstagram = handleConnectInstagram
  const disconnectInstagram = handleDisconnectInstagram

  // --- Multi-page management -----------------------------------------------
  async function handleAddPage() {
    if (!addPageName.trim()) return
    if (isPageLimitReached) {
      setAddPageOpen(false)
      setPageLimitModalOpen(true)
      return
    }
    setAddPageLoading(true)
    try {
      const res = await api.post('/store/pages', { name: addPageName.trim() })
      const newPages = res.pages || []
      setPages(newPages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      setStore(prev => prev ? { ...prev, pages: newPages } : prev)
      setActivePageId(res.page?.id || null)
      setAddPageOpen(false)
      setAddPageName('')
      toast.success(`Page "${res.page?.name}" created`)
    } catch (err) {
      if (err.code === 'PAGE_LIMIT_REACHED' || err.status === 403) {
        setAddPageOpen(false)
        setPageLimitErrorData({
          message: err.message,
          currentCount: err.currentCount || currentPagesCount,
          limit: err.limit || maxPages,
          plan: err.plan || currentPlan
        })
        setPageLimitModalOpen(true)
      } else {
        toast.error(err.message || 'Could not create page')
      }
    } finally {
      setAddPageLoading(false)
    }
  }

  async function handleDuplicatePage(pageId) {
    if (!pageId) return
    if (isPageLimitReached) {
      setPageLimitModalOpen(true)
      return
    }
    setDuplicatePageLoadingId(pageId)
    try {
      const res = await api.post(`/store/pages/${pageId}/duplicate`, {})
      const newPages = res.pages || []
      setPages(newPages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      setStore(prev => prev ? { ...prev, pages: newPages } : prev)
      if (res.page?.id) {
        setActivePageId(res.page.id)
      }
      toast.success(`Page "${res.page?.name}" duplicated`)
    } catch (err) {
      if (err.code === 'PAGE_LIMIT_REACHED' || err.status === 403) {
        setPageLimitErrorData({
          message: err.message,
          currentCount: err.currentCount || currentPagesCount,
          limit: err.limit || maxPages,
          plan: err.plan || currentPlan
        })
        setPageLimitModalOpen(true)
      } else {
        toast.error(err.message || 'Could not duplicate page')
      }
    } finally {
      setDuplicatePageLoadingId(null)
    }
  }

  async function handleRenamePage() {
    if (!renamePageTarget || !renamePageName.trim()) return
    setRenamePageLoading(true)
    try {
      const res = await api.patch(`/store/pages/${renamePageTarget.id}`, { name: renamePageName.trim() })
      const newPages = res.pages || []
      setPages(newPages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      setStore(prev => prev ? { ...prev, pages: newPages } : prev)
      setRenamePageOpen(false)
      setRenamePageTarget(null)
      setRenamePageName('')
      toast.success('Page renamed')
    } catch (err) {
      toast.error(err.message || 'Could not rename page')
    } finally {
      setRenamePageLoading(false)
    }
  }

  async function handleDeletePage() {
    if (!deletePageTarget) return
    setDeletePageLoading(true)
    try {
      const res = await api.delete(`/store/pages/${deletePageTarget.id}`)
      const newPages = res.pages || []
      setPages(newPages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      setStore(prev => prev ? {
        ...prev,
        pages: newPages,
        sections: (prev.sections || []).filter(s => s.pageId !== deletePageTarget.id),
      } : prev)
      setActivePageId(null) // Switch to home
      setDeletePageOpen(false)
      setDeletePageTarget(null)
      toast.success(`Page "${deletePageTarget.name}" deleted`)
    } catch (err) {
      toast.error(err.message || 'Could not delete page')
    } finally {
      setDeletePageLoading(false)
    }
  }

  // Applies wizard edits to the card and preview instantly, then persists on a
  // debounce. Fields accumulate so one flush sends everything typed in the
  // window, not just the last keystroke's field.
  function patchDraftProduct(partial) {
    const currentId = draftProductId
    if (!currentId) return

    setProducts((prev) => prev.map((p) => (p.id === currentId ? { ...p, ...partial } : p)))
    setDraftSaveState('saving')
    pendingDraftPatch.current = { ...pendingDraftPatch.current, ...partial }

    clearTimeout(draftPatchTimer.current)
    draftPatchTimer.current = setTimeout(async () => {
      const body = pendingDraftPatch.current
      pendingDraftPatch.current = {}
      try {
        await api.patch(`/products/${currentId}`, body)
        setDraftSaveState('saved')
        clearTimeout(draftSavedTimer.current)
        draftSavedTimer.current = setTimeout(() => setDraftSaveState('idle'), 2000)
      } catch (err) {
        setDraftSaveState('idle')
        toast.error(err.message || 'Could not save changes')
      }
    }, 600)
  }

  // For responses that already reflect a server-side write (file attach), so we
  // refresh the card and preview without firing a redundant PATCH.
  function mergeDraftFromServer(serverProduct) {
    if (!serverProduct?.id) return
    const formatted = toPreviewProduct(serverProduct)
    setProducts((prev) => prev.map((p) => (p.id === formatted.id ? { ...p, ...formatted } : p)))
  }

  // The only place a new Digital Product is written to the database.
  // Until this succeeds, wizard data lives only in DigitalProductForm state.
  async function finishDigitalProduct(payload = {}) {
    if (completingProduct) return
    setCompletingProduct(true)
    try {
      const existingId = draftProductId || pendingCreateId.current
      const isHome = !activePageId || activePageId === 'home' || Boolean(pages.find(p => p.id === activePageId || p.slug === activePageId)?.isDefault)
      const targetPageId = isHome ? null : activePageId

      if (existingId) {
        clearTimeout(draftPatchTimer.current)
        const pending = pendingDraftPatch.current
        pendingDraftPatch.current = {}
        const updated = await api.patch(`/products/${existingId}`, {
          ...pending,
          title: payload.title,
          description: payload.description,
          shortDescription: payload.description,
          price: payload.price,
          currency: payload.currency,
          redirectUrl: payload.redirectUrl || null,
          status: 'PUBLISHED',
          storePublished: true,
        })
        let formatted = toPreviewProduct(updated.product || updated)
        if (payload.pendingFile) {
          const fd = new FormData()
          fd.append('file', payload.pendingFile)
          const up = await api.upload(`/products/${existingId}/file`, fd)
          formatted = toPreviewProduct(up.product || formatted)
        }
        if (payload.pendingThumbFile) {
          const fd = new FormData()
          fd.append('file', payload.pendingThumbFile)
          const up = await api.upload('/upload', fd)
          const patched = await api.patch(`/products/${existingId}`, { thumbnail: up.url })
          formatted = toPreviewProduct(patched.product || { ...formatted, thumbnail: up.url })
        }
        const alreadyListed = products.some((p) => p.id === formatted.id)
        setProducts((prev) => (
          alreadyListed
            ? prev.map((p) => (p.id === formatted.id ? formatted : p))
            : [formatted, ...prev]
        ))
        let nextSections = [...(storeRef.current?.sections || store?.sections || [])]
        if (draftSectionId) {
          nextSections = nextSections.map((sec) => sec.id === draftSectionId ? { ...sec, hidden: false } : sec)
        } else {
          const hasSection = nextSections.some(sec => (sec.type === 'product' || sec.type === 'course') && (sec.props?.productId === formatted.id || sec.props?.courseId === formatted.id))
          if (!hasSection) {
            const section = {
              id: uuidv4(),
              type: 'product',
              hidden: false,
              pageId: targetPageId,
              props: { productId: formatted.id, layout: 'classic' },
            }
            nextSections.push(section)
          }
        }
        clearTimeout(saveTimer.current)
        try {
          const storeRes = await api.patch('/store', { sections: nextSections })
          const finalSections = Array.isArray(storeRes?.store?.sections) ? storeRes.store.sections : nextSections
          setStore((prev) => prev ? { ...prev, sections: finalSections } : prev)
          storeRef.current = { ...(storeRef.current || {}), sections: finalSections }
          setSaveState('saved')
        } catch {
          updateStore((s) => { s.sections = nextSections; return s })
        }
        pendingCreateId.current = null
        toast.success(`Product added! 🎉 ${formatted.title}`)
        closeDraftWizard()
        return
      }

      const title = (payload.title || '').trim() || 'Untitled product'
      const res = await api.post('/products', {
        type: 'DIGITAL_DOWNLOAD',
        title,
        description: payload.description || '',
        shortDescription: payload.description || '',
        thumbnail: payload.thumbnailUrl || '',
        price: Number(payload.price) || 0,
        currency: payload.currency || 'inr',
        status: 'DRAFT',
        storePublished: false,
      })
      let created = res.product || res
      pendingCreateId.current = created.id

      if (payload.redirectUrl) {
        const patched = await api.patch(`/products/${created.id}`, { redirectUrl: payload.redirectUrl })
        created = patched.product || patched || created
      }

      if (payload.pendingThumbFile) {
        const fd = new FormData()
        fd.append('file', payload.pendingThumbFile)
        const up = await api.upload('/upload', fd)
        const thumbPatched = await api.patch(`/products/${created.id}`, { thumbnail: up.url })
        created = thumbPatched.product || thumbPatched || { ...created, thumbnail: up.url }
      }

      if (payload.pendingFile) {
        const fd = new FormData()
        fd.append('file', payload.pendingFile)
        const up = await api.upload(`/products/${created.id}/file`, fd)
        created = up.product || created
      }

      const published = await api.patch(`/products/${created.id}`, {
        status: 'PUBLISHED',
        storePublished: true,
      })
      created = published.product || published || created
      trackProductCreated({ product_type: created.type || 'digital' })
      trackProductPublished({ product_type: created.type || 'digital' })

      const formatted = toPreviewProduct(created)
      setProducts((prev) => [formatted, ...prev.filter((p) => p.id !== formatted.id)])
      const section = {
        id: uuidv4(),
        type: 'product',
        hidden: false,
        pageId: targetPageId,
        props: { productId: formatted.id, layout: 'classic' },
      }
      const currentSections = [...(storeRef.current?.sections || store?.sections || [])]
      const nextSections = [...currentSections, section]

      clearTimeout(saveTimer.current)
      try {
        const storeRes = await api.patch('/store', { sections: nextSections })
        trackStoreLinkAdded()
        const finalSections = Array.isArray(storeRes?.store?.sections) ? storeRes.store.sections : nextSections
        setStore((prev) => prev ? { ...prev, sections: finalSections } : prev)
        storeRef.current = { ...(storeRef.current || {}), sections: finalSections }
        setSaveState('saved')
      } catch {
        updateStore((s) => { s.sections = nextSections; return s })
      }

      setSelectedId(section.id)
      pendingCreateId.current = null
      toast.success(`Product added! 🎉 ${formatted.title}`)
      closeDraftWizard()
    } catch (err) {
      toast.error(err.message || 'Failed to create product')
    } finally {
      setCompletingProduct(false)
    }
  }

  function closeDraftWizard() {
    discardPendingCreate()
    setDraftProductId(null)
    setDraftSectionId(null)
    setDraftSaveState('idle')
    setWizardDirty(false)
    setAddModalOpen(false)
    setAddModalType('menu')
    setWizardStep(1)
  }

  function requestCloseAddModal() {
    if (addModalType === 'digital_product' && wizardDirty) {
      const ok = typeof window !== 'undefined'
        && window.confirm("Discard this product? Your changes won't be saved.")
      if (!ok) {
        setAddModalOpen(true)
        return
      }
    }
    closeDraftWizard()
  }

  // Inline card edits (rename, price tweak) — persisted directly, no wizard.
  async function commitInlineProductEdit(productId, field, rawValue) {
    setInlineProdKey(null)
    const current = products.find((p) => p.id === productId || p.courseId === productId)
    if (!current) return

    const value = field === 'price' ? (rawValue === '' ? 0 : Number(rawValue)) : String(rawValue).trim()
    if (field === 'price' && isNaN(value)) return toast.error('Enter a valid price')
    if (field === 'title' && !value) return toast.error('Product name cannot be empty')
    if (current[field] === value) return

    setProducts((prev) => prev.map((p) => (p.id === productId || p.courseId === productId ? { ...p, [field]: value } : p)))
    try {
      if (current.id) {
        await api.patch(`/products/${current.id}`, { [field]: value }).catch(() => { })
      }
      if (current.type === 'COURSE' || String(current.type).toLowerCase() === 'course') {
        const cTargetId = current.courseId || current.id
        await api.patch(`/courses/${cTargetId}`, { [field]: value }).catch(() => { })
      }
      setSavedProductId(productId)
      setTimeout(() => setSavedProductId((id) => (id === productId ? null : id)), 2000)
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === productId || p.courseId === productId ? current : p)))
      toast.error(err.message || 'Could not save change')
    }
  }

  const [movingUpId, setMovingUpId] = useState(null)

  function moveSectionUp(sectionId) {
    if (movingUpId) return
    setMovingUpId(sectionId)

    let moved = false
    updateStore((s) => {
      const all = s.sections || []

      // Canonical collection membership set
      const collectionProdIds = new Set()
      for (const sec of all) {
        if (sec.type === 'collection' || sec.type === 'product_collection') {
          const items = sec.props?.items
          if (Array.isArray(items)) {
            for (const it of items) {
              if (!it) continue
              if (it.productId) collectionProdIds.add(String(it.productId))
              if (it.courseId) collectionProdIds.add(String(it.courseId))
              if (it.type === 'product' && it.id) collectionProdIds.add(String(it.id))
            }
          }
        }
      }

      const currentActive = all.filter((sec) => {
        if (sec.type === 'profile') return false
        const hasPages = pages.length > 1
        if (hasPages) {
          const sPageId = sec.pageId || null
          if (isHomeSelected) {
            if (sPageId && sPageId !== 'home' && sPageId !== selectedPageId) return false
          } else if (sPageId !== selectedPageId && (!selectedPageObj?.slug || sPageId !== selectedPageObj.slug)) {
            return false
          }
        }
        if (sec.type === 'product' || sec.type === 'course') {
          const pid = sec.props?.productId || sec.props?.courseId || sec.props?.id || (!sec.props?.productId && products?.[0]?.id ? products[0].id : null)
          if (pid && collectionProdIds.has(String(pid))) return false
        }
        return true
      })

      const idx = currentActive.findIndex((sec) => sec.id === sectionId)
      if (idx > 0) {
        // Swap with previous item (move exactly 1 position up)
        const prevItem = currentActive[idx - 1]
        currentActive[idx - 1] = currentActive[idx]
        currentActive[idx] = prevItem
        moved = true

        const profileSec = all.find((sec) => sec.type === 'profile')
        const otherSections = all.filter((sec) => sec.type !== 'profile' && !currentActive.find((n) => n.id === sec.id))
        s.sections = [
          ...(profileSec ? [profileSec] : []),
          ...currentActive,
          ...otherSections,
        ]
      }
      return s
    })

    if (moved) {
      toast.success('Moved up successfully')
    }
    setTimeout(() => {
      setMovingUpId(null)
    }, 250)
  }

  // Deep-link helper: /dashboard/store?intent=add_product (from onboarding)
  // or /dashboard/store?intent=edit_product&productId=xxx (from products list)
  // or /dashboard/store?add=course|booking|digital_product
  useEffect(() => {
    const intent = searchParams?.get('intent')
    const targetProdId = searchParams?.get('productId')
    const targetSecId = searchParams?.get('sectionId')
    const addParam = searchParams?.get('add')

    if (intent) {
      const intentKey = `${intent}:${targetProdId || targetSecId || ''}`
      if (consumedAddIntent === intentKey) return
      consumedAddIntent = intentKey

      if (intent === 'add_product' || intent === 'new_product') {
        handleNewProduct()
      } else if (intent === 'edit_product' && targetProdId) {
        setEditingProductId(targetProdId)
        setModalOrigin('direct')
      } else if (intent === 'edit_section' && targetSecId) {
        setEditingSectionId(targetSecId)
        setModalOrigin('direct')
      }
    } else if (addParam) {
      const addKey = `add:${addParam}`
      if (consumedAddIntent === addKey) return
      consumedAddIntent = addKey

      if (addParam === 'booking' || addParam === 'coaching') {
        openCoachingCreationFlow()
      } else if (addParam === 'digital_product' || addParam === 'product' || addParam === 'course') {
        openDigitalProductWizard()
      } else {
        handleAddToStore(addParam === 'social' ? 'social' : 'suggested')
      }
    }
  }, [searchParams, openDigitalProductWizard, openCoachingCreationFlow, handleAddToStore])

  const resumeDigitalProductDraft = useCallback((sectionOrProd, prodOrSection) => {
    let section = null
    let product = null
    if (sectionOrProd?.props || sectionOrProd?.type) {
      section = sectionOrProd
      product = prodOrSection
    } else {
      product = sectionOrProd
      section = prodOrSection
    }

    if (!product) return

    discardPendingCreate()
    setDraftProductId(product.id)
    setDraftSectionId(section?.id || null)
    setDraftSaveState('idle')
    if (section?.id) setSelectedId(section.id)
    setModalOrigin('direct')

    let initialStep = 1
    if (product.redirectUrl || product.fileId || product.fileName) {
      if (product.title && product.title !== 'Untitled product') {
        initialStep = 3
      } else {
        initialStep = 2
      }
    }
    setWizardStep(initialStep)
    setAddModalType('digital_product')
    setAddModalOpen(true)
  }, [discardPendingCreate])

  const openEditDigitalProduct = resumeDigitalProductDraft

  useEffect(() => () => {
    clearTimeout(draftPatchTimer.current)
    clearTimeout(draftSavedTimer.current)
  }, [])

  async function addSectionWithProps(type, customProps = {}) {
    if (!canCreate) {
      toast.error('Your Pro trial has ended. Upgrade your plan to edit your store layout.')
      setPricingModalOpen(true)
      return
    }
    const isHome = !activePageId || activePageId === 'home' || Boolean(pages.find(p => p.id === activePageId || p.slug === activePageId)?.isDefault)
    const targetPageId = isHome ? null : activePageId
    if ((type === 'product' || type === 'course') && (customProps.productId || customProps.courseId)) {
      const targetId = customProps.productId || customProps.courseId
      const targetCourseId = customProps.courseId || null
      const alreadyExists = store?.sections?.some(
        (s) => (s.type === 'product' || s.type === 'course') &&
          (s.props?.productId === targetId || s.props?.courseId === targetId || (targetCourseId && (s.props?.productId === targetCourseId || s.props?.courseId === targetCourseId))) &&
          (targetPageId ? s.pageId === targetPageId : (!s.pageId || s.pageId === 'home'))
      )
      if (alreadyExists) {
        setAddModalOpen(false)
        setAddModalType('menu')
        return
      }
    }
    const props = { ...defaultProps(type, products), ...customProps }
    const section = { id: uuidv4(), type, hidden: false, pageId: targetPageId, props }
    const currentSections = [...(storeRef.current?.sections || store?.sections || [])]
    const nextSections = [...currentSections, section]
    setStore((prev) => prev ? { ...prev, sections: nextSections } : { sections: nextSections, theme: {} })
    storeRef.current = { ...(storeRef.current || {}), sections: nextSections }
    setSelectedId(section.id)
    setAddModalOpen(false)
    setAddModalType('menu')
    toast.success(`Added ${LABELS[type] || 'item'} to your store!`)

    clearTimeout(saveTimer.current)
    try {
      const storeRes = await api.patch('/store', { sections: nextSections })
      if (storeRes?.store?.sections) {
        const finalSections = Array.isArray(storeRes.store.sections) ? storeRes.store.sections : nextSections
        setStore((prev) => prev ? { ...prev, sections: finalSections } : prev)
        storeRef.current = { ...(storeRef.current || {}), sections: finalSections }
      }
      setSaveState('saved')
    } catch {
      scheduleSave({ ...(storeRef.current || {}), sections: nextSections })
    }
    return section
  }

  function safeUrlValidate(urlStr) {
    if (!urlStr) return ''
    let cleaned = urlStr.trim()
    if (cleaned.startsWith('javascript:') || cleaned.startsWith('data:') || cleaned.startsWith('file:')) {
      return ''
    }
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = `https://${cleaned}`
    }
    return cleaned
  }

  const profile = me?.profile

  const scheduleSave = useCallback((next, immediate = false) => {
    setSaveState('saving')
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    const runSave = async () => {
      const thisSeq = ++saveSeqRef.current
      try {
        const latest = storeRef.current || next
        const res = await api.patch('/store', {
          theme: latest.theme,
          sections: latest.sections,
          avatarUrl: latest.avatarUrl,
          bio: latest.bio,
        })
        // Stale response check: If a newer save was triggered while this was in flight, ignore
        if (thisSeq !== saveSeqRef.current) return

        if (res?.store) {
          const canonicalSections = Array.isArray(res.store.sections) ? res.store.sections : (latest.sections || [])
          setStore((prev) => {
            if (!prev) return res.store
            const live = storeRef.current || prev
            return {
              ...prev,
              ...res.store,
              sections: canonicalSections,
              avatarUrl: live.avatarUrl !== undefined ? live.avatarUrl : (res.store.avatarUrl ?? prev.avatarUrl),
              theme: {
                ...(res.store.theme || {}),
                ...(live.theme || {}),
                avatarUrl: live.theme?.avatarUrl !== undefined
                  ? live.theme.avatarUrl
                  : (live.avatarUrl !== undefined ? live.avatarUrl : res.store.theme?.avatarUrl),
              },
            }
          })
          storeRef.current = {
            ...storeRef.current,
            ...res.store,
            sections: canonicalSections,
          }
          setEditingCollection((prev) => {
            if (!prev) return null
            const updated = canonicalSections.find((x) => x.id === prev.id)
            return updated || prev
          })
        }
        setSaveState('saved')
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('creatorstore:setup-updated'))
        }
      } catch (e) {
        if (thisSeq === saveSeqRef.current) {
          setSaveState('dirty')
          toast.error('Failed to save changes')
        }
      }
    }

    if (immediate) {
      runSave()
    } else {
      saveTimer.current = setTimeout(runSave, 350)
    }
  }, [])

  function updateStore(mutator, options = {}) {
    const current = storeRef.current || store || { sections: [], theme: {} }
    const base = structuredClone(current)
    if (!Array.isArray(base.sections)) base.sections = []
    const mutated = mutator(base)
    const nextState = mutated !== undefined ? mutated : base
    storeRef.current = nextState
    setStore(nextState)
    scheduleSave(nextState, Boolean(options?.immediate))
    return nextState
  }

  // Update theme locally for immediate live preview without auto-persisting to DB
  function updateThemeLocally(patch) {
    if (themeSaveTimerRef.current) {
      clearTimeout(themeSaveTimerRef.current)
    }
    setStore((prev) => {
      if (!prev) return prev
      const nextTheme = { ...(prev.theme || {}), ...patch }
      const nextStore = { ...prev, theme: nextTheme }
      storeRef.current = nextStore
      return nextStore
    })
    setThemeSaveState('idle')
  }

  useEffect(() => {
    storeRef.current = store
  }, [store])

  // Cleanup theme save confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (themeSaveTimerRef.current) {
        clearTimeout(themeSaveTimerRef.current)
      }
    }
  }, [])

  // Explicit Save Theme Handler
  const saveTheme = useCallback(async () => {
    const currentStore = storeRef.current || store
    if (!currentStore || themeSaveState === 'saving') return false

    const thisSeq = ++themeSaveSeqRef.current
    setThemeSaveState('saving')
    if (themeSaveTimerRef.current) {
      clearTimeout(themeSaveTimerRef.current)
    }

    const themeToSave = structuredClone(currentStore.theme || {})

    try {
      const payload = {
        theme: themeToSave,
        sections: currentStore.sections,
      }
      if (themeToSave.avatarUrl !== undefined) {
        payload.avatarUrl = themeToSave.avatarUrl
      }
      if (themeToSave.headerBio !== undefined) {
        payload.bio = themeToSave.headerBio
      }

      const res = await api.patch('/store', payload)
      // Stale response check: If a newer save was triggered while this was in flight, ignore
      if (thisSeq !== themeSaveSeqRef.current) return false

      trackStoreDesignUpdated()
      trackStoreUpdated()
      if (themeToSave.avatarUrl) {
        api.patch('/me/profile', { avatarUrl: themeToSave.avatarUrl }).catch(() => { })
      }
      const updatedStore = res?.store || currentStore
      const finalTheme = updatedStore.theme || themeToSave

      setStore((prev) => {
        if (!prev) return prev
        const nextStore = { ...prev, ...updatedStore, theme: finalTheme }
        storeRef.current = nextStore
        return nextStore
      })
      setSavedTheme(structuredClone(finalTheme))
      setThemeSaveState('saved')
      toast.success('Theme saved successfully.')
      themeSaveTimerRef.current = setTimeout(() => {
        setThemeSaveState('idle')
      }, 2500)
      return true
    } catch (err) {
      if (thisSeq === themeSaveSeqRef.current) {
        setThemeSaveState('error')
        toast.error("Couldn't save changes. Please try again.")
      }
      return false
    }
  }, [store, themeSaveState])

  // Handle View Store navigation safely with unsaved changes
  const handleViewStore = useCallback(async (e) => {
    if (hasUnsavedThemeChanges) {
      e?.preventDefault()
      const success = await saveTheme()
      if (success) {
        const slug = storeRef.current?.slug || storeRef.current?.username || me?.profile?.username || ''
        if (slug) {
          window.open(`/${slug}`, '_blank', 'noopener,noreferrer')
        }
      }
    }
  }, [hasUnsavedThemeChanges, saveTheme, me])

  // Explicit Revert Theme Handler
  const revertTheme = useCallback(() => {
    if (!savedTheme || themeSaveState === 'saving') return
    if (themeSaveTimerRef.current) {
      clearTimeout(themeSaveTimerRef.current)
    }
    const restoredTheme = structuredClone(savedTheme)
    setStore((prev) => {
      if (!prev) return prev
      const nextStore = { ...prev, theme: restoredTheme }
      storeRef.current = nextStore
      return nextStore
    })
    setThemeSaveState('idle')
    toast.info('Reverted to last saved theme')
  }, [savedTheme, themeSaveState])

  // Set top-right header for Store tab
  useEffect(() => {
    if (tab === 'section') {
      setHeaderConfig({
        title: 'Store',
        actions: null
      })
    }
  }, [tab, setHeaderConfig])

  const selected = store?.sections?.find((s) => s.id === selectedId)
  // Filter sections by active page. null = home (sections with no pageId). Otherwise match pageId.
  const allSections = store?.sections || []
  const isHomeSelected = !activePageId || activePageId === 'home' || Boolean(pages.find(p => p.id === activePageId || p.slug === activePageId)?.isDefault)
  const selectedPageObj = pages.find(p => p.id === activePageId || p.slug === activePageId)
  const selectedPageId = selectedPageObj?.id || activePageId

  // Canonical collection membership set
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

  const contentSections = allSections.filter((s) => {
    if (s.type === 'profile') return false
    const hasPagesEnabled = pages.length > 1
    if (hasPagesEnabled) {
      const sPageId = s.pageId || null
      if (isHomeSelected) {
        if (sPageId && sPageId !== 'home' && sPageId !== selectedPageId) return false
      } else if (sPageId !== selectedPageId && (!selectedPageObj?.slug || sPageId !== selectedPageObj.slug)) {
        return false
      }
    }
    // If an item belongs to a collection, render it ONLY inside its collection (exclude from top-level)
    if (s.type === 'product' || s.type === 'course') {
      const pid = s.props?.productId || s.props?.courseId || s.props?.id || (!s.props?.productId && products?.[0]?.id ? products[0].id : null)
      if (pid && collectionProductIds.has(String(pid))) {
        return false
      }
    }
    return true
  })

  function addSection(type) {
    const targetPageId = isHomeSelected ? null : (selectedPageId || null)
    const section = { id: uuidv4(), type, hidden: false, pageId: targetPageId, props: defaultProps(type, products) }
    updateStore((s) => { s.sections.push(section); return s })
    setSelectedId(section.id); handleTabChange('section')
  }
  function updateSectionProps(id, patch) {
    updateStore((s) => { const sec = s.sections.find((x) => x.id === id); if (sec) sec.props = { ...sec.props, ...patch }; return s })
  }
  const saveSectionProps = useCallback(async (id, patch) => {
    let nextSections = []
    let updatedSection = null
    const current = storeRef.current || store || { sections: [], theme: {} }
    const base = structuredClone(current)
    if (!Array.isArray(base.sections)) base.sections = []

    base.sections = base.sections.map((s) => {
      if (s.id === id) {
        updatedSection = { ...s, props: { ...s.props, ...patch } }
        return updatedSection
      }
      return s
    })
    nextSections = base.sections
    base.sections = nextSections

    storeRef.current = base
    setStore(base)
    setSaveState('saving')

    try {
      const res = await api.patch('/store', {
        theme: base.theme,
        sections: base.sections,
        avatarUrl: base.avatarUrl,
        bio: base.bio,
      })
      if (res?.store) {
        const canonicalSections = Array.isArray(res.store.sections) ? res.store.sections : nextSections
        const merged = {
          ...res.store,
          sections: canonicalSections,
        }
        setStore((prev) => ({ ...(prev || {}), ...merged }))
        storeRef.current = { ...(storeRef.current || {}), ...merged }
      }
      setSaveState('saved')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('creatorstore:setup-updated'))
      }
      return { success: true, section: updatedSection }
    } catch (err) {
      setSaveState('dirty')
      throw err
    }
  }, [store])
  function toggleHidden(id) { updateStore((s) => { const sec = s.sections.find((x) => x.id === id); if (sec) sec.hidden = !sec.hidden; return s }) }
  function duplicate(id) {
    updateStore((s) => { const i = s.sections.findIndex((x) => x.id === id); if (i >= 0) s.sections.splice(i + 1, 0, { ...structuredClone(s.sections[i]), id: uuidv4() }); return s })
  }
  const remove = useCallback((id) => {
    if (!id) return
    if (selectedId === id) setSelectedId(null)
    updateStore((s) => {
      const targetSec = s.sections.find((x) => x.id === id)
      if (targetSec && (targetSec.type === 'collection' || targetSec.type === 'product_collection')) {
        const items = targetSec.props?.items || []
        for (const it of items) {
          if (it.type === 'product' && (it.productId || it.id)) {
            const prodId = it.productId || it.id
            const hasSection = s.sections.some(
              (x) => (x.type === 'product' || x.type === 'course') &&
                (x.props?.productId === prodId || x.props?.courseId === prodId)
            )
            if (!hasSection) {
              s.sections.push({
                id: uuidv4(),
                type: 'product',
                hidden: false,
                pageId: targetSec.pageId || null,
                props: { productId: prodId, layout: 'classic' }
              })
            }
          }
        }
      }
      s.sections = s.sections.filter((x) => x.id !== id)
      return s
    })
  }, [selectedId])
  function reorder(newContentSections) {
    updateStore((s) => {
      const profileSec = s.sections.find((x) => x.type === 'profile')
      // Keep sections from OTHER pages intact, only reorder the active page's sections
      const otherPageSections = s.sections.filter((x) => x.type !== 'profile' && !newContentSections.find(n => n.id === x.id))
      const sanitized = newContentSections.filter((x) => x.type !== 'profile')
      s.sections = [
        ...(profileSec ? [profileSec] : []),
        ...sanitized,
        ...otherPageSections,
      ]
      return s
    })
  }

  async function publish() {
    setPublishing(true)
    try {
      const res = await api.post('/store/publish')
      const targetStore = res?.store || (res?.id ? res : null)
      if (targetStore) {
        setStore(targetStore)
        const slug = targetStore.slug || targetStore.username || res.slug || res.username
        const url = res.publicUrl || (slug ? `/${slug}` : '')
        toast.success(`Store published live at ${url}!`)
      }
      setShareOpen(true)
    } catch (e) { toast.error(e.message) } finally { setPublishing(false) }
  }

  const isProfileComplete = !!(profile?.name && (profile?.avatarUrl || profile?.bio))
  const isProductsAdded = products.length > 0
  const isThemeSelected = !!(store?.theme?.presetId)
  const isStorePublished = !!(store?.published)
  const isSocialsAdded = !!(profile?.socialLinks && Object.values(profile.socialLinks).some(Boolean))

  const readinessChecks = [
    { label: 'Profile', done: isProfileComplete, weight: 20 },
    { label: 'Product', done: isProductsAdded, weight: 25 },
    { label: 'Theme', done: isThemeSelected, weight: 20 },
    { label: 'Publish', done: isStorePublished, weight: 20 },
    { label: 'Socials', done: isSocialsAdded, weight: 15 },
  ]
  const readinessPercent = readinessChecks.reduce((acc, c) => acc + (c.done ? c.weight : 0), 0)

  async function applyTemplate(tmpl) {
    const newSections = tmpl.sections.map((sec) => ({
      ...sec,
      id: uuidv4(),
      props: defaultProps(sec.type, products),
    }))
    updateStore((s) => {
      s.sections = newSections
      return s
    })
    setTemplateOpen(false)
    toast.success(`Applied ${tmpl.name} template!`)
  }

  if (loading) return (
    <div className="flex h-[60vh] flex-col items-center justify-center bg-[var(--bg-page,#1C1C1C)] p-8 select-none">
      <CreatorStoreLoader size="xl" badge badgeBg="#000000" ariaLabel="Loading store builder..." />
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
        Loading store builder...
      </p>
    </div>
  )

  const storeSlug = store?.slug || store?.username || me?.store?.slug || me?.store?.username || ''
  const storeUrl = typeof window !== 'undefined' && storeSlug ? `${window.location.origin}/${storeSlug}` : ''

  // Shared Preview Canvas Component
  const PreviewCanvas = (
    <div className="rounded-2xl border border-[var(--border-subtle,#303030)] bg-[var(--bg-surface,#242424)] p-4 sm:p-6 shadow-sm flex flex-col items-center overflow-x-auto min-w-0">
      {/* Device Switcher Segmented Control (Only Mobile and Desktop) */}
      <div className="mb-4 flex items-center justify-center gap-1 rounded-full border border-[var(--border-subtle,#303030)] bg-[var(--bg-surface-hover,#2A2A2A)] p-1 w-fit shrink-0">
        {[
          { k: 'mobile', label: 'Mobile', i: Smartphone },
          { k: 'desktop', label: 'Desktop', i: Monitor },
        ].map((d) => (
          <button
            key={d.k}
            type="button"
            onClick={() => setDevice(d.k)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-all cursor-pointer ${device === d.k ? 'bg-[var(--accent-primary)] text-[var(--text-heading,#F5F5F5)] shadow-xs' : 'text-[var(--text-secondary,#A3A3A3)] hover:text-[var(--text-heading,#F5F5F5)]'
              }`}
          >
            <d.i className="h-3.5 w-3.5" />
            <span>{d.label}</span>
          </button>
        ))}
      </div>

      {/* Store Preview Frame */}
      <div className="w-full flex justify-center overflow-x-auto py-2">
        {device === 'mobile' ? (
          /* REALISTIC MOBILE PHONE CANVAS (390px x 844px) */
          <div className="w-[390px] max-w-[calc(100vw-40px)] h-[844px] rounded-[2.5rem] border-[10px] border-[var(--border-subtle,#303030)] bg-[var(--bg-sidebar,#0D0D0D)] shadow-2xl overflow-hidden flex flex-col shrink-0 transition-all duration-300">
            {/* Mobile Top Pill Notch Bar */}
            <div className="w-full bg-[var(--bg-sidebar,#0D0D0D)] py-2 flex justify-center items-center border-b border-[var(--border-subtle,#303030)] shrink-0">
              <div className="h-3.5 w-24 bg-[var(--bg-surface-hover,#2A2A2A)] rounded-full flex items-center justify-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--border-subtle,#303030)]"></div>
                <div className="h-1 w-12 rounded-full bg-[var(--border-subtle,#303030)]"></div>
              </div>
            </div>

            {/* Mobile Scrollable Viewport Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar w-full">
              <StorePreview
                key={`${store?.theme?.presetId || 'preset'}-mobile-${tab}`}
                store={previewStore}
                username={storeSlug}
                profile={{ ...(profile || {}), username: storeSlug || profile?.username }}
                products={products}
                pages={pages}
                activePageId={activePageId}
                onSelectPage={(targetId) => setActivePageId(targetId === 'home' ? null : targetId)}
                editor
                device="mobile"
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </div>
        ) : (
          /* REALISTIC DESKTOP BROWSER CANVAS (1100px x 720px) */
          <div className="w-[1100px] max-w-full md:min-w-[700px] h-[720px] max-h-[calc(100vh-180px)] rounded-xl border-[4px] border-[var(--border-subtle,#303030)] bg-[var(--bg-sidebar,#0D0D0D)] shadow-2xl overflow-hidden flex flex-col shrink-0 transition-all duration-300">
            {/* Desktop Top Browser Chrome Bar */}
            <div className="w-full bg-[var(--bg-sidebar,#0D0D0D)] px-4 py-2.5 flex items-center justify-between border-b border-[var(--border-subtle,#303030)] shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#FF5F56]" />
                <div className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
                <div className="h-3 w-3 rounded-full bg-[#27C93F]" />
              </div>
              <div className="flex-1 max-w-xs mx-auto bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] rounded-full px-3 py-1 text-[11px] font-mono text-[var(--text-secondary,#A3A3A3)] flex items-center justify-center gap-1.5 truncate">
                <span className="text-[var(--status-success,#22C55E)] font-bold">🔒 https://</span>
                <span className="text-[var(--text-heading,#F5F5F5)] truncate">creatorstore.store/{storeSlug || 'store'}</span>
              </div>
              <div className="w-12" />
            </div>

            {/* Desktop Scrollable Viewport Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar w-full">
              <div className="max-w-[1000px] mx-auto py-6 px-4 sm:px-8">
                <StorePreview
                  key={`${store?.theme?.presetId || 'preset'}-desktop-${tab}`}
                  store={previewStore}
                  username={storeSlug}
                  profile={{ ...(profile || {}), username: storeSlug || profile?.username }}
                  products={products}
                  pages={pages}
                  activePageId={activePageId}
                  onSelectPage={(targetId) => setActivePageId(targetId === 'home' ? null : targetId)}
                  editor
                  device="desktop"
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderActiveEditor = () => {
    if (editingProductId) {
      const prod = products.find((p) => p.id === editingProductId)
      if (prod) {
        if (prod?.type === 'COACHING') {
          return (
            <BookingEditor
              key={`prod-${editingProductId}`}
              product={prod}
              creatorProfile={profile}
              currentPlan={me?.user?.plan || 'FREE'}
              onBack={handleCloseEditor}
              onUpdateProps={(patch) => {
                if (patch.title) {
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? { ...p, title: patch.title } : p)))
                }
                if (patch.price !== undefined || patch.currency !== undefined) {
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? {
                    ...p,
                    ...(patch.price !== undefined ? { price: patch.price } : {}),
                    ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
                  } : p)))
                }
                if (patch.layout || patch.displayMode) {
                  const mode = patch.layout || patch.displayMode
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? { ...p, displayMode: mode } : p)))
                  setStore((prev) => {
                    if (!prev || !Array.isArray(prev.sections)) return prev
                    const nextSecs = prev.sections.map((sec) =>
                      sec.props?.productId === editingProductId
                        ? { ...sec, props: { ...sec.props, layout: mode, displayMode: mode } }
                        : sec
                    )
                    return { ...prev, sections: nextSecs }
                  })
                }
              }}
              onDelete={() => {
                setEditingProductId(null)
                refreshStoreData()
              }}
              onOpenMobilePreview={() => setShareOpen?.(true)}
            />
          )
        }

        if (prod?.type === 'BUNDLE') {
          return (
            <BundleEditor
              key={`prod-${editingProductId}`}
              product={prod}
              creatorProfile={profile}
              onBack={handleCloseEditor}
              onUpdateProps={(patch) => {
                if (patch.title) {
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? { ...p, title: patch.title } : p)))
                }
                if (patch.thumbnail !== undefined) {
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? { ...p, thumbnail: patch.thumbnail } : p)))
                }
                if (patch.price !== undefined || patch.currency !== undefined) {
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? {
                    ...p,
                    ...(patch.price !== undefined ? { price: patch.price } : {}),
                    ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
                  } : p)))
                }
                if (patch.layout || patch.displayMode) {
                  const mode = patch.layout || patch.displayMode
                  setProducts((prev) => prev.map((p) => (p.id === editingProductId ? { ...p, displayMode: mode } : p)))
                  setStore((prev) => {
                    if (!prev || !Array.isArray(prev.sections)) return prev
                    const nextSecs = prev.sections.map((sec) =>
                      sec.props?.productId === editingProductId
                        ? { ...sec, props: { ...sec.props, layout: mode, displayMode: mode } }
                        : sec
                    )
                    return { ...prev, sections: nextSecs }
                  })
                }
              }}
              onDelete={() => {
                setEditingProductId(null)
                refreshStoreData()
              }}
              onOpenMobilePreview={() => setShareOpen?.(true)}
            />
          )
        }

        return (
          <ProductEditor
            key={`prod-${editingProductId}`}
            productId={editingProductId}
            initialProduct={prod}
            isStoreContext={true}
            storeSlug={storeSlug || store?.username}
            onBack={handleCloseEditor}
            onProductUpdated={(updatedProd) => {
              const formatted = toPreviewProduct(updatedProd)
              setProducts((prev) => prev.map((prodItem) => (prodItem.id === formatted.id ? formatted : prodItem)))
              if (updatedProd.displayMode) {
                setStore((prev) => {
                  if (!prev || !Array.isArray(prev.sections)) return prev
                  const nextSections = prev.sections.map((sec) =>
                    sec.props?.productId === updatedProd.id
                      ? { ...sec, props: { ...sec.props, layout: updatedProd.displayMode, displayMode: updatedProd.displayMode } }
                      : sec
                  )
                  storeRef.current = { ...(storeRef.current || {}), sections: nextSections }
                  return { ...prev, sections: nextSections }
                })
              }
              refreshStoreData()
            }}
          />
        )
      } else if (products.length > 0) {
        return (
          <div key="prod-not-found" className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E3]">
              <h3 className="text-base font-bold text-[#1F1F1F]">Item Not Found</h3>
              <button
                type="button"
                onClick={handleCloseEditor}
                className="text-xs text-[#6F6F6B] hover:text-[#1F1F1F] font-semibold cursor-pointer"
              >
                Back to store
              </button>
            </div>
            <p className="text-sm text-[#6F6F6B]">
              This product could not be found or you do not have permission to access it.
            </p>
          </div>
        )
      }
    }

    if (editingSectionId && !editingSection && (store?.sections || []).length > 0) {
      return (
        <div key="sec-not-found" className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E3]">
            <h3 className="text-base font-bold text-[#1F1F1F]">Item Not Found</h3>
            <button
              type="button"
              onClick={handleCloseEditor}
              className="text-xs text-[#6F6F6B] hover:text-[#1F1F1F] font-semibold cursor-pointer"
            >
              Back to store
            </button>
          </div>
          <p className="text-sm text-[#6F6F6B]">
            This store item could not be found or you do not have permission to access it.
          </p>
        </div>
      )
    }

    if (editingSection) {
      return isBookingItem(editingSection, products) ? (
        <BookingEditor
          section={editingSection}
          product={resolveSectionProduct(editingSection, products)}
          creatorProfile={profile}
          currentPlan={me?.user?.plan || 'FREE'}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => {
            updateSectionProps(editingSection.id, patch)
            const targetPid = editingSection.props?.productId || resolveSectionProduct(editingSection, products)?.id
            if (targetPid) {
              setProducts((prev) => prev.map((p) => (p.id === targetPid ? {
                ...p,
                ...(patch.title ? { title: patch.title } : {}),
                ...(patch.price !== undefined ? { price: patch.price } : {}),
                ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
              } : p)))
            }
          }}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : isBundleItem(editingSection, products) ? (
        <BundleEditor
          section={editingSection}
          product={resolveSectionProduct(editingSection, products)}
          creatorProfile={profile}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => {
            updateSectionProps(editingSection.id, patch)
            const targetPid = editingSection.props?.productId || resolveSectionProduct(editingSection, products)?.id
            if (targetPid) {
              const mode = patch.layout || patch.displayMode
              setProducts((prev) => prev.map((p) => (p.id === targetPid ? {
                ...p,
                ...(patch.title ? { title: patch.title } : {}),
                ...(patch.thumbnail !== undefined ? { thumbnail: patch.thumbnail } : {}),
                ...(patch.price !== undefined ? { price: patch.price } : {}),
                ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
                ...(mode ? { displayMode: mode } : {}),
              } : p)))
            }
          }}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : editingSection.type === 'gallery' ? (
        <GalleryEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : (editingSection.type === 'collection' || editingSection.type === 'product_collection') ? (
        <CollectionEditor
          section={editingSection}
          products={products}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateCollectionProps(editingSection.id, patch)}
          onAddItem={(item) => addItemToCollection(editingSection.id, item)}
          onRemoveItem={(itemId) => removeItemFromCollection(editingSection.id, itemId)}
          onMoveItem={(fromIdx, dirOrTo) => {
            const dir = (dirOrTo === -1 || dirOrTo === 1) ? dirOrTo : (dirOrTo > fromIdx ? 1 : -1)
            moveItemInCollection(editingSection.id, fromIdx, dir)
          }}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
          setAddContentModalOpen={setAddContentModalOpen}
          setAddContentType={setAddContentType}
        />
      ) : (['social', 'instagram'].includes(editingSection.type) || Boolean(editingSection.props?.platform)) ? (
        <SocialItemEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onSave={(patch) => saveSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
          igAccount={igAccount}
          onConnectInstagram={handleConnectInstagram}
          onDisconnectInstagram={handleDisconnectInstagram}
          isPro={canCreate}
          onOpenPricing={() => setPricingModalOpen(true)}
        />
      ) : ['button', 'link', 'url'].includes(editingSection.type) ? (
        <LinkEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : (editingSection.type === 'youtube' || editingSection.props?.mediaType === 'youtube' || editingSection.props?.embedType === 'youtube') ? (
        <YouTubeEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onSave={(patch) => saveSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : (['tiktok', 'vimeo', 'video'].includes(editingSection.type) ||
          ['tiktok', 'vimeo', 'video'].includes(editingSection.props?.mediaType) ||
          ['tiktok', 'vimeo'].includes(editingSection.props?.embedType)) ? (
        <MediaContentEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onSave={(patch) => saveSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : ['video', 'youtube', 'audio', 'pdf', 'media'].includes(editingSection.type) ? (
        <MediaEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : editingSection.type === 'product' ? (
        <ProductEditor
          productId={resolveSectionProduct(editingSection, products)?.id}
          initialProduct={resolveSectionProduct(editingSection, products)}
          isStoreContext={true}
          storeSlug={storeSlug || store?.username}
          onBack={handleCloseEditor}
          onProductUpdated={(updatedProd) => {
            const formatted = toPreviewProduct(updatedProd)
            setProducts((prev) => prev.map((prodItem) => (prodItem.id === formatted.id ? formatted : prodItem)))
            if (updatedProd.displayMode) {
              setStore((prev) => {
                if (!prev || !Array.isArray(prev.sections)) return prev
                const nextSections = prev.sections.map((sec) =>
                  sec.props?.productId === updatedProd.id
                    ? { ...sec, props: { ...sec.props, layout: updatedProd.displayMode, displayMode: updatedProd.displayMode } }
                    : sec
                )
                storeRef.current = { ...(storeRef.current || {}), sections: nextSections }
                return { ...prev, sections: nextSections }
              })
            }
            refreshStoreData()
          }}
        />
      ) : ['heading', 'heading_text'].includes(editingSection.type) ? (
        <HeadingEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onSave={(patch) => saveSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : ['text', 'text_block', 'paragraph_text'].includes(editingSection.type) ? (
        <TextBlockEditor
          section={editingSection}
          onBack={handleCloseEditor}
          onUpdateProps={(patch) => updateSectionProps(editingSection.id, patch)}
          onSave={(patch) => saveSectionProps(editingSection.id, patch)}
          onDelete={() => {
            remove(editingSection.id)
            handleCloseEditor()
          }}
          onToggleHidden={() => toggleHidden(editingSection.id)}
          onDuplicate={() => duplicate(editingSection.id)}
          onOpenMobilePreview={() => setShareOpen?.(true)}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E3]">
            <h3 className="text-base font-bold text-[#1F1F1F]">Edit Section</h3>
            <button
              type="button"
              onClick={handleCloseEditor}
              className="text-xs text-[#6F6F6B] hover:text-[#1F1F1F] font-semibold cursor-pointer"
            >
              Back
            </button>
          </div>
          <p className="text-sm text-[#6F6F6B]">
            This section type ({editingSection.type}) does not have a dedicated editor.
          </p>
        </div>
      )
    }

    return null
  }

  return (
    <div className="text-content-primary selection:bg-brand selection:text-brand-fg w-full lg:h-full lg:min-h-0 flex flex-col py-2 lg:py-0">
      <DashboardPageTransition transitionKey={tab} className="flex-1 flex flex-col min-h-0 w-full">
        {tab === 'design' ? (
          <DesignStudioPage
            store={store}
            savedTheme={savedTheme}
            onChange={updateThemeLocally}
            hasUnsavedThemeChanges={hasUnsavedThemeChanges}
            themeSaveState={themeSaveState}
            onSaveTheme={saveTheme}
            onRevertTheme={revertTheme}
            storeSlug={storeSlug}
            profile={profile}
            products={products}
            pages={pages}
            activePageId={activePageId}
            onSelectPage={setActivePageId}
            me={me}
            setShareOpen={setShareOpen}
            onPersistAvatar={persistAvatarUrl}
            onBackToContent={() => handleTabChange('section')}
            canRemoveFooterBranding={canRemoveFooterBranding}
          />
        ) : (
          <>
            {/* DESKTOP 2-COLUMN WORKSPACE (lg:grid) */}
            <div className="hidden lg:grid gap-8 xl:gap-12 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_430px] lg:items-stretch lg:h-full lg:min-h-0 items-start pt-1 pb-12 lg:pb-0 lg:pt-0 flex-1 min-h-0">

            {/* LEFT: ONE SINGLE LARGE WHITE EDITOR CARD CONTAINING EVERYTHING */}
            <div className="w-full max-w-[740px] mx-auto min-w-0 lg:h-full lg:min-h-0 flex flex-col">
              {renderActiveEditor() || (
                <div className="bg-[#FFFFFF] border border-[#E8E8E8] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 sm:p-8 space-y-6 lg:h-full lg:min-h-0 lg:overflow-y-auto subtle-scrollbar">

                {/* 0. CONSOLIDATED DESKTOP STORE EDITOR HEADER */}
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#E8E8E8]">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E8E8E8] bg-[#FFFFFF] hover:bg-[#F2F2F2] hover:border-[#D0D0CE] active:scale-95 text-xs font-semibold text-[#222222] transition-all shadow-2xs cursor-pointer group shrink-0"
                      aria-label="Back to dashboard"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 stroke-[2.2] group-hover:-translate-x-0.5 transition-transform" />
                      <span>Back to Dashboard</span>
                    </Link>

                    <div className="h-3.5 w-px bg-[#E8E8E8] shrink-0 hidden sm:block" />

                    <a
                      href={typeof window !== 'undefined' && storeSlug ? `${window.location.origin}/${storeSlug}` : `/${storeSlug || 'store'}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#777777] hover:text-[#222222] font-medium transition-colors hidden md:inline-flex items-center gap-1 text-xs truncate max-w-[220px]"
                    >
                      <span className="truncate">creatorstore.store/{storeSlug || 'yourname'}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {store?.published ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#16A34A]/10 text-[#16A34A] font-bold text-[11px] border border-[#16A34A]/20 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                        LIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F2F2F2] text-[#777777] font-bold text-[11px] border border-[#E8E8E8] shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#999995]" />
                        OFFLINE
                      </span>
                    )}

                    <a
                      href={typeof window !== 'undefined' && storeSlug ? `${window.location.origin}/${storeSlug}` : `/${storeSlug || 'store'}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded-full border border-[#E8E8E8] bg-[#FFFFFF] hover:bg-[#F2F2F2] hover:border-[#D0D0CE] active:scale-95 text-[#222222] text-xs font-semibold transition-all hidden sm:inline-flex items-center gap-1 shadow-2xs"
                    >
                      View Store
                    </a>

                    <button
                      type="button"
                      disabled={storeStatusLoading}
                      onClick={handleToggleStoreLive}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95 ${
                        store?.published
                          ? 'bg-[#DC2626]/10 text-[#DC2626] hover:bg-[#DC2626]/20 border border-[#DC2626]/20'
                          : 'bg-[#1F1F1F] text-white hover:bg-black'
                      }`}
                      title={store?.published ? 'Turn Storefront Offline' : 'Publish Storefront Live'}
                    >
                      {storeStatusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                      <span>{store?.published ? 'Turn Off' : 'Turn On'}</span>
                    </button>
                  </div>
                </div>

                {/* 1. CREATOR PROFILE ROW (Avatar, Username, Bio, Socials & Actions) */}
                <div className="flex items-start justify-between gap-4 pt-1">
                  <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
                    {/* AVATAR WITH CAMERA HOVER */}
                    <div
                      onClick={() => setAvatarModalOpen(true)}
                      className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#F2F2F2] flex items-center justify-center overflow-hidden cursor-pointer group shrink-0 border border-[#E8E8E8] shadow-2xs"
                    >
                      {store?.theme?.avatarUrl || store?.avatarUrl || profile?.avatarUrl ? (
                        <img src={store?.theme?.avatarUrl || store?.avatarUrl || profile?.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-8 w-8 sm:h-9 sm:w-9 text-[#9CA3AF]" />
                      )}
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="h-4.5 w-4.5 text-white" />
                      </div>
                    </div>

                    {/* USERNAME + BIO + SOCIALS */}
                    <div className="min-w-0 flex-1 flex flex-col items-start gap-1">
                      <h3 className="text-base sm:text-lg font-bold text-[#222222] tracking-tight truncate max-w-full">
                        @{storeSlug || store?.username || me?.store?.username || 'creator'}
                      </h3>

                      {/* BIO DISPLAY / INLINE EDIT */}
                      <div>
                        {isEditingBio ? (
                          <div className="space-y-2 mt-1 w-full max-w-md">
                            <Textarea
                              value={bioInput}
                              onChange={(e) => {
                                setBioInput(e.target.value)
                                updateStore((s) => ({ ...s, bio: e.target.value }))
                              }}
                              placeholder="Add a bio..."
                              rows={2}
                              className="bg-[#FFFFFF] border border-[#E8E8E8] text-[#222222] text-xs sm:text-sm rounded-xl text-left resize-none p-2 focus:border-[#222222]"
                              autoFocus
                              onBlur={() => setIsEditingBio(false)}
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#16A34A]">Saved ✓</span>
                              <button
                                type="button"
                                onClick={() => setIsEditingBio(false)}
                                className="text-xs font-semibold text-[#222222] hover:underline cursor-pointer"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsEditingBio(true)}
                            className="inline-flex items-center gap-1 text-xs text-[#777777] hover:text-[#222222] font-medium transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3 w-3 text-[#999995]" />
                            <span>{bioInput || store?.bio || '+ Add bio'}</span>
                          </button>
                        )}
                      </div>

                      {/* SOCIAL ICONS ROW */}
                      <div className="flex items-center justify-start gap-2 flex-nowrap pt-1">
                        {igAccount?.connected && igAccount?.username ? (
                          <a
                            href={`https://instagram.com/${String(igAccount.username).replace(/^@/, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`@${igAccount.username}`}
                            className="h-7 w-7 rounded-full bg-[#F2F2F2] hover:bg-[#E8E8E8] flex items-center justify-center text-[#222222] transition-colors"
                          >
                            <Instagram className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={handleConnectInstagram}
                            title="Connect Instagram"
                            className="h-7 w-7 rounded-full bg-[#F2F2F2] hover:bg-[#E8E8E8] flex items-center justify-center text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                          >
                            <Instagram className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleAddToStore('social')}
                          title="Connect YouTube / Social"
                          className="h-7 w-7 rounded-full bg-[#F2F2F2] hover:bg-[#E8E8E8] flex items-center justify-center text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                        >
                          <Youtube className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddToStore('social')}
                          title="Add Social Link"
                          className="h-7 w-7 rounded-full border border-dashed border-[#E8E8E8] hover:border-[#D0D0CE] flex items-center justify-center text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* UPPER-RIGHT CARD ACTION ICONS */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTabChange('design')}
                      className="h-9 w-9 rounded-full bg-[#F2F2F2] hover:bg-[#E8E8E8] text-[#777777] hover:text-[#222222] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                      title="Theme / Design Studio"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddCollectionName('')
                        setAddCollectionOpen(true)
                      }}
                      className="h-9 w-9 rounded-full bg-[#F2F2F2] hover:bg-[#E8E8E8] text-[#777777] hover:text-[#222222] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                      title="Collections / Archive"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 2. STORE TAB (Consolidated heading with item count) */}
                <div className="flex items-center justify-between border-b border-[#E8E8E8] gap-4 pt-1">
                  <div className="flex items-center gap-6 overflow-x-auto scrollbar-none pb-0 -mb-px">
                    <button
                      type="button"
                      onClick={() => setContentTypeTab('links')}
                      className="pb-2.5 font-bold text-sm whitespace-nowrap cursor-pointer transition-all border-b-2 border-[#FF4D2E] text-[#222222]"
                    >
                      Store
                    </button>
                  </div>

                  <div className="text-xs text-[#777777] pb-2 shrink-0 font-medium">
                    {contentSections.length} {contentSections.length === 1 ? 'item' : 'items'}
                  </div>
                </div>

                {/* 3. MAIN ACTION ROW: [ 📁 Add collection ] [ + Add ] */}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddCollectionName('')
                      setAddCollectionOpen(true)
                    }}
                    className="inline-flex h-11 px-5 rounded-full bg-[#FFFFFF] hover:bg-[#F2F2F2] hover:border-[#D0D0CE] active:scale-[0.98] text-[#222222] border border-[#E8E8E8] text-xs sm:text-sm font-semibold items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs shrink-0"
                  >
                    <Folder className="h-4 w-4 text-[#222222]" />
                    <span>Add collection</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddToStore('suggested')}
                    className="inline-flex h-11 px-6 rounded-full bg-[#1F1F1F] hover:bg-[#2A2A2A] active:scale-[0.98] text-white text-xs sm:text-sm font-bold items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs flex-1"
                  >
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                    <span>Add</span>
                  </button>
                </div>

                {/* 4. STORE PAGES ROW ([ Home ] [ + New Page ]) */}
                <div className="flex items-center justify-between gap-3 pt-0.5 flex-wrap">
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
                    {pages.map((page) => {
                      const isDefaultPage = Boolean(page.isDefault || page.id === 'home' || page.slug === 'home')
                      const isActive = isHomeSelected
                        ? isDefaultPage
                        : (page.id === activePageId || page.slug === activePageId)
                      const tabLabel = isDefaultPage ? 'Home' : page.name

                      return (
                        <div
                          key={page.id}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${isActive
                            ? 'bg-[#1F1F1F] text-white shadow-2xs'
                            : 'bg-[#FFFFFF] text-[#777777] hover:text-[#222222] hover:bg-[#F2F2F2] border border-[#E8E8E8]'
                            }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActivePageId(isDefaultPage ? null : page.id)}
                            className="cursor-pointer"
                          >
                            {tabLabel}
                          </button>

                          {!page.isDefault && (
                            <button
                              type="button"
                              title={`Delete "${page.name}"`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeletePageTarget({ id: page.id, name: page.name })
                                setDeletePageOpen(true)
                              }}
                              className={`cursor-pointer ${isActive ? 'text-white/80 hover:text-white' : 'text-[#999995] hover:text-[#DC2626]'}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        if (isPageLimitReached) {
                          setPageLimitModalOpen(true)
                        } else {
                          setAddPageName('')
                          setAddPageOpen(true)
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-[#E8E8E8] hover:border-[#222222] text-xs font-semibold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ New Page</span>
                    </button>
                  </div>

                  {/* Entitlement indicator */}
                  <div className="text-xs text-[#777777] font-medium shrink-0">
                    {isPro ? (
                      <span className="font-semibold text-[#16A34A]">Pages: Unlimited</span>
                    ) : (
                      <span>Pages: {currentPagesCount}/{maxPages}</span>
                    )}
                  </div>
                </div>

                {/* 5. PRODUCTS / CONTENT LIST OR EMPTY STATE INSIDE THE SAME CARD */}
                <div className="pt-1">
                  {contentSections.length ? (
                    <Reorder.Group axis="y" values={contentSections} onReorder={reorder} className="space-y-3">
                      {contentSections.map((s, itemIdx) => (
                        <StoreContentCard
                          key={s.id}
                          s={s}
                          itemIdx={itemIdx}
                          selectedId={selectedId}
                          products={products}
                          availableCollections={contentSections.filter((x) => x.type === 'collection' || x.type === 'product_collection')}
                          activeDraggingProduct={activeDraggingProduct}
                          setActiveDraggingProduct={setActiveDraggingProduct}
                          dropTargetCollectionId={dropTargetCollectionId}
                          setDropTargetCollectionId={setDropTargetCollectionId}
                          setDragCursorPos={setDragCursorPos}
                          inlineTitleId={inlineTitleId}
                          setInlineTitleId={setInlineTitleId}
                          inlineTitleVal={inlineTitleVal}
                          setInlineTitleVal={setInlineTitleVal}
                          updateSectionProps={updateSectionProps}
                          updateCollectionProps={updateCollectionProps}
                          addItemToCollection={addItemToCollection}
                          removeItemFromCollection={removeItemFromCollection}
                          moveItemInCollection={moveItemInCollection}
                          setSelectedId={setSelectedId}
                          setEditingCollection={setEditingCollection}
                          toggleHidden={toggleHidden}
                          remove={remove}
                          duplicate={duplicate}
                          moveSectionUp={moveSectionUp}
                          movingUpId={movingUpId}
                          setSelectedFormType={setSelectedFormType}
                          setEditingFormSection={setEditingFormSection}
                          setAddModalType={setAddModalType}
                          setAddModalOpen={setAddModalOpen}
                          setSelectedMediaType={setSelectedMediaType}
                          setEditingMediaSection={setEditingMediaSection}
                          setCoachingWizardProductId={setCoachingWizardProductId}
                          setEditingProductId={setEditingProductId}
                          setEditingSectionId={setEditingSectionId}
                          resumeDigitalProductDraft={resumeDigitalProductDraft}
                          inlineProdKey={inlineProdKey}
                          setInlineProdKey={setInlineProdKey}
                          inlineProdVal={inlineProdVal}
                          setInlineProdVal={setInlineProdVal}
                          commitInlineProductEdit={commitInlineProductEdit}
                          savedProductId={savedProductId}
                          setAddContentModalOpen={setAddContentModalOpen}
                          setAddContentType={setAddContentType}
                        />
                      ))}
                    </Reorder.Group>
                  ) : (
                    /* CLEAN EMPTY STATE INSIDE THE SAME MAIN CARD */
                    <div className="text-center py-12 px-4 space-y-4 rounded-2xl border border-dashed border-[#E5E5E3] bg-[#FBFBFB]">
                      <div className="h-14 w-14 rounded-full bg-[#FFFFFF] border border-[#E5E5E3] mx-auto flex items-center justify-center text-[#999995] shadow-xs">
                        <Package className="h-7 w-7 text-[#1F1F1F]" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base sm:text-lg font-bold text-[#1F1F1F]">Your store is empty</h4>
                        <p className="text-xs sm:text-sm text-[#6F6F6B] max-w-sm mx-auto">
                          Start building your storefront by adding your first product or section.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleAddToStore('suggested')}
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#1F1F1F] hover:bg-[#000000] active:bg-[#111111] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-xs"
                        >
                          <Plus className="h-4 w-4" /> + Add Product
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddCollectionName('')
                            setAddCollectionOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] border border-[#E5E5E3] text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs"
                        >
                          <Folder className="h-4 w-4 text-[#1F1F1F]" /> + Add Collection
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 7. CREATORSTORE BRANDED FOOTER CARD WITH PRO TOGGLE */}
                <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[24px] p-5 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#1F1F1F]">
                      CreatorStore footer
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="h-6 w-6 rounded-full bg-[#F4F4F5] flex items-center justify-center text-[#71717A]" title="Pro Feature">
                        <Zap className="h-3.5 w-3.5 fill-current text-[#71717A]" />
                      </span>
                      <Switch
                        checked={store?.theme?.showFooterBranding !== false}
                        onCheckedChange={(checked) => handleToggleFooterBranding(checked)}
                        className="data-[state=checked]:bg-[#16A34A] data-[state=unchecked]:bg-[#E4E4E7]"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-1.5 text-base sm:text-lg font-bold text-[#111827] tracking-tight">
                    <span>CreatorStore</span>
                    <CreatorStoreMark size="sm" color="brand" className="h-4 w-4 inline-block" />
                  </div>
                </div>

              </div>
            )}
            </div>

            {/* RIGHT: STOREFRONT PREVIEW COLUMN */}
            <div className="flex flex-col items-center justify-center w-full max-w-[420px] mx-auto lg:h-full lg:min-h-0 shrink-0 lg:sticky lg:top-0">

              {/* PREVIEW CONTAINER WITH ATTACHED SIDE CONTROLS */}
              <div className="relative w-[min(360px,100%)] flex items-center justify-center">

                {/* ATTACHED SIDE CONTROLS (🔗 AND ↗) */}
                <div className="hidden xl:flex flex-col items-center gap-2 absolute -left-12 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={() => {
                      const url = typeof window !== 'undefined' ? `${window.location.origin}/${storeSlug || 'store'}` : `/${storeSlug || 'store'}`
                      navigator.clipboard.writeText(url)
                      toast.success('Store link copied!')
                    }}
                    className="h-8 w-8 rounded-full border border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#6F6F6B] hover:text-[#1F1F1F] flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                    title="Copy Store Link"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  <a
                    href={typeof window !== 'undefined' && storeSlug ? `${window.location.origin}/${storeSlug}` : `/${storeSlug || 'store'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 w-8 rounded-full border border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#6F6F6B] hover:text-[#1F1F1F] flex items-center justify-center shadow-xs transition-colors shrink-0"
                    title="Open Live Store"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                {/* LIVE STOREFRONT PHONE PREVIEW */}
                <div className="w-full max-h-[calc(100vh-120px)] h-[720px] rounded-[28px] border border-[#E5E5E3] bg-[#FBFBFB] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col relative shrink-0">
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    <StorePreview
                      device="mobile"
                      editor
                      store={previewStore}
                      username={storeSlug}
                      profile={{
                        ...(profile || {}),
                        username: storeSlug || profile?.username,
                        avatarUrl: store?.theme?.avatarUrl || store?.avatarUrl || profile?.avatarUrl,
                        bio: store?.bio || bioInput,
                        instagramConnected: igAccount?.connected,
                        instagramUsername: igAccount?.username,
                      }}
                      products={products}
                      pages={pages}
                      activePageId={activePageId}
                      onSelectPage={(targetId) => setActivePageId(targetId === 'home' ? null : targetId)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

            {/* MOBILE COMPACT DASHBOARD & ITEM EDITOR (lg:hidden) */}
            <div className="block lg:hidden w-full flex-1 min-h-0">
              {renderActiveEditor() ? (
                <div className="w-full flex-1 min-h-screen bg-[#FBFAF9] flex flex-col p-3 sm:p-4 pb-28">
                  {renderActiveEditor()}
                </div>
              ) : (
                <MobileStoreDashboard
                  store={store}
                  storeSlug={storeSlug}
                  profile={profile}
                  products={products}
                  contentSections={contentSections}
                  pages={pages}
                  activePageId={activePageId}
                  setActivePageId={setActivePageId}
                  igAccount={igAccount}
                  me={me}
                  onAddCollection={() => {
                    setAddCollectionName('')
                    setAddCollectionOpen(true)
                  }}
                  onOpenAddModal={(type, payload) => handleMobileAddOption(type, payload)}
                  onEditProduct={handleEditProductNav}
                  onEditSection={handleEditSectionNav}
                  onDeleteSection={(secId) => remove(secId)}
                  onDuplicateSection={(secId) => duplicate(secId)}
                  onToggleHidden={(secId) => toggleHidden(secId)}
                  onOpenShare={() => setShareOpen?.(true)}
                  onOpenAvatar={() => setAvatarModalOpen(true)}
                  onTabChange={handleTabChange}
                  refreshStoreData={refreshStoreData}
                  setProducts={setProducts}
                  setStore={setStore}
                />
              )}
            </div>
          </>
        )}
      </DashboardPageTransition>

      <BaseModal
        open={avatarModalOpen}
        onOpenChange={setAvatarModalOpen}
        title="Upload Profile Picture"
        hideFooter
      >
        <div className="space-y-4 text-center">
          <input ref={avatarFileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          <div
            onClick={() => avatarFileRef.current?.click()}
            className="h-28 w-28 rounded-full border-2 border-dashed border-[#E8E8E8] hover:border-[#1F1F1F] bg-[#F7F7F7] hover:bg-[#F2F2F2] mx-auto flex items-center justify-center cursor-pointer transition-colors"
          >
            {uploadingAvatar ? (
              <Loader2 className="h-6 w-6 animate-spin text-[#222222]" />
            ) : (
              <Camera className="h-8 w-8 text-[#777777]" />
            )}
          </div>
          <p className="text-sm text-[#777777]">JPG, PNG or WebP up to 10MB.</p>
          <ModalFooterActions
            secondaryLabel={store?.theme?.avatarUrl || store?.avatarUrl || profile?.avatarUrl ? 'Remove' : 'Cancel'}
            onSecondary={async () => {
              if (!(store?.theme?.avatarUrl || store?.avatarUrl || profile?.avatarUrl)) {
                setAvatarModalOpen(false)
                return
              }
              try {
                await persistAvatarUrl(null)
                setAvatarModalOpen(false)
                toast.success('Avatar removed')
              } catch (err) {
                toast.error(err.message || 'Failed to remove avatar')
              }
            }}
            primaryLabel="Select Image"
            onPrimary={() => avatarFileRef.current?.click()}
            primaryDisabled={uploadingAvatar}
          />
        </div>
      </BaseModal>

      <BaseModal
        open={addCollectionOpen}
        onOpenChange={(o) => { setAddCollectionOpen(o); if (!o) setAddCollectionName('') }}
        title="Add new collection"
        secondaryLabel="Cancel"
        onSecondary={() => setAddCollectionOpen(false)}
        primaryLabel="Create Collection"
        onPrimary={() => handleCreateCollection(addCollectionName)}
        primaryDisabled={!addCollectionName.trim()}
        className="sm:max-w-sm"
      >
        <TextInput
          label="Collection name"
          value={addCollectionName}
          onChange={(e) => setAddCollectionName(e.target.value)}
          placeholder="e.g. Featured Products, Free Resources, Summer Drop"
          onKeyDown={(e) => { if (e.key === 'Enter' && addCollectionName.trim()) handleCreateCollection(addCollectionName) }}
          autoFocus
        />
      </BaseModal>

      <BaseModal
        open={addPageOpen}
        onOpenChange={(o) => { setAddPageOpen(o); if (!o) setAddPageName('') }}
        title="Add new page"
        secondaryLabel="Cancel"
        onSecondary={() => setAddPageOpen(false)}
        primaryLabel={addPageLoading ? 'Adding…' : 'Add page'}
        onPrimary={handleAddPage}
        primaryDisabled={addPageLoading || !addPageName.trim()}
        primaryLoading={addPageLoading}
        className="sm:max-w-sm"
      >
        <TextInput
          label="Page name"
          value={addPageName}
          onChange={(e) => setAddPageName(e.target.value)}
          placeholder="e.g. Shop, Free Resources, About"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddPage() }}
          autoFocus
        />
      </BaseModal>

      <BaseModal
        open={renamePageOpen}
        onOpenChange={(o) => { setRenamePageOpen(o); if (!o) { setRenamePageTarget(null); setRenamePageName('') } }}
        title="Rename page"
        secondaryLabel="Cancel"
        onSecondary={() => setRenamePageOpen(false)}
        primaryLabel={renamePageLoading ? 'Renaming…' : 'Rename'}
        onPrimary={handleRenamePage}
        primaryDisabled={renamePageLoading || !renamePageName.trim()}
        primaryLoading={renamePageLoading}
        className="sm:max-w-sm"
      >
        <TextInput
          label="Page name"
          value={renamePageName}
          onChange={(e) => setRenamePageName(e.target.value)}
          placeholder="Page name"
          onKeyDown={(e) => { if (e.key === 'Enter') handleRenamePage() }}
          autoFocus
        />
      </BaseModal>

      <BaseModal
        open={deletePageOpen}
        onOpenChange={(o) => { setDeletePageOpen(o); if (!o) setDeletePageTarget(null) }}
        title={`Delete "${deletePageTarget?.name}"?`}
        secondaryLabel="Cancel"
        onSecondary={() => setDeletePageOpen(false)}
        primaryLabel={deletePageLoading ? 'Deleting…' : 'Delete page'}
        onPrimary={handleDeletePage}
        primaryDisabled={deletePageLoading}
        primaryLoading={deletePageLoading}
        primaryDanger
        className="sm:max-w-sm"
      >
        <p className="text-sm text-[var(--text-secondary,#A3A3A3)]">This will permanently delete this page and all its content sections. This action cannot be undone.</p>
      </BaseModal>

      {/* Page Limit Reached Modal */}
      <BaseModal
        open={pageLimitModalOpen}
        onOpenChange={setPageLimitModalOpen}
        title="Page limit reached"
        secondaryLabel="Cancel"
        onSecondary={() => setPageLimitModalOpen(false)}
        primaryLabel="Upgrade to Pro"
        onPrimary={() => {
          setPageLimitModalOpen(false)
          setPricingModalOpen(true)
        }}
        className="sm:max-w-md"
      >
        <div className="space-y-4 text-sm text-[var(--text-secondary,#A3A3A3)]">
          <p>
            {pageLimitErrorData?.message || `Your Creator plan allows up to ${maxPages} storefront pages.`}
          </p>
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary,#A3A3A3)]">Storefront pages:</span>
            <span className="font-bold text-[var(--text-heading,#F5F5F5)]">{pageLimitErrorData?.currentCount || currentPagesCount} of {pageLimitErrorData?.limit || maxPages} used</span>
          </div>
          <p className="text-xs text-[var(--text-secondary,#A3A3A3)]">
            Upgrade to Pro to create unlimited storefront pages, unlock unlimited Instagram DMs, and access all advanced platform features.
          </p>
        </div>
      </BaseModal>

      <BaseModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Your Store is Live! 🎉"
        secondaryLabel="Open Store"
        onSecondary={() => { if (storeUrl) window.open(storeUrl, '_blank', 'noreferrer') }}
        primaryLabel="Copy Link"
        onPrimary={() => { if (storeUrl) { navigator.clipboard?.writeText(storeUrl); toast.success('Link copied!') } }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl border border-[var(--border-subtle,#303030)] bg-white p-4">
            {storeUrl ? <QRCodeCanvas value={storeUrl} size={160} fgColor="#000000" /> : null}
          </div>
          <div className="flex w-full items-center gap-2 rounded-xl border border-[var(--border-subtle,#303030)] bg-[var(--bg-surface-hover,#2A2A2A)] px-4 py-3 text-sm font-semibold text-[var(--text-heading,#F5F5F5)]">
            <span className="truncate">{storeUrl || (storeSlug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${storeSlug}` : '')}</span>
            <button type="button" onClick={() => { if (storeUrl) { navigator.clipboard?.writeText(storeUrl); toast.success('Link copied!') } }} className="ml-auto text-[var(--accent-primary)] hover:opacity-80">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      </BaseModal>

      <BaseModal
        open={addModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProductId(null)
            setEditingFormSection(null)
            setEditingMediaSection(null)
            requestCloseAddModal()
          } else {
            setAddModalOpen(true)
          }
        }}
        hideFooter
        hideClose={addModalType === 'coaching' || addModalType === 'course'}
        className={
          addModalType === 'coaching' || addModalType === 'course'
            ? 'sm:max-w-4xl max-w-4xl w-[95vw] sm:w-full max-h-[90vh] p-0 gap-0 overflow-hidden'
            : ['menu', 'add_youtube', 'add_tiktok', 'add_vimeo', 'add_video', 'social_display_select'].includes(addModalType)
            ? 'sm:max-w-[780px] w-[95vw] sm:w-full h-[88vh] sm:h-[640px] max-h-[92vh] p-4 sm:p-7 rounded-[28px] bg-white border border-[#E5E5E3] shadow-[0_24px_70px_rgba(0,0,0,0.15)] gap-0 overflow-hidden flex flex-col'
            : 'sm:max-w-[700px]'
        }
        bodyClassName={
          addModalType === 'coaching' || addModalType === 'course'
            ? 'p-0 min-h-[500px] flex flex-col flex-1'
            : ['menu', 'add_youtube', 'add_tiktok', 'add_vimeo', 'add_video', 'social_display_select'].includes(addModalType)
            ? 'p-0 flex flex-col flex-1 min-h-0 overflow-hidden'
            : 'pt-5'
        }
        title={
          addModalType === 'coaching' || addModalType === 'course'
            ? null
            : addModalType === 'menu'
            ? (
              <div className="w-full text-center text-xl font-bold text-[#1F1F1F]">
                Add
                <span className="sr-only">Add to your store</span>
              </div>
            )
            : addModalType === 'social_display_select'
              ? `Add ${getSocialPlatform(selectedSocialPlatform)?.name || 'Social'}`
            : addModalType === 'add_youtube'
              ? 'Add YouTube'
            : addModalType === 'add_tiktok'
              ? 'Add TikTok Video'
            : addModalType === 'add_vimeo'
              ? 'Add Vimeo'
            : addModalType === 'add_video'
              ? 'Add Video'
            : addModalType === 'digital_product'
              ? 'Create digital product'
              : addModalType === 'edit_product'
                ? 'Edit Digital Product'
                : addModalType === 'link'
                  ? 'Add Link'
                  : addModalType === 'product'
                    ? 'Add Product'
                    : addModalType === 'forms_menu'
                      ? 'Add a Form'
                      : addModalType === 'form_config'
                        ? (editingFormSection ? 'Edit Form' : `Configure ${FORM_TYPES.find(f => f.id === selectedFormType)?.title || 'Form'}`)
                        : addModalType === 'media_config'
                          ? (editingMediaSection
                            ? `Edit ${selectedMediaType === 'youtube' ? 'YouTube' : selectedMediaType === 'gallery' ? 'Gallery' : selectedMediaType === 'audio' ? 'Audio' : selectedMediaType === 'pdf' ? 'PDF' : 'Video'}`
                            : (selectedMediaType === 'youtube' ? 'Add YouTube Video' : selectedMediaType === 'gallery' ? 'Add Image Gallery' : selectedMediaType === 'audio' ? 'Add Audio Track' : selectedMediaType === 'pdf' ? 'Add PDF Document' : 'Add Video'))
                          : 'Add to your store'
        }
        headerLeft={addModalType === 'coaching' || addModalType === 'course' ? null : addModalType === 'menu' ? (
          <div className="w-9 shrink-0" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (addModalType === 'digital_product' && wizardStep > 1) {
                setWizardStep((s) => s - 1)
              } else if (addModalType === 'digital_product') {
                if (wizardDirty) {
                  const ok = typeof window !== 'undefined'
                    && window.confirm("Discard this product? Your changes won't be saved.")
                  if (!ok) return
                }
                setDraftProductId(null)
                setDraftSectionId(null)
                setDraftSaveState('idle')
                setWizardDirty(false)
                discardPendingCreate()
                if (modalOrigin === 'direct') {
                  setAddModalOpen(false)
                  setAddModalType('menu')
                } else {
                  setAddModalType('menu')
                  setWizardStep(1)
                }
              } else if (['add_youtube', 'add_tiktok', 'add_vimeo', 'add_video', 'social_display_select'].includes(addModalType)) {
                setAddModalType('menu')
              } else if (addModalType === 'form_config') {
                if (editingFormSection) {
                  setAddModalOpen(false)
                  setAddModalType('menu')
                  setEditingFormSection(null)
                } else {
                  setAddModalType('forms_menu')
                }
              } else if (addModalType === 'media_config') {
                if (editingMediaSection) {
                  setAddModalOpen(false)
                  setAddModalType('menu')
                  setEditingMediaSection(null)
                } else {
                  setAddModalType('menu')
                }
              } else {
                setAddModalType('menu')
                setWizardStep(1)
              }
            }}
            className="text-[#96969D] hover:text-[#D4D4D8] p-1 rounded-full transition-colors shrink-0 cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
      >

        {/* 
          Linktree-style flat surface redesign menu view
          Supported categories: ['suggested', 'ecommerce', 'social', 'media', 'document', 'forms']
          Search placeholder: Paste or search a link...
        */}
        {addModalType === 'menu' && (
          <AddToStoreMenuView
            search={addModalSearch}
            onSearchChange={setAddModalSearch}
            category={addModalCategory}
            onCategoryChange={setAddModalCategory}
            onSelectOption={(opt) => {
              if (opt.type === 'bundle' || opt.id === 'bundles_commerce') {
                openBundleCreationFlow()
              } else if (opt.type === 'digital_product') {
                openDigitalProductWizard()
              } else if (opt.type === 'coaching') {
                openCoachingCreationFlow()
              } else if (opt.type === 'link') {
                if (opt.prefillUrl) {
                  const validated = safeUrlValidate(opt.prefillUrl)
                  if (!validated) {
                    toast.error('Invalid URL scheme. Please enter a valid web link.')
                    return
                  }
                  addSectionWithProps('button', {
                    label: opt.prefillTitle || 'Link',
                    url: validated,
                    layout: 'classic',
                  })
                  setAddModalOpen(false)
                } else {
                  setAddModalType('link')
                }
              } else if (opt.type === 'link_preset') {
                const targetUrl = opt.presetUrl || 'https://'
                const validated = safeUrlValidate(targetUrl)
                if (validated) {
                  addSectionWithProps('button', {
                    label: opt.title || 'Link',
                    url: validated,
                    layout: 'classic',
                  })
                  setAddModalOpen(false)
                } else {
                  setAddModalType('link')
                }
              } else if (opt.type === 'collection') {
                addSectionWithProps('heading', { text: 'Featured Collection' })
                setAddModalOpen(false)
              } else if (opt.type === 'instagram') {
                setSelectedSocialPlatform('instagram')
                setAddModalType('social_display_select')
                // Direct connect / reconnect actions in editor: handleDisconnectInstagram and handleConnectInstagram
              } else if (opt.type === 'social') {
                setSelectedSocialPlatform(opt.platform || 'generic')
                setAddModalType('social_display_select')
              } else if (opt.type === 'forms_menu') {
                setAddModalType('forms_menu')
              } else if (
                opt.type === 'form' ||
                opt.type === 'form_contact' ||
                opt.type === 'form_newsletter' ||
                opt.type === 'form_feedback' ||
                opt.type === 'form_qa'
              ) {
                const fType =
                  opt.formType ||
                  (opt.type === 'form_newsletter'
                    ? 'newsletter'
                    : opt.type === 'form_feedback'
                    ? 'feedback'
                    : opt.type === 'form_qa'
                    ? 'qa'
                    : 'contact')
                setSelectedFormType(fType)
                setEditingFormSection(null)
                setAddModalType('form_config')
              } else if (opt.type === 'gallery') {
                setAddModalOpen(false)
                addSectionWithProps('gallery', {
                  title: 'gallery',
                  images: [],
                  layout: 'classic',
                  displayMode: 'classic',
                }).then((newSec) => {
                  if (newSec?.id) {
                    setEditingProductId(null)
                    setEditingSectionId(newSec.id)
                  }
                })
              } else if (
                opt.type === 'youtube' ||
                opt.mediaType === 'youtube' ||
                opt.id === 'youtube_media' ||
                opt.id === 'youtube_suggested'
              ) {
                setAddModalType('add_youtube')
              } else if (
                opt.type === 'tiktok' ||
                opt.mediaType === 'tiktok' ||
                opt.id === 'tiktok_media'
              ) {
                setAddModalType('add_tiktok')
              } else if (
                opt.type === 'vimeo' ||
                opt.mediaType === 'vimeo' ||
                opt.id === 'vimeo_media'
              ) {
                setAddModalType('add_vimeo')
              } else if (
                opt.type === 'video' ||
                opt.mediaType === 'video' ||
                opt.id === 'video_media'
              ) {
                setAddModalType('add_video')
              } else if (
                opt.type === 'media' ||
                opt.type === 'audio' ||
                opt.type === 'pdf'
              ) {
                const mType = opt.mediaType || opt.type
                setSelectedMediaType(mType)
                setEditingMediaSection(null)
                setAddModalType('media_config')
              } else if (opt.type === 'event' || opt.type === 'webinar') {
                addSectionWithProps('button', {
                  label: opt.title || 'Live Webinar or Event',
                  url: 'https://',
                  layout: 'classic',
                })
                setAddModalOpen(false)
              } else if (opt.type === 'heading_text' || opt.type === 'heading') {
                addSectionWithProps('heading', { text: 'Section Heading' })
                setAddModalOpen(false)
              } else if (opt.type === 'text_block' || opt.type === 'text') {
                addSectionWithProps('text', { text: 'Add your text here...' })
                setAddModalOpen(false)
              } else if (opt.type === 'existing_product') {
                if (!canCreate) {
                  toast.error('Your Pro trial has ended. Upgrade your plan to add products.')
                  setPricingModalOpen(true)
                  setAddModalOpen(false)
                  return
                }
                const prod = products.find((p) => p.id === opt.productId)
                if (prod) {
                  addSectionWithProps('product', {
                    productId: prod.id,
                    title: prod.title,
                    price: prod.price,
                    currency: prod.currency,
                    thumbnail: prod.thumbnail,
                    layout: 'classic',
                  })
                }
                setAddModalOpen(false)
              }
            }}
            onQuickAction={(action) => {
              if (action === 'collection') {
                addSectionWithProps('heading', { text: 'Featured Collection' })
                setAddModalOpen(false)
              } else if (action === 'link') {
                setAddModalType('link')
              } else if (action === 'product') {
                openDigitalProductWizard()
              } else if (action === 'form') {
                setAddModalType('forms_menu')
              }
            }}
            products={products}
            onSelectExistingProduct={(productId) => {
              if (!canCreate) {
                toast.error('Your Pro trial has ended. Upgrade your plan to add products.')
                setPricingModalOpen(true)
                setAddModalOpen(false)
                return
              }
              const prod = products.find((p) => p.id === productId)
              if (prod) {
                addSectionWithProps('product', {
                  productId: prod.id,
                  title: prod.title,
                  price: prod.price,
                  currency: prod.currency,
                  thumbnail: prod.thumbnail,
                  layout: 'classic',
                })
              }
              setAddModalOpen(false)
            }}
            igAccount={igAccount}
          />
        )}

        {/* Main Content Body for sub-flows */}
        {addModalType !== 'menu' && (
          <div className="overflow-y-auto flex-1 no-scrollbar">
            {/* ADD LINK FORM */}
          {addModalType === 'link' && (
            <div className="p-4 sm:p-6">
              <AddLinkForm
                initialUrl={linkDirectUrl}
                initialTitle={linkDirectTitle}
                onSubmit={(title, url, layout, thumbnail) => {
                  if (!canCreate) {
                    toast.error('Your Pro trial has ended. Upgrade your plan to add links and continue selling.')
                    setPricingModalOpen(true)
                    setAddModalOpen(false)
                    return
                  }
                  const validated = safeUrlValidate(url)
                  if (!validated) {
                    toast.error('Invalid URL scheme. Please enter a valid web link.')
                    return
                  }
                  addSectionWithProps('button', { label: title || 'Follow me', url: validated, layout: layout || 'classic', thumbnail })
                  setLinkDirectUrl('')
                  setLinkDirectTitle('')
                  setAddModalOpen(false)
                  setAddModalType('menu')
                }}
              />
            </div>
          )}

          {/* ADD PRODUCT SELECTOR FORM */}
          {addModalType === 'product' && (
            <div className="p-4 sm:p-6">
              <AddProductForm
                products={products}
                existingProductIds={(store?.sections || [])
                  .filter((s) => s.type === 'product')
                  .map((s) => s.props?.productId)}
                onSelectProduct={(prodId) => {
                  addSectionWithProps('product', { productId: prodId, layout: 'classic' })
                  setAddModalOpen(false)
                  setAddModalType('menu')
                }}
              />
            </div>
          )}

          {/* COACHING & BOOKINGS 7-STEP WIZARD */}
          {addModalType === 'coaching' && (
            <CoachingBookingWizardContent
              key={coachingWizardProductId || 'new-coaching'}
              editProductId={coachingWizardProductId}
              onClose={() => {
                setAddModalOpen(false)
                setAddModalType('menu')
                setCoachingWizardProductId(null)
              }}
              onSuccess={async (createdProd) => {
                await refreshStoreData()
                if (createdProd?.id && !coachingWizardProductId) {
                  addSectionWithProps('product', { productId: createdProd.id, layout: 'classic' })
                }
                setAddModalOpen(false)
                setAddModalType('menu')
                setCoachingWizardProductId(null)
              }}
            />
          )}

          {/* DIGITAL PRODUCT 3-STEP FORM */}
          {addModalType === 'digital_product' && (
            <DigitalProductForm
              key={draftProductId || 'new-digital'}
              step={wizardStep}
              setStep={setWizardStep}
              product={products.find((p) => p.id === draftProductId) || null}
              saveState={draftProductId ? draftSaveState : 'idle'}
              onPatch={draftProductId ? (partial) => { setWizardDirty(true); patchDraftProduct(partial) } : () => setWizardDirty(true)}
              onSynced={mergeDraftFromServer}
              onComplete={finishDigitalProduct}
              onDirty={() => setWizardDirty(true)}
            />
          )}

          {/* EDIT EXISTING DIGITAL PRODUCT FORM */}
          {addModalType === 'edit_product' && editingProductId && (
            <EditDigitalProductForm
              productId={editingProductId}
              initialProduct={products.find((p) => p.id === editingProductId)}
              onUpdated={(updatedProd) => {
                const formatted = toPreviewProduct(updatedProd)
                setProducts((prev) => prev.map((p) => (p.id === formatted.id ? formatted : p)))
                setAddModalOpen(false)
                setAddModalType('menu')
                setEditingProductId(null)
              }}
              onClose={() => {
                setAddModalOpen(false)
                setAddModalType('menu')
                setEditingProductId(null)
              }}
            />
          )}

          {/* FORMS SUB-OPTIONS MENU */}
          {addModalType === 'forms_menu' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-white">Select form type</p>
                <p className="text-sm text-[#96969D]">Choose how you want to collect responses from your audience</p>
              </div>
              <SelectableCardGrid>
                {FORM_TYPES.map((formItem) => {
                  const FormIcon = formItem.icon
                  return (
                    <SelectableCard
                      key={formItem.id}
                      selected={selectedFormType === formItem.id}
                      onSelect={() => {
                        setSelectedFormType(formItem.id)
                        setEditingFormSection(null)
                        setAddModalType('form_config')
                      }}
                      icon={<FormIcon className="h-5 w-5" />}
                      iconColor={formItem.iconHex}
                      title={formItem.title}
                      description={formItem.description}
                    />
                  )
                })}
              </SelectableCardGrid>
            </div>
          )}

          {/* FORM CONFIGURATION VIEW */}
          {addModalType === 'form_config' && (
            <div className="p-card sm:p-card-lg overflow-y-auto no-scrollbar">
              <AddFormConfig
                formType={selectedFormType}
                initialProps={editingFormSection?.props}
                creatorEmail={me?.email || ''}
                isEditing={Boolean(editingFormSection)}
                onCancel={() => {
                  if (editingFormSection) {
                    setAddModalOpen(false)
                    setAddModalType('menu')
                    setEditingFormSection(null)
                  } else {
                    setAddModalType('forms_menu')
                  }
                }}
                onSubmit={async (formProps) => {
                  if (editingFormSection) {
                    try {
                      if (editingFormSection.props?.formId) {
                        await api.patch(`/forms/${editingFormSection.props.formId}`, formProps)
                      }
                    } catch (e) {
                      console.warn('Backend form sync warning:', e)
                    }
                    updateSectionProps(editingFormSection.id, formProps)
                    toast.success('Form updated successfully!')
                    setEditingFormSection(null)
                  } else {
                    let createdForm = null
                    try {
                      const res = await api.post('/forms', {
                        ...formProps,
                        addToStore: false,
                        status: 'PUBLISHED',
                      })
                      createdForm = res?.form
                    } catch (e) {
                      console.warn('Backend form creation warning:', e)
                    }
                    const enrichedProps = createdForm ? { ...formProps, formId: createdForm.id } : formProps
                    addSectionWithProps('form', enrichedProps)
                    toast.success('Form block added to your store!')
                  }
                  setAddModalOpen(false)
                  setAddModalType('menu')
                }}
              />
            </div>
          )}

          {/* MEDIA CONFIGURATION VIEW */}
          {addModalType === 'media_config' && (
            <div className="p-card sm:p-card-lg overflow-y-auto no-scrollbar">
              <AddMediaConfig
                mediaType={selectedMediaType}
                initialProps={editingMediaSection?.props}
                isEditing={Boolean(editingMediaSection)}
                onChange={(liveProps) => {
                  if (editingMediaSection) {
                    updateSectionProps(editingMediaSection.id, liveProps)
                  }
                }}
                onCancel={() => {
                  if (editingMediaSection) {
                    setAddModalOpen(false)
                    setAddModalType('menu')
                    setEditingMediaSection(null)
                  } else {
                    setAddModalType('menu')
                  }
                }}
                onSubmit={(mediaProps) => {
                  const blockType = mediaProps.mediaType || selectedMediaType
                  if (editingMediaSection) {
                    updateSectionProps(editingMediaSection.id, mediaProps)
                    toast.success(`${LABELS[blockType] || 'Media'} block updated!`)
                    setEditingMediaSection(null)
                  } else {
                    addSectionWithProps(blockType, mediaProps)
                  }
                  setAddModalOpen(false)
                  setAddModalType('menu')
                }}
              />
            </div>
          )}
          {addModalType === 'add_youtube' && (
            <AddYouTubeModalView
              onSelectVideo={async (videoData) => {
                setAddModalOpen(false)
                setAddModalType('menu')
                const newSec = await addSectionWithProps('youtube', {
                  title: videoData.title || 'YouTube Video',
                  url: videoData.canonicalUrl || videoData.url,
                  videoId: videoData.videoId || null,
                  thumbnail: videoData.thumbnailUrl || null,
                  customThumbnail: null,
                  layout: 'classic',
                  displayMode: 'classic',
                  mediaType: 'youtube',
                  embedType: 'youtube',
                })
                if (newSec?.id) {
                  setEditingProductId(null)
                  setEditingSectionId(newSec.id)
                  setSelectedId(newSec.id)
                }
              }}
              onCancel={() => setAddModalType('menu')}
            />
          )}
          {['add_tiktok', 'add_vimeo', 'add_video'].includes(addModalType) && (
            <AddMediaModalView
              mediaType={
                addModalType === 'add_tiktok'
                  ? 'tiktok'
                  : addModalType === 'add_vimeo'
                    ? 'vimeo'
                    : 'video'
              }
              onSelectVideo={async (videoData) => {
                setAddModalOpen(false)
                setAddModalType('menu')
                const blockType = videoData.mediaType || (addModalType === 'add_tiktok' ? 'tiktok' : addModalType === 'add_vimeo' ? 'vimeo' : 'video')
                const newSec = await addSectionWithProps(blockType, {
                  title: videoData.title || `${blockType.toUpperCase()} Video`,
                  url: videoData.canonicalUrl || videoData.url,
                  videoId: videoData.videoId || null,
                  thumbnail: videoData.thumbnailUrl || null,
                  customThumbnail: null,
                  layout: 'classic',
                  displayMode: 'classic',
                  mediaType: blockType,
                  embedType: blockType,
                  isUpload: Boolean(videoData.isUpload),
                  fileName: videoData.fileName || null,
                  fileSize: videoData.fileSize || null,
                })
                if (newSec?.id) {
                  setEditingProductId(null)
                  setEditingSectionId(newSec.id)
                  setSelectedId(newSec.id)
                }
              }}
              onCancel={() => setAddModalType('menu')}
            />
          )}
          {addModalType === 'social_display_select' && (
            <SocialDisplaySelectModalView
              platform={selectedSocialPlatform}
              store={store}
              theme={store?.theme || {}}
              isPro={canCreate}
              onOpenPricing={() => {
                setPricingModalOpen(true)
                setAddModalOpen(false)
              }}
              onSelectStyle={async (styleKey) => {
                setAddModalOpen(false)
                setAddModalType('menu')
                const platformInfo = getSocialPlatform(selectedSocialPlatform)
                const safeStyleKey = resolveSocialStyle(styleKey, platformInfo?.id)
                const defaultTitle = platformInfo?.name || 'Social'
                const newSec = await addSectionWithProps('social', {
                  platform: selectedSocialPlatform,
                  title: defaultTitle,
                  label: defaultTitle,
                  url: '',
                  layout: safeStyleKey,
                  displayMode: safeStyleKey,
                  displayStyle: safeStyleKey,
                  thumbnail: null,
                  customThumbnail: null,
                })
                if (newSec?.id) {
                  setEditingProductId(null)
                  setEditingSectionId(newSec.id)
                  setSelectedId(newSec.id)
                }
              }}
              onCancel={() => setAddModalType('menu')}
            />
          )}
          </div>
        )}
      </BaseModal>



      <BaseModal
        open={addContentModalOpen}
        onOpenChange={setAddContentModalOpen}
        title="Add Content to Collection"
        hideFooter
        className="sm:max-w-md"
      >

        {addContentType === 'selector' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary,#A3A3A3)]">Choose what content to add to your collection:</p>
            <SelectableCardGrid>
              <SelectableCard
                selected={false}
                onSelect={() => setAddContentType('product')}
                icon={<Package className="h-5 w-5" />}
                title="Digital Product"
                description="Add an existing digital product"
              />
              <SelectableCard
                selected={false}
                onSelect={() => setAddContentType('link')}
                icon={<ExternalLink className="h-5 w-5" />}
                title="Link"
                description="Add an external website or link"
              />
            </SelectableCardGrid>

            {/* COMING SOON TYPES */}
            <div className="pt-2 border-t border-[var(--border-subtle,#303030)] space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--text-secondary,#A3A3A3)]">Coming Soon</span>
              {['Video Series', 'Community Feed'].map((cType) => (
                <div
                  key={cType}
                  className="w-full p-3 rounded-xl bg-[var(--bg-surface,#242424)] border border-[var(--border-subtle,#303030)] flex items-center justify-between opacity-50 cursor-not-allowed"
                >
                  <span className="text-xs font-semibold text-[var(--text-secondary,#A3A3A3)]">{cType}</span>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-[var(--accent-secondary,#F9B67D)] bg-[var(--accent-secondary,#F9B67D)]/15 px-1.5 py-0.5 rounded-full">
                    Coming Soon
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {addContentType === 'product' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddContentType('selector')}
                className="p-1 rounded-full text-[var(--text-secondary,#A3A3A3)] hover:text-[var(--text-heading,#F5F5F5)] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider">Select Existing Digital Product</span>
            </div>

            {!products.length ? (
              <p className="text-xs text-[var(--text-secondary,#A3A3A3)] py-4 text-center">No digital products found. Create a product first!</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {products.map((p) => {
                  const alreadyInCollection = editingCollection?.props?.items?.some((it) => (it.productId && String(it.productId) === String(p.id)) || (it.id && String(it.id) === String(p.id)))
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={alreadyInCollection}
                      onClick={() => {
                        if (editingCollection) {
                          addItemToCollection(editingCollection.id, {
                            id: uuidv4(),
                            type: 'product',
                            productId: p.id,
                          })
                          setAddContentModalOpen(false)
                        }
                      }}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${alreadyInCollection
                        ? 'bg-[var(--bg-surface,#242424)]/50 border-[var(--border-subtle,#303030)] opacity-50 cursor-not-allowed'
                        : 'bg-[var(--bg-surface,#242424)] border-[var(--border-subtle,#303030)] hover:border-[var(--accent-primary)] cursor-pointer'
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] overflow-hidden shrink-0 flex items-center justify-center">
                          {p.thumbnail ? (
                            <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-4 w-4 text-[var(--accent-primary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-heading,#F5F5F5)] truncate">{p.title}</p>
                          <p className="text-[11px] text-[var(--accent-primary)] font-semibold">
                            {Number(p.price) === 0 ? 'Free' : formatMoney(p.price, p.currency)}
                          </p>
                        </div>
                      </div>
                      {alreadyInCollection ? (
                        <span className="text-[10px] text-[var(--text-secondary,#A3A3A3)] font-bold">Added</span>
                      ) : (
                        <Plus className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {addContentType === 'link' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddContentType('selector')}
                className="p-1 rounded text-[rgba(244,242,236,0.68)] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-extrabold text-[rgba(244,242,236,0.68)] uppercase tracking-wider">Add External Link</span>
            </div>

            <div className="space-y-3">
              <TextInput
                label="Title *"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                placeholder="e.g. Join my YouTube Channel"
              />
              <TextInput
                label="URL *"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="e.g. https://youtube.com/@mychannel"
              />
              <ModalFooterActions
                secondaryLabel="Cancel"
                onSecondary={() => setAddContentModalOpen(false)}
                primaryLabel="Add Link"
                onPrimary={() => {
                  if (!newLinkTitle.trim()) {
                    toast.error('Please enter a title for the link')
                    return
                  }
                  if (editingCollection) {
                    addItemToCollection(editingCollection.id, {
                      id: uuidv4(),
                      type: 'link',
                      title: newLinkTitle.trim(),
                      url: newLinkUrl.trim(),
                    })
                    setNewLinkTitle('')
                    setNewLinkUrl('')
                    setAddContentModalOpen(false)
                  }
                }}
              />
            </div>
          </div>
        )}
      </BaseModal>

      <CoachingBookingWizardModal
        open={coachingWizardOpen}
        onClose={() => {
          setCoachingWizardOpen(false)
          setCoachingWizardProductId(null)
        }}
        onSuccess={async (createdProd) => {
          await refreshStoreData()
          if (createdProd?.id && !coachingWizardProductId) {
            addSectionWithProps('product', { productId: createdProd.id, layout: 'classic' })
          }
          setCoachingWizardOpen(false)
          setCoachingWizardProductId(null)
        }}
        editProductId={coachingWizardProductId}
        creatorProfile={profile}
        currentPlan={me?.user?.plan || 'FREE'}
      />

      <ProductBundleModal
        isOpen={bundleModalOpen}
        existingBundle={editingBundle}
        onClose={() => {
          setBundleModalOpen(false)
          setEditingBundle(null)
        }}
        onSuccess={async (createdBundle) => {
          await refreshStoreData()
          setBundleModalOpen(false)
          setEditingBundle(null)
        }}
      />

      {/* UNSAVED THEME CHANGES NAVIGATION MODAL */}
      <BaseModal
        open={navConfirmOpen}
        onOpenChange={(open) => {
          setNavConfirmOpen(open)
          if (!open) {
            setPendingNavTab(null)
            setPendingNavHref(null)
          }
        }}
        title="You have unsaved theme changes."
        secondaryLabel="Stay"
        onSecondary={() => {
          setNavConfirmOpen(false)
          setPendingNavTab(null)
          setPendingNavHref(null)
        }}
        primaryLabel="Leave"
        onPrimary={() => {
          setNavConfirmOpen(false)
          revertTheme()
          if (pendingNavTab) {
            const nextTab = pendingNavTab
            setPendingNavTab(null)
            const params = new URLSearchParams(searchParams?.toString() || '')
            if (nextTab === 'design') params.set('tab', 'design')
            else params.delete('tab')
            const qs = params.toString()
            router.replace(qs ? `/dashboard/store?${qs}` : '/dashboard/store', { scroll: false })
          } else if (pendingNavHref) {
            const nextHref = pendingNavHref
            setPendingNavHref(null)
            router.push(nextHref)
          }
        }}
        primaryDanger
      >
        <p className="text-sm text-[var(--text-secondary,#A3A3A3)] leading-relaxed">
          Your current theme changes will be lost and the last saved version will be restored if you leave without saving.
        </p>
      </BaseModal>

      {/* FLOATING DRAG BADGE FOR DRAG-TO-COLLECTION */}
      {activeDraggingProduct && (
        <div
          style={{ left: dragCursorPos.x + 14, top: dragCursorPos.y + 14 }}
          className="fixed z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1F1F1F] text-white text-xs font-semibold shadow-2xl border border-white/20 select-none animate-in fade-in zoom-in-95 duration-75"
        >
          <FolderPlus className="h-4 w-4 text-[#3B82F6] shrink-0" />
          <span className="truncate max-w-[180px]">{activeDraggingProduct.title || 'Product'}</span>
          <span className="text-[10px] text-[#999995] font-normal">→ Drop on collection</span>
        </div>
      )}

    </div>
  )
}

/* ---------------- Helper Components & Forms ---------------- */

function AddLinkForm({ onSubmit, initialUrl = '', initialTitle = '' }) {
  const [title, setTitle] = useState(initialTitle)
  const [url, setUrl] = useState(initialUrl)
  const [layout, setLayout] = useState('classic')
  const [thumbnail, setThumbnail] = useState('')

  useEffect(() => {
    if (initialUrl) setUrl(initialUrl)
    if (initialTitle) setTitle(initialTitle)
  }, [initialUrl, initialTitle])

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(title, url, layout, thumbnail) }} className="space-y-4">
      <TextInput
        label="Link title"
        placeholder="e.g. Visit my website"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <TextInput
        label="Destination URL"
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <ModalFooterActions hideSecondary primaryLabel="Add Link to Store" primaryType="submit" />
    </form>
  )
}

function AddProductForm({ products = [], existingProductIds = [], onSelectProduct }) {
  const [search, setSearch] = useState('')
  const filtered = products.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3 py-2">
      <div className="relative">
        <Input
          placeholder="Search your products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] text-[var(--text-heading,#F5F5F5)] text-xs focus:border-[var(--accent-primary)]"
        />
      </div>
      <div className="max-h-64 overflow-y-auto space-y-2 no-scrollbar pr-0.5">
        {filtered.length > 0 ? (
          filtered.map((p) => {
            const isAdded = existingProductIds.includes(p.id)
            const priceDisplay = Number(p.price) === 0 ? 'Free' : formatMoney(p.price, p.currency || 'INR')

            return (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle,#303030)] bg-[var(--bg-surface,#242424)] hover:bg-[var(--bg-surface-hover,#2A2A2A)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                  <div className="h-10 w-10 rounded-full border border-[var(--border-subtle,#303030)] bg-[var(--bg-surface-hover,#2A2A2A)] flex items-center justify-center shrink-0 overflow-hidden text-[var(--accent-primary)]">
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-[var(--accent-primary)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--text-heading,#F5F5F5)] truncate">{p.title}</p>
                    <p className="text-[11px] font-semibold text-[var(--accent-primary)] mt-0.5">{priceDisplay}</p>
                  </div>
                </div>

                {isAdded ? (
                  <span className="font-semibold text-xs text-[var(--status-success,#22C55E)] bg-[var(--status-success,#22C55E)]/15 border border-[var(--status-success,#22C55E)]/30 px-3 py-1 rounded-full shrink-0 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5 text-[var(--status-success,#22C55E)]" /> Added
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onSelectProduct(p.id)}
                    className="font-semibold text-xs h-8 px-4 bg-[var(--accent-primary)] text-[var(--text-heading,#F5F5F5)] hover:bg-[var(--accent-primary)]/90 rounded-full shrink-0 cursor-pointer"
                  >
                    + Add
                  </Button>
                )}
              </div>
            )
          })
        ) : (
          <p className="text-xs font-medium text-[var(--text-secondary,#A3A3A3)] text-center py-6">No matching products found.</p>
        )}
      </div>
    </div>
  )
}

/* ---------------- 3-STEP DIGITAL PRODUCT FORM (INLINE CONTENT) ---------------- */
// Wizard state is local until Complete. For brand-new products nothing is
// written until onComplete. Legacy drafts (product.id) may still patch.
function DigitalProductForm({ step, setStep, product, saveState, onPatch, onSynced, onComplete, onDirty }) {
  const [deliveryType, setDeliveryType] = useState(product?.redirectUrl ? 'URL' : 'FILE')

  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [urlError, setUrlError] = useState('')
  const [showUploadHint, setShowUploadHint] = useState(false)
  const [stepError, setStepError] = useState('')

  const [uploadingThumb, setUploadingThumb] = useState(false)

  const [mailingListOptIn, setMailingListOptIn] = useState(true)
  const [completing, setCompleting] = useState(false)

  const thumbInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const productId = product?.id || null
  const [titleText, setTitleText] = useState('')
  const [descText, setDescText] = useState('')
  const [priceText, setPriceText] = useState('')
  const [comparePriceText, setComparePriceText] = useState('')
  const [urlText, setUrlText] = useState('')
  const [currency, setCurrency] = useState(product?.currency || 'inr')
  const [localThumbUrl, setLocalThumbUrl] = useState('')
  const [pendingThumbFile, setPendingThumbFile] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [localFileObj, setLocalFileObj] = useState(null)
  const seededFor = useRef(null)

  useEffect(() => {
    if (!productId || seededFor.current === productId) return
    seededFor.current = productId
    setTitleText(product.title === 'Untitled product' ? '' : (product.title || ''))
    setDescText(product.shortDescription || '')
    setPriceText(product.price ? String(product.price) : '')
    setComparePriceText(product.originalPrice ? String(product.originalPrice) : '')
    setUrlText(product.redirectUrl || '')
    setDeliveryType(product.redirectUrl ? 'URL' : 'FILE')
    setCurrency(product.currency || 'inr')
  }, [productId, product])

  useEffect(() => () => {
    if (localThumbUrl && localThumbUrl.startsWith('blob:')) URL.revokeObjectURL(localThumbUrl)
  }, [localThumbUrl])

  const title = titleText
  const description = descText
  const price = priceText
  const originalPrice = comparePriceText
  const destinationUrl = urlText
  const thumbnail = localThumbUrl || product?.thumbnail || ''
  const fileObj = localFileObj || (product?.fileId
    ? {
      id: product.fileId,
      name: product.fileName,
      size: product.fileSize ? `${(Number(product.fileSize) / 1024 / 1024).toFixed(2)} MB` : null,
    }
    : null)

  function markDirty() {
    onDirty?.()
  }

  useEffect(() => {
    try {
      if (!localStorage.getItem('cz_upload_hint_dismissed')) setShowUploadHint(true)
    } catch { /* storage unavailable (private mode) — just skip the hint */ }
  }, [])

  function dismissUploadHint() {
    setShowUploadHint(false)
    try { localStorage.setItem('cz_upload_hint_dismissed', '1') } catch { /* non-fatal */ }
  }

  function validateUrl(urlStr) {
    if (!urlStr) return 'URL is required'
    const trimmed = urlStr.trim()
    if (!trimmed.startsWith('https://')) return 'URL must start with https://'
    if (
      trimmed.includes('javascript:') ||
      trimmed.includes('data:') ||
      trimmed.includes('file:') ||
      trimmed.includes('localhost') ||
      trimmed.includes('127.0.0.1')
    ) {
      return 'Security error: Invalid or private destination URL'
    }
    return ''
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size exceeds 50MB limit')
      return
    }

    markDirty()
    setStepError('')

    if (!productId) {
      setPendingFile(file)
      setLocalFileObj({
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      })
      return
    }

    setUploadingFile(true)
    setUploadProgress(35)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload(`/products/${product.id}/file`, fd)
      setUploadProgress(100)
      onSynced(res.product || res)
      toast.success('File uploaded successfully!')
    } catch (err) {
      toast.error(err.message || 'File upload failed')
    } finally {
      setUploadingFile(false)
    }
  }

  async function handleThumbUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    markDirty()
    if (!productId) {
      if (localThumbUrl && localThumbUrl.startsWith('blob:')) URL.revokeObjectURL(localThumbUrl)
      setPendingThumbFile(file)
      setLocalThumbUrl(URL.createObjectURL(file))
      return
    }
    setUploadingThumb(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      onPatch({ thumbnail: res.url })
      toast.success('Thumbnail uploaded!')
    } catch (err) {
      toast.error(err.message || 'Thumbnail upload failed')
    } finally {
      setUploadingThumb(false)
    }
  }

  function step1ErrorMessage() {
    if (deliveryType === 'FILE' && !fileObj) return 'Please add a file or URL before continuing'
    if (deliveryType === 'URL') {
      const err = validateUrl(destinationUrl)
      if (err) return err === 'URL is required' ? 'Please add a file or URL before continuing' : err
    }
    return ''
  }

  function step2ErrorMessage() {
    if (!title.trim()) return 'Product name is required'
    if (price === '' || isNaN(Number(price))) return 'A valid price is required'
    if (!description.trim()) return 'Product description is required'
    return ''
  }

  function goStep2() {
    const msg = step1ErrorMessage()
    if (msg) {
      setStepError(msg)
      toast.error(msg)
      return
    }
    setStepError('')
    setStep(2)
  }

  function goStep3() {
    const msg = step2ErrorMessage()
    if (msg) {
      setStepError(msg)
      toast.error(msg)
      return
    }
    setStepError('')
    setStep(3)
  }

  async function handleComplete() {
    const first = step1ErrorMessage() || step2ErrorMessage()
    if (first) {
      setStepError(first)
      toast.error(first)
      return
    }
    setCompleting(true)
    try {
      await onComplete({
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        currency,
        originalPrice: originalPrice === '' ? null : Number(originalPrice),
        redirectUrl: deliveryType === 'URL' ? destinationUrl.trim() : null,
        thumbnailUrl: product?.thumbnail || '',
        pendingFile: deliveryType === 'FILE' ? pendingFile : null,
        pendingThumbFile,
        mailingListOptIn,
      })
    } finally {
      setCompleting(false)
    }
  }

  const inputClass = 'bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] placeholder:text-[#999995] text-sm rounded-xl w-full focus:border-[#1F1F1F]'

  return (
    <div className="flex flex-col gap-section w-full">
      {/* Step progress */}
      <div className="flex flex-col gap-field pb-2 border-b border-edge w-full">
        <div className="flex items-center justify-between">
          <span className="text-micro text-brand uppercase">Step {step} of 3</span>
          <div className="flex items-center gap-inline">
            {saveState === 'saving' && <span className="text-meta text-content-muted">Saving…</span>}
            {saveState === 'saved' && (
              <span className="flex items-center gap-1 text-meta text-success">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            <span className="text-meta text-content-secondary">
              {step === 1 ? 'Delivery' : step === 2 ? 'Product Details' : 'Collect Info'}
            </span>
          </div>
        </div>
        <div className="h-1 w-full bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-300 rounded-full"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
        {stepError && (
          <p className="text-meta text-error-fg bg-surface-overlay border border-edge rounded-control px-3 py-2">
            {stepError}
          </p>
        )}
      </div>

      {/* STEP 1: DELIVERY */}
      {step === 1 && (
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1">
            <h4 className="text-section text-content-primary">Delivery</h4>
            <p className="text-meta text-content-muted">
              {deliveryType === 'FILE'
                ? 'Upload a file that customers will receive immediately after purchase.'
                : 'Redirect customers to a destination URL after purchase.'}
            </p>
          </div>

          <SelectableCardGrid>
            <SelectableCard
              selected={deliveryType === 'FILE'}
              onSelect={() => setDeliveryType('FILE')}
              title="Upload a file"
              description="Customers receive a download immediately after purchase."
            />
            <SelectableCard
              selected={deliveryType === 'URL'}
              onSelect={() => {
                setDeliveryType('URL')
                setPendingFile(null)
                setLocalFileObj(null)
                markDirty()
                onPatch({ fileId: null, fileName: null, files: [] })
              }}
              title="Route to a URL"
              description="Redirect customers to a destination link after purchase."
            />
          </SelectableCardGrid>

          {deliveryType === 'FILE' ? (
            <div className="flex flex-col gap-3 w-full">
              <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />

              {showUploadHint && !fileObj && (
                <div className="flex items-start gap-inline p-3 rounded-control bg-surface-overlay border border-edge">
                  <Sparkles className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                  <p className="text-meta text-content-secondary flex-1">
                    Upload the file your customers will get instantly after buying.
                  </p>
                  <button
                    type="button"
                    onClick={dismissUploadHint}
                    aria-label="Dismiss tip"
                    className="text-content-muted hover:text-content-primary shrink-0 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {fileObj ? (
                <div className="w-full p-4 rounded-control border border-[#CBE957]/30 bg-[#CBE957]/15 flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-inline min-w-0 flex-1">
                    <CheckCircle2 className="h-5 w-5 text-[#CBE957] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-card-title text-content-primary truncate min-w-0">{fileObj.name}</p>
                      {fileObj.size && <p className="text-meta text-[#CBE957]">{fileObj.size}</p>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-label bg-surface-raised border-edge text-content-primary hover:bg-surface-hover shrink-0 rounded-control cursor-pointer"
                  >
                    Replace
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-edge hover:border-edge-focus rounded-control p-6 text-center cursor-pointer transition-colors bg-surface-raised flex flex-col gap-2"
                >
                  <Upload className="h-8 w-8 text-brand mx-auto" />
                  <div>
                    <p className="text-card-title text-content-primary">Upload file</p>
                    <p className="text-meta text-content-muted">Drag &amp; drop or click to select file (PDF, ZIP, MP4, etc.)</p>
                  </div>
                  {uploadingFile && (
                    <div className="flex flex-col gap-1 pt-2 w-full">
                      <p className="text-meta text-brand">Uploading… {uploadProgress}%</p>
                      <div className="h-1 w-full bg-surface-card rounded-full overflow-hidden">
                        <div className="h-full bg-brand transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <TextInput
              type="url"
              label="Destination URL *"
              placeholder="https://example.com/access-link"
              value={destinationUrl}
              error={urlError}
              onChange={(e) => {
                const val = e.target.value
                setUrlText(val)
                setUrlError(validateUrl(val))
                setStepError('')
                markDirty()
                onPatch({ redirectUrl: val })
              }}
            />
          )}

          <ModalFooterActions
            hideSecondary
            primaryLabel="Continue"
            onPrimary={goStep2}
          />
        </div>
      )}

      {/* STEP 2: PRODUCT DETAILS */}
      {step === 2 && (
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1">
            <h4 className="text-section text-content-primary">Product Details</h4>
            <p className="text-meta text-content-muted">Set your title, thumbnail, and pricing.</p>
          </div>

          {/* Thumbnail */}
          <div className="flex flex-col gap-field">
            <label className="block text-label text-content-secondary">Thumbnail</label>
            <input ref={thumbInputRef} type="file" accept="image/*" onChange={handleThumbUpload} className="hidden" />
            <div className="flex items-center gap-inline">
              <div className="h-14 w-14 rounded-control border border-edge bg-surface-raised flex items-center justify-center overflow-hidden shrink-0 text-brand">
                {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6" />}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => thumbInputRef.current?.click()}
                  className="h-8 text-label bg-surface-raised border-edge text-content-primary hover:bg-surface-hover rounded-control cursor-pointer"
                >
                  {uploadingThumb ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Upload'}
                </Button>
                {thumbnail && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      if (localThumbUrl && localThumbUrl.startsWith('blob:')) URL.revokeObjectURL(localThumbUrl)
                      setLocalThumbUrl('')
                      setPendingThumbFile(null)
                      markDirty()
                      onPatch({ thumbnail: '' })
                    }}
                    className="h-8 text-label text-error-fg hover:bg-surface-hover rounded-control cursor-pointer"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>

          <TextInput
            label="Product name *"
            placeholder="e.g. Master DSA Complete Guide"
            value={title}
            onChange={(e) => { setTitleText(e.target.value); setStepError(''); markDirty(); onPatch({ title: e.target.value }) }}
            required
          />
          <TextInput
            as="textarea"
            label="Description *"
            placeholder="Briefly describe what customers will receive..."
            value={description}
            onChange={(e) => { setDescText(e.target.value); setStepError(''); markDirty(); onPatch({ shortDescription: e.target.value, description: e.target.value }) }}
            rows={2}
            required
          />

          {/* Pricing & Currency */}
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="flex flex-col gap-field">
              <label className="block text-label text-content-secondary">Price *</label>
              <Input
                type="number"
                min="0"
                placeholder="499"
                value={price}
                onChange={(e) => { setPriceText(e.target.value); setStepError(''); markDirty(); onPatch({ price: e.target.value === '' ? 0 : Number(e.target.value) }) }}
                className={inputClass}
                required
              />
            </div>

            <div className="flex flex-col gap-field">
              <label className="block text-label text-content-secondary">Currency</label>
              <select
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); markDirty(); onPatch({ currency: e.target.value }) }}
                className="w-full h-9 bg-surface-raised border border-edge text-content-primary text-body px-2 rounded-control"
              >
                <option value="inr">INR (₹)</option>
                <option value="usd">USD ($)</option>
                <option value="eur">EUR (€)</option>
                <option value="gbp">GBP (£)</option>
              </select>
            </div>
          </div>

          {/* Compare-at Price */}
          <div className="flex flex-col gap-field w-full">
            <label className="block text-label text-content-secondary">Compare-at price (optional)</label>
            <Input
              type="number"
              min="0"
              placeholder="999"
              value={originalPrice}
              onChange={(e) => { setComparePriceText(e.target.value); markDirty(); onPatch({ originalPrice: e.target.value === '' ? null : Number(e.target.value) }) }}
              className={inputClass}
            />
            <p className="text-meta text-content-muted">Shown crossed out e.g. <span className="line-through">₹999</span> ₹499</p>
          </div>

          <ModalFooterActions
            secondaryLabel="Back"
            onSecondary={() => setStep(1)}
            primaryLabel="Continue"
            onPrimary={goStep3}
          />
        </div>
      )}

      {/* STEP 3: COLLECT INFO */}
      {step === 3 && (
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1">
            <h4 className="text-section text-content-primary">Collect Info</h4>
            <p className="text-meta text-content-muted">What information would you like to collect from customers?</p>
          </div>

          <div className="p-card bg-surface-raised rounded-control border border-edge flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between text-body text-content-primary">
              <span>Name</span>
              <span className="text-meta text-success">Required ✓</span>
            </div>
            <div className="flex items-center justify-between text-body text-content-primary pt-1 border-t border-edge-subtle">
              <span>Email</span>
              <span className="text-meta text-success">Required ✓</span>
            </div>
          </div>

          {/* Mailing list opt-in */}
          <div className="p-card bg-surface-raised rounded-control border border-edge flex items-center justify-between gap-inline w-full">
            <div className="flex flex-col gap-0.5">
              <p className="text-card-title text-content-primary">Mailing list opt-in</p>
              <p className="text-meta text-content-muted">Ask customers to join your list when submitting form.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={mailingListOptIn}
              aria-label="Mailing list opt-in"
              onClick={() => setMailingListOptIn(!mailingListOptIn)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${mailingListOptIn ? 'bg-brand' : 'bg-surface-hover'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-surface-base transition duration-200 ${mailingListOptIn ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <ModalFooterActions
            secondaryLabel="Back"
            onSecondary={() => setStep(2)}
            primaryLabel="Complete"
            onPrimary={handleComplete}
            primaryDisabled={completing}
            primaryLoading={completing}
          />
        </div>
      )}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="rounded-[6px] border border-white/10 bg-[#000000] p-4 space-y-3 shadow-xs">
      <h3 className="text-xs font-bold text-[rgba(244,242,236,0.68)] uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function SectionForm({ section, products = [], onChange }) {
  if (!section) return null
  const p = section.props || {}
  return (
    <Panel title={`${LABELS[section.type] || 'Section'} Settings`}>
      <div className="space-y-4">
        {section.type === 'profile' && <p className="text-xs text-[rgba(244,242,236,0.68)] font-medium">This section automatically renders your profile image, bio and social links.</p>}
        {(section.type === 'heading' || section.type === 'text') && (
          <>
            <Field label="Text Content">
              {section.type === 'heading' ? (
                <Input value={p.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="rounded-full" />
              ) : (
                <Textarea rows={4} value={p.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="rounded-xl" />
              )}
            </Field>
            <Field label="Alignment">
              <SelectNative value={p.align || 'center'} onChange={(v) => onChange({ align: v })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} />
            </Field>
          </>
        )}
        {section.type === 'button' && (
          <>
            <Field label="Button Label"><Input value={p.label || ''} onChange={(e) => onChange({ label: e.target.value })} className="rounded-full" /></Field>
            <Field label="Destination URL"><Input value={p.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://..." className="rounded-full" /></Field>
            <Field label="Presentation Layout">
              <SelectNative value={p.layout === 'featured' ? 'featured' : (p.layout === 'compact' ? 'classic' : (p.layout || 'classic'))} onChange={(v) => onChange({ layout: v })} options={[['classic', 'Classic (Icon + text)'], ['featured', 'Featured Card']]} />
            </Field>
            <Field label="Thumbnail Image URL">
              <Input value={p.thumbnail || ''} onChange={(e) => onChange({ thumbnail: e.target.value })} placeholder="https://..." className="rounded-full" />
            </Field>
          </>
        )}
        {section.type === 'image' && (
          <>
            <Field label="Image Source URL"><Input value={p.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://..." className="rounded-full" /></Field>
            <Field label="Alt Description"><Input value={p.alt || ''} onChange={(e) => onChange({ alt: e.target.value })} className="rounded-full" /></Field>
          </>
        )}
        {section.type === 'product' && (
          <>
            <Field label="Featured Product">
              <SelectNative value={p.productId || ''} onChange={(v) => onChange({ productId: v })}
                options={products.length ? products.map((pr) => [pr.id, `${pr.title} — ${Number(pr.price) === 0 ? 'FREE' : formatMoney(pr.price, pr.currency)}`]) : [['', 'No products available']]} />
            </Field>
            <Field label="Presentation Layout">
              <SelectNative value={p.layout === 'compact' ? 'classic' : (p.layout || 'featured')} onChange={(v) => onChange({ layout: v })} options={[['classic', 'Classic (Icon + text)'], ['featured', 'Featured Card']]} />
            </Field>
            <Field label="Custom CTA Text">
              <Input value={p.ctaLabel || ''} onChange={(e) => onChange({ ctaLabel: e.target.value })} placeholder="e.g. Get the Guide, Buy Now" className="rounded-full" />
            </Field>
          </>
        )}
        {section.type === 'product_grid' && (
          <>
            <Field label="Product Selection">
              <SelectNative value={p.source || 'all'} onChange={(v) => onChange({ source: v, productIds: v === 'all' ? undefined : (p.productIds || []) })} options={[['all', 'All Published Products'], ['custom', 'Custom Selection']]} />
            </Field>
            {p.source === 'custom' && (
              <div className="space-y-2 pt-1">
                {products.map((pr) => {
                  const checked = (p.productIds || []).includes(pr.id)
                  return (
                    <label key={pr.id} className="flex items-center gap-2.5 text-xs font-bold text-[#1F1F1F] cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={(e) => {
                        const set = new Set(p.productIds || [])
                        e.target.checked ? set.add(pr.id) : set.delete(pr.id)
                        onChange({ productIds: [...set] })
                      }} className="rounded-[3px] accent-[#1F1F1F]" /> {pr.title}
                    </label>
                  )
                })}
              </div>
            )}
          </>
        )}
        {section.type === 'social_links' && (
          <div className="space-y-2">
            <p className="text-xs text-[#3A4060] font-medium">Leave blank to use global profile links.</p>
            {SOCIAL_KEYS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input value={(p.links || {})[k] || ''} onChange={(e) => onChange({ links: { ...(p.links || {}), [k]: e.target.value } })} placeholder="URL" className="rounded-full" />
              </Field>
            ))}
          </div>
        )}
        {section.type === 'divider' && <p className="text-xs text-[var(--text-secondary,#A3A3A3)] font-medium">Clean separator line.</p>}
      </div>
    </Panel>
  )
}

const CURATED_FONTS = [
  ['Manrope', 'Manrope (Modern Sans)'],
  ['Geist', 'Geist (Clean Sans)'],
  ['Playfair Display', 'Playfair Display (Editorial Serif)'],
  ['DM Serif Display', 'DM Serif Display (Classic Serif)'],
  ['Poppins', 'Poppins (Friendly Sans)'],
  ['Georgia', 'Georgia (Traditional Serif)'],
]

function MiniStorefrontWireframe({ preset }) {
  const colors = preset.colors || {}
  const typography = preset.typography || {}
  const buttons = preset.buttons || {}

  return (
    <div
      className="w-full h-24 rounded-[4px] p-2.5 flex flex-col justify-between border overflow-hidden relative"
      style={{
        background: colors.background || '#000000',
        borderColor: colors.border || '#39414D',
      }}
    >
      {/* Mini Profile Header */}
      <div className="flex items-center gap-2">
        <div
          className="h-6 w-6 rounded-full shrink-0 border opacity-90"
          style={{
            background: colors.primaryColor || '#194DF5',
            borderColor: colors.border || '#FFFFFF',
          }}
        />
        <div className="space-y-0.5 flex-1 min-w-0">
          <div
            className="h-2 w-16 rounded-full opacity-90"
            style={{ background: colors.text, fontFamily: typography.headingFont }}
          />
          <div className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full opacity-60" style={{ background: colors.primaryColor }} />
            <span className="h-1 w-1 rounded-full opacity-60" style={{ background: colors.primaryColor }} />
            <span className="h-1 w-1 rounded-full opacity-60" style={{ background: colors.primaryColor }} />
          </div>
        </div>
      </div>

      {/* Mini Product Card Wireframe */}
      <div
        className="rounded-[4px] p-2 border flex items-center justify-between gap-2"
        style={{
          background: colors.surface || colors.cardBg,
          borderColor: colors.border,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="h-7 w-7 rounded-[3px] shrink-0 opacity-80"
            style={{ background: colors.primaryColor }}
          />
          <div className="space-y-1 flex-1 min-w-0">
            <div className="h-1.5 w-12 rounded-full opacity-80" style={{ background: colors.text }} />
            <div className="h-1 w-8 rounded-full opacity-40" style={{ background: colors.mutedText || colors.text }} />
          </div>
        </div>
        <div
          className="px-2 py-1 text-[8px] font-bold rounded-[3px] shrink-0"
          style={{
            background: colors.buttonColor || colors.primaryColor,
            color: colors.buttonText || '#FFFFFF',
            borderRadius: `${Math.min(buttons.radius || 4, 8)}px`,
          }}
        >
          CTA
        </div>
      </div>
    </div>
  )
}

function SwitchToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle,#303030)] bg-[var(--bg-surface,#242424)] cursor-pointer hover:bg-[var(--bg-surface-hover,#2A2A2A)] transition-colors">
      <span className="text-xs font-semibold text-[var(--text-heading,#F5F5F5)]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-[var(--accent-primary)] cursor-pointer"
      />
    </label>
  )
}

function DesignStudioPage({
  store,
  savedTheme,
  onChange,
  hasUnsavedThemeChanges,
  themeSaveState = 'idle',
  onSaveTheme,
  onRevertTheme,
  storeSlug,
  profile,
  products,
  pages = [],
  activePageId = null,
  onSelectPage,
  me,
  setShareOpen,
  onPersistAvatar,
  onBackToContent,
  canRemoveFooterBranding = false,
}) {
  const [activeSection, setActiveSection] = useState(null) // null | 'theme' | 'header' | 'wallpaper' | 'buttons' | 'text' | 'colors' | 'footer'
  const [mobileViewMode, setMobileViewMode] = useState('customize') // 'customize' | 'preview'
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [themeMatchModalOpen, setThemeMatchModalOpen] = useState(false)
  const [suggestedPalette, setSuggestedPalette] = useState(null)
  const avatarFileRef = useRef(null)
  const { setHeaderConfig, setPricingModalOpen } = useDashboardHeader()

  const previewStore = useMemo(() => {
    if (!store) return {}
    const activeTheme = store.theme || {}
    return {
      ...store,
      theme: {
        ...activeTheme,
        showFooterBranding: canRemoveFooterBranding ? (activeTheme.showFooterBranding ?? true) : true,
      },
    }
  }, [store, canRemoveFooterBranding])

  const handleSuggestThemeMatch = async (imgUrl) => {
    if (!imgUrl) return
    try {
      const palette = await extractImagePalette(imgUrl)
      if (palette) {
        setSuggestedPalette(palette)
        setThemeMatchModalOpen(true)
      }
    } catch (err) {
      console.error('Failed to extract palette:', err)
    }
  }

  const handleApplyMatchedTheme = (palette) => {
    onChange({
      headerLayout: 'immersive',
      background: palette.bg,
      cardBg: palette.surface,
      textColor: palette.text,
      secondaryTextColor: palette.textSecondary,
      buttonColor: palette.buttonBg,
      buttonTextColor: palette.buttonText,
      borderColor: palette.border,
      buttonRadius: 16,
      buttonShape: 'rounded',
      immersivePalette: palette,
    })
    setThemeMatchModalOpen(false)
    toast.success('Theme updated to match profile image!')
  }

  useEffect(() => {
    setHeaderConfig({
      title: 'Design',
      actions: null,
    })
  }, [setHeaderConfig])

  const theme = store?.theme || {}
  const rawPreset = theme?.presetId || theme?.id || 'creator'
  const activePresetId = LEGACY_THEME_ALIASES[rawPreset] || (STORE_PRESETS[rawPreset] ? rawPreset : 'creator')
  const activePreset = STORE_PRESETS[activePresetId] || STORE_PRESETS['creator']

  const storeUrl = typeof window !== 'undefined' && storeSlug ? `${window.location.origin}/${storeSlug}` : ''

  // Reset all design overrides to active theme preset defaults
  const resetAllToThemeDefaults = () => {
    onChange({
      presetId: activePresetId,
      layoutPreset: activePreset.layout?.defaultLayoutPreset || 'classic',
      primaryColor: activePreset.colors.primaryColor,
      buttonColor: activePreset.colors.buttonColor,
      buttonTextColor: activePreset.colors.buttonText,
      textColor: activePreset.colors.text,
      secondaryTextColor: activePreset.colors.mutedText,
      background: activePreset.colors.background,
      cardBg: activePreset.colors.cardBg,
      border: activePreset.colors.border,
      font: activePreset.typography.headingFont.split(',')[0].replace(/'/g, ''),
      buttonStyle: activePreset.buttons.style || 'filled',
      buttonRadius: activePreset.buttons.radius || 8,
      buttonShape: activePreset.buttons.radius >= 90 ? 'pill' : activePreset.buttons.radius === 0 ? 'square' : 'rounded',
      buttonShadow: 'soft',
      bgType: 'solid',
      gradientStart: activePreset.colors.background,
      gradientEnd: '#121212',
      gradientDirection: 'to bottom',
      backgroundImage: '',
      backgroundFit: 'cover',
      backgroundPosition: 'center',
      backgroundOverlay: 0.4,
      avatarSize: 'md',
      showUsername: true,
      showBio: true,
      showSocials: true,
      showAvatar: true,
      showFooterBranding: true,
      showFooterSocials: true,
    })
    setResetDialogOpen(false)
    toast.success('Reset all design customizations to theme defaults!')
  }

  // Section-specific reset helpers
  const resetButtonsToDefaults = () => {
    onChange({
      buttonStyle: activePreset.buttons.style || 'filled',
      buttonRadius: activePreset.buttons.radius || 8,
      buttonShape: activePreset.buttons.radius >= 90 ? 'pill' : activePreset.buttons.radius === 0 ? 'square' : 'rounded',
      buttonColor: activePreset.colors.buttonColor || activePreset.colors.primaryColor,
      buttonTextColor: activePreset.colors.buttonText || '#000000',
      buttonBorderColor: activePreset.colors.border || 'transparent',
      buttonShadow: 'soft',
    })
    toast.success('Reset button customizations to theme defaults')
  }

  const resetColorsToDefaults = () => {
    onChange({
      background: activePreset.colors.background,
      cardBg: activePreset.colors.cardBg,
      textColor: activePreset.colors.text,
      secondaryTextColor: activePreset.colors.mutedText,
      primaryColor: activePreset.colors.primaryColor,
      buttonColor: activePreset.colors.buttonColor,
      buttonTextColor: activePreset.colors.buttonText,
      border: activePreset.colors.border,
    })
    toast.success('Reset colors to theme defaults')
  }

  // Handle Avatar Upload
  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      if (res?.url) {
        onChange({ avatarUrl: res.url })
        toast.success('Profile image updated!')
        if (theme.headerLayout === 'immersive') {
          handleSuggestThemeMatch(res.url)
        }
      }
      setAvatarModalOpen(false)
    } catch (err) {
      toast.error(err.message || 'Avatar upload failed')
    } finally {
      setUploadingAvatar(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleHeaderLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      if (res?.url) {
        onChange({ headerLogoUrl: res.url, titleStyle: 'logo' })
        toast.success('Logo updated!')
      }
    } catch (err) {
      toast.error(err.message || 'Logo upload failed')
    }
  }

  // Handle Wallpaper Image Upload
  async function handleWallpaperUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    toast.loading('Uploading background image...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      if (res?.url) {
        onChange({ bgType: 'image', backgroundImage: res.url })
        toast.dismiss()
        toast.success('Background image uploaded!')
      }
    } catch (err) {
      toast.dismiss()
      toast.error(err.message || 'Image upload failed')
    }
  }

  async function handleWallpaperVideoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    toast.loading('Uploading background video...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      if (res?.url) {
        onChange({ bgType: 'video', backgroundVideo: res.url })
        toast.dismiss()
        toast.success('Background video uploaded!')
      }
    } catch (err) {
      toast.dismiss()
      toast.error(err.message || 'Video upload failed')
    }
  }

  return (
    <div className="space-y-6 text-[#010619] w-full lg:h-full lg:min-h-0 flex flex-col">
      {/* 1. TOP HEADER & MOBILE NAVIGATION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E5E5E3] pb-4 shrink-0">
        {onBackToContent && (
          <button
            type="button"
            onClick={onBackToContent}
            className="lg:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FFFFFF] hover:bg-[#F5F5F3] border border-[#E5E5E3] text-[#1F1F1F] text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Store</span>
          </button>
        )}
      </div>

      {/* MOBILE RESPONSIVE TOGGLE BAR (Visible on screens < lg) */}
      <div className="lg:hidden flex items-center justify-center gap-1 rounded-full border border-[#E5E5E3] bg-[#F5F5F3] p-1 w-full max-w-sm mx-auto shrink-0">
        <button
          type="button"
          onClick={() => setMobileViewMode('customize')}
          className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            mobileViewMode === 'customize' ? 'bg-[#1F1F1F] text-[#FFFFFF] shadow-xs font-bold' : 'text-[#71717A] hover:text-[#1F1F1F]'
          }`}
        >
          Customize
        </button>
        <button
          type="button"
          onClick={() => setMobileViewMode('preview')}
          className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            mobileViewMode === 'preview' ? 'bg-[#1F1F1F] text-[#FFFFFF] shadow-xs font-bold' : 'text-[#71717A] hover:text-[#1F1F1F]'
          }`}
        >
          Preview
        </button>
      </div>

      {/* 2-COLUMN STUDIO LAYOUT */}
      <div className="grid gap-8 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_420px] lg:items-stretch lg:h-full lg:min-h-0 items-start flex-1 min-h-0">
        {/* LEFT COLUMN: CUSTOMIZATION EDITOR */}
        <div className={`w-full max-w-[660px] mx-auto space-y-5 min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto subtle-scrollbar ${mobileViewMode === 'preview' ? 'hidden lg:block' : 'block'}`}>
          {/* SECTION DRILL-DOWN OR MAIN 7 ROWS LIST */}
          {activeSection !== null ? (
            <div className="space-y-4">
              {/* Note: Standardized all sub-panels; previously: !['buttons', 'theme', 'wallpaper', 'text', 'colors'].includes(activeSection) */}

              {/* ---------------- SUB-PANEL 1: THEME ---------------- */}
              {activeSection === 'theme' && (
                <ThemePanel
                  theme={theme}
                  onChange={onChange}
                  onBack={() => setActiveSection(null)}
                  onSave={onSaveTheme}
                  onCancel={() => {
                    if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                      onRevertTheme()
                    }
                  }}
                  onReset={() => {
                    const defaultTheme = STOREFRONT_GALLERY_THEMES.find((t) => t.id === 'creatorstore') || STOREFRONT_GALLERY_THEMES[1]
                    if (defaultTheme) onChange(themePatchFromGallery(defaultTheme, theme))
                  }}
                  hasUnsavedChanges={hasUnsavedThemeChanges}
                  isSaving={themeSaveState === 'saving'}
                />
              )}

              {/* ---------------- SUB-PANEL 2: HEADER ---------------- */}
              {activeSection === 'header' && (
                <HeaderPanel
                  theme={theme}
                  storeSlug={storeSlug}
                  avatarUrl={theme.avatarUrl || store?.avatarUrl || profile?.avatarUrl}
                  onChange={onChange}
                  onBack={() => setActiveSection(null)}
                  onSave={onSaveTheme}
                  onCancel={() => {
                    if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                      onRevertTheme()
                    }
                  }}
                  hasUnsavedChanges={hasUnsavedThemeChanges}
                  isSaving={themeSaveState === 'saving'}
                  onUpgrade={() => setPricingModalOpen(true)}
                  onAvatarUpload={handleAvatarUpload}
                  onLogoUpload={handleHeaderLogoUpload}
                  uploadingAvatar={uploadingAvatar}
                  onSuggestThemeMatch={handleSuggestThemeMatch}
                />
              )}

              {/* ---------------- SUB-PANEL 3: WALLPAPER ---------------- */}
              {activeSection === 'wallpaper' && (
                <WallpaperPanel
                  theme={theme}
                  onChange={onChange}
                  onBack={() => setActiveSection(null)}
                  onSave={onSaveTheme}
                  onCancel={() => {
                    if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                      onRevertTheme()
                    }
                  }}
                  onReset={() =>
                    onChange({
                      bgType: 'solid',
                      background: activePreset?.colors?.background || '#000000',
                      gradientStart: null,
                      gradientEnd: null,
                      gradientDirection: '135deg',
                      gradientStops: null,
                      wallpaperPattern: null,
                      backgroundImage: '',
                      backgroundVideo: '',
                    })
                  }
                  onUpgrade={() => setPricingModalOpen(true)}
                  onUploadImage={handleWallpaperUpload}
                  onUploadVideo={handleWallpaperVideoUpload}
                  hasUnsavedChanges={hasUnsavedThemeChanges}
                  isSaving={themeSaveState === 'saving'}
                />
              )}

              {/* ---------------- SUB-PANEL 4: BUTTONS ---------------- */}
              {activeSection === 'buttons' && (
                <ButtonsPanel
                  theme={theme}
                  activePreset={activePreset}
                  onChange={onChange}
                  onBack={() => setActiveSection(null)}
                  onSave={onSaveTheme}
                  onCancel={() => {
                    if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                      onRevertTheme()
                    }
                  }}
                  onReset={resetButtonsToDefaults}
                  hasUnsavedChanges={hasUnsavedThemeChanges}
                  isSaving={themeSaveState === 'saving'}
                />
              )}

              {/* ---------------- SUB-PANEL 5: TEXT (TYPOGRAPHY) ---------------- */}
              {activeSection === 'text' && (
                <TextPanel
                  theme={theme}
                  onChange={onChange}
                  onBack={() => setActiveSection(null)}
                  onSave={onSaveTheme}
                  onCancel={() => {
                    if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                      onRevertTheme()
                    }
                  }}
                  onReset={() =>
                    onChange({
                      font: activePreset?.typography?.bodyFont || 'Manrope',
                      titleFont: null,
                      altTitleFont: false,
                      textColor: activePreset?.colors?.text || '#FFFFFF',
                      titleColor: null,
                    })
                  }
                  onUpgrade={() => setPricingModalOpen(true)}
                  hasUnsavedChanges={hasUnsavedThemeChanges}
                  isSaving={themeSaveState === 'saving'}
                />
              )}

              {/* ---------------- SUB-PANEL 6: COLORS ---------------- */}
              {activeSection === 'colors' && (
                <ColorsPanel
                  theme={theme}
                  onChange={onChange}
                  onBack={() => setActiveSection(null)}
                  onSave={onSaveTheme}
                  onCancel={() => {
                    if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                      onRevertTheme()
                    }
                  }}
                  onReset={resetColorsToDefaults}
                  hasUnsavedChanges={hasUnsavedThemeChanges}
                  isSaving={themeSaveState === 'saving'}
                />
              )}

              {/* ---------------- SUB-PANEL 7: FOOTER ---------------- */}
              {activeSection === 'footer' && (
                <div className="bg-white border border-[#E5E5E3] rounded-[24px] p-5 sm:p-6 shadow-xs space-y-6">
                  <PanelHeader
                    title="Footer Customization"
                    onBack={() => setActiveSection(null)}
                    onSave={onSaveTheme}
                    onCancel={() => {
                      if (hasUnsavedThemeChanges && themeSaveState !== 'saving') {
                        onRevertTheme()
                      }
                    }}
                    hasUnsavedChanges={hasUnsavedThemeChanges}
                    isSaving={themeSaveState === 'saving'}
                  />
                  <div className="space-y-1">
                    <p className="text-xs text-[#6F6F6B]">Control footer branding and links displayed on your public storefront.</p>
                  </div>

                  <SwitchToggle
                    label="Show CreatorStore Branding ('CreatorStore' footer)"
                    checked={theme.showFooterBranding !== false}
                    onChange={(val) => {
                      if (!val && !canRemoveFooterBranding) {
                        toast.error('A Pro subscription is required to hide the CreatorStore footer branding.')
                        setPricingModalOpen(true)
                        return
                      }
                      onChange({ showFooterBranding: val })
                    }}
                  />

                  <SwitchToggle
                    label="Show Footer Social Links"
                    checked={theme.showFooterSocials !== false}
                    onChange={(val) => onChange({ showFooterSocials: val })}
                  />
                </div>
              )}
            </div>
          ) : (
            /* MAIN 7 CUSTOMIZATION ROWS LIST */
            <div className="space-y-3">
              <SettingsRow
                icon={Palette}
                iconColor={ICON_BADGE_COLORS.theme}
                title="Theme"
                description="Choose your storefront style"
                value={getGalleryTheme(getGalleryThemeId(theme)).name}
                onClick={() => setActiveSection('theme')}
              />
              <SettingsRow
                icon={User}
                iconColor={ICON_BADGE_COLORS.header}
                title="Header"
                description="Profile + username + bio"
                value={theme.headerLayout === 'immersive' ? 'Immersive Hero' : theme.headerLayout === 'hero' ? 'Hero' : 'Classic'}
                onClick={() => setActiveSection('header')}
              />
              <SettingsRow
                icon={ImageIcon}
                iconColor={ICON_BADGE_COLORS.wallpaper}
                title="Wallpaper"
                description="Fill / Gradient / Pattern"
                value={wallpaperStyleFromTheme(theme)}
                onClick={() => setActiveSection('wallpaper')}
              />
              <SettingsRow
                icon={MousePointerClick}
                iconColor={ICON_BADGE_COLORS.buttons}
                title="Buttons"
                description="Solid / Outline"
                value={styleKeyFromTheme(theme) === 'outline' ? 'Outline' : 'Solid'}
                onClick={() => setActiveSection('buttons')}
              />
              <SettingsRow
                icon={Type}
                iconColor={ICON_BADGE_COLORS.text}
                title="Text"
                description="Font + typography"
                value={theme.font || 'Manrope'}
                onClick={() => setActiveSection('text')}
              />
              <SettingsRow
                icon={Palette}
                iconColor={ICON_BADGE_COLORS.colors}
                title="Colors"
                description="Background + text + accent"
                onClick={() => setActiveSection('colors')}
                valueNode={(
                  <span className="flex items-center gap-1 bg-[var(--bg-surface-hover,#2A2A2A)] p-1 rounded-full border border-[var(--border-subtle,#303030)]">
                    <span className="h-3 w-3 rounded-full" style={{ background: theme.background || activePreset.colors.background }} />
                    <span className="h-3 w-3 rounded-full" style={{ background: theme.primaryColor || 'var(--accent-primary)' }} />
                    <span className="h-3 w-3 rounded-full" style={{ background: theme.textColor || '#FFFFFF' }} />
                  </span>
                )}
              />
              <SettingsRow
                icon={Layers}
                iconColor={ICON_BADGE_COLORS.footer}
                title="Footer"
                description="Branding + links"
                value="Branding"
                onClick={() => setActiveSection('footer')}
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: STICKY PHONE PREVIEW CANVAS */}
        <div className={`flex-col items-center justify-center gap-4 w-full max-w-[420px] lg:h-full lg:min-h-0 shrink-0 sticky top-6 ${mobileViewMode === 'customize' ? 'hidden lg:flex' : 'flex'}`}>
          {/* TOP PREVIEW URL BAR */}
          <div className="w-[min(390px,100%)] h-[44px] rounded-full border border-[#D8DFFA] bg-[#F2F5FE] px-4 flex items-center justify-between text-xs font-bold text-[#010619] shadow-sm shrink-0">
            <span className="truncate text-[#666666]">
              creatorstore.store/<span className="text-[#010619] font-bold">{storeSlug || me?.store?.username || 'store'}</span>
            </span>
            {storeUrl && (
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#1F1F1F] hover:text-[#000000] p-1 cursor-pointer transition-colors"
                title="Open Storefront in New Tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>

          {/* 390px x 844px MOBILE PHONE PREVIEW FRAME */}
          <div className="w-[min(390px,calc(100%-16px))] max-h-[calc(100vh-180px)] h-[844px] rounded-[44px] border-[10px] border-[var(--border-subtle,#303030)] bg-[var(--bg-sidebar,#0D0D0D)] shadow-2xl overflow-hidden flex flex-col relative shrink-0">
            <div className="flex-1 overflow-y-auto no-scrollbar pt-1">
              <StorePreview
                key={`${theme.headerLayout || 'classic'}-${theme.avatarUrl || store?.avatarUrl || profile?.avatarUrl || 'none'}`}
                device="mobile"
                editor
                store={previewStore}
                username={storeSlug}
                profile={{
                  ...(profile || {}),
                  username: storeSlug || profile?.username,
                  avatarUrl: theme.avatarUrl || store?.avatarUrl || profile?.avatarUrl,
                  bio: theme.headerBio !== undefined ? theme.headerBio : store?.bio,
                }}
                products={products}
                pages={pages}
                activePageId={activePageId}
                onSelectPage={(targetId) => onSelectPage?.(targetId === 'home' ? null : targetId)}
              />
            </div>
          </div>
        </div>
      </div>

      <BaseModal
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset All Customizations"
        secondaryLabel="Cancel"
        onSecondary={() => setResetDialogOpen(false)}
        primaryLabel="Reset All Customizations"
        onPrimary={resetAllToThemeDefaults}
        primaryDanger
      >
        <div className="space-y-3">
          <AlertCircle className="h-10 w-10 text-[var(--accent-secondary,#F9B67D)]" />
          <p className="text-sm text-[var(--text-secondary,#A3A3A3)] leading-relaxed">
            Are you sure you want to reset all design overrides back to the <strong className="text-[var(--text-heading,#F5F5F5)]">{activePreset.name}</strong> theme defaults?
          </p>
          <p className="text-xs font-semibold text-[var(--status-success,#22C55E)] bg-[var(--status-success,#22C55E)]/10 border border-[var(--status-success,#22C55E)]/30 p-3 rounded-xl">
            Your digital products, links, bio, and content will remain untouched.
          </p>
        </div>
      </BaseModal>

      {/* REVERT CONFIRMATION MODAL */}
      <BaseModal
        open={revertConfirmOpen}
        onOpenChange={setRevertConfirmOpen}
        title="Discard unsaved changes?"
        secondaryLabel="Cancel"
        onSecondary={() => setRevertConfirmOpen(false)}
        primaryLabel="Revert Changes"
        onPrimary={() => {
          setRevertConfirmOpen(false)
          onRevertTheme()
        }}
        primaryDanger
      >
        <p className="text-sm text-[var(--text-secondary,#A3A3A3)] leading-relaxed">
          Your current theme changes will be lost and the last saved version will be restored.
        </p>
      </BaseModal>

      {/* THEME MATCH CONFIRMATION MODAL */}
      <ThemeMatchModal
        open={themeMatchModalOpen}
        onClose={() => setThemeMatchModalOpen(false)}
        onApply={handleApplyMatchedTheme}
        palette={suggestedPalette}
        avatarUrl={theme.avatarUrl || store?.avatarUrl || profile?.avatarUrl}
        title={theme.headerTitle !== undefined ? theme.headerTitle : (storeSlug ? `@${storeSlug}` : profile?.name)}
        bio={theme.headerBio || store?.bio || profile?.bio}
        products={products}
        sections={store?.sections}
      />
    </div>
  )
}

function Field({ label, children }) {
  return <div className="space-y-1.5"><Label className="text-xs font-bold text-[#010619]">{label}</Label>{children}</div>
}
function SelectNative({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-full border border-[#E5E5E3] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#1F1F1F] outline-none focus:border-[#1F1F1F] cursor-pointer">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

/* ---------------- EDIT DIGITAL PRODUCT FORM ---------------- */
function EditDigitalProductForm({ productId, initialProduct = null, onUpdated, onClose }) {
  const [loading, setLoading] = useState(!initialProduct)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [deliveryType, setDeliveryType] = useState('FILE')

  // File state
  const [fileObj, setFileObj] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // URL state
  const [destinationUrl, setDestinationUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  // Details state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('499')
  const [currency, setCurrency] = useState('inr')
  const [originalPrice, setOriginalPrice] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [uploadingThumb, setUploadingThumb] = useState(false)

  const fileInputRef = useRef(null)
  const thumbInputRef = useRef(null)

  const populateForm = useCallback((p) => {
    if (!p) return
    setTitle(p.title || '')
    setDescription(p.description || p.shortDescription || '')
    setPrice(p.price !== undefined && p.price !== null ? String(p.price) : '0')
    setOriginalPrice(p.originalPrice ? String(p.originalPrice) : '')
    setCurrency(p.currency || 'inr')
    setThumbnail(p.thumbnail || '')

    if (p.redirectUrl) {
      setDeliveryType('URL')
      setDestinationUrl(p.redirectUrl)
    } else {
      setDeliveryType('FILE')
    }

    if (p.files && p.files.length > 0) {
      const f = p.files[0]
      setFileObj({
        id: f.id || f.fileId || String(Date.now()),
        name: f.name || f.fileName || 'Attached File',
        size: f.size || (f.fileSize ? `${(f.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Attached File'),
        url: f.url || '',
      })
    } else if (p.fileId || p.fileName) {
      setFileObj({
        id: p.fileId || String(Date.now()),
        name: p.fileName || 'Attached File',
        size: p.fileSize ? `${(p.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Attached File',
        url: p.fileUrl || '',
      })
    }
  }, [])

  const loadProduct = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.get(`/products/${productId}`)
      const p = res.product || res
      populateForm(p)
    } catch (err) {
      if (initialProduct) {
        populateForm(initialProduct)
      } else {
        setLoadError(err.message || 'Unable to load product details')
      }
    } finally {
      setLoading(false)
    }
  }, [productId, initialProduct, populateForm])

  useEffect(() => {
    if (initialProduct) {
      populateForm(initialProduct)
    }
    loadProduct()
  }, [productId, loadProduct, initialProduct, populateForm])

  function validateUrl(urlStr) {
    if (!urlStr) return 'URL is required'
    const trimmed = urlStr.trim()
    if (!trimmed.startsWith('https://')) return 'URL must start with https://'
    if (
      trimmed.includes('javascript:') ||
      trimmed.includes('data:') ||
      trimmed.includes('file:') ||
      trimmed.includes('localhost') ||
      trimmed.includes('127.0.0.1')
    ) {
      return 'Security error: Invalid or private destination URL'
    }
    return ''
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size exceeds 50MB limit')
      return
    }

    setUploadingFile(true)
    setUploadProgress(35)
    try {
      const fd = new FormData()
      fd.append('file', file)
      let res
      try {
        res = await api.upload(`/products/${productId}/file`, fd)
      } catch {
        res = await api.upload('/upload', fd)
      }

      setUploadProgress(100)
      const uploadedFile = {
        id: res?.fileId || res?.id || res?.path || String(Date.now()),
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        mime: file.type,
        url: res?.url || '',
      }
      setFileObj(uploadedFile)
      toast.success('✓ File replaced successfully!')
    } catch (err) {
      toast.error(err.message || 'File upload failed')
    } finally {
      setUploadingFile(false)
    }
  }

  async function handleThumbUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingThumb(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.upload('/upload', fd)
      setThumbnail(res.url)
      toast.success('Thumbnail uploaded!')
    } catch (err) {
      toast.error(err.message || 'Thumbnail upload failed')
    } finally {
      setUploadingThumb(false)
    }
  }

  async function handleSaveChanges() {
    if (!title.trim()) return toast.error('Product title is required')
    if (isNaN(Number(price))) return toast.error('Valid price is required')
    if (deliveryType === 'URL') {
      const err = validateUrl(destinationUrl)
      if (err) return toast.error(err)
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        shortDescription: description.trim(),
        description: description.trim(),
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : null,
        currency,
        thumbnail,
        redirectUrl: deliveryType === 'URL' ? destinationUrl : null,
        fileId: fileObj?.id || null,
        fileName: fileObj?.name || null,
        files: fileObj ? [fileObj] : [],
      }

      const res = await api.patch(`/products/${productId}`, payload)
      const updated = res.product || res
      toast.success('✓ Product updated successfully!')
      onUpdated(updated)
    } catch (err) {
      toast.error(err.message || 'Failed to update product')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center space-y-3 w-full">
        <Loader2 className="h-8 w-8 text-[#1F1F1F] animate-spin mx-auto" />
        <p className="text-xs font-bold text-[#1F1F1F]">Loading product details...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8 text-center space-y-3 w-full">
        <AlertCircle className="h-8 w-8 text-[#EF4444] mx-auto" />
        <p className="text-xs font-bold text-[#EF4444]">Unable to load this product.</p>
        <p className="text-[11px] text-[#666666]">{loadError}</p>
        <Button size="sm" onClick={loadProduct} className="bg-[#FFFFFF] border border-[#D8DFFA] text-[#010619] hover:bg-[#E8EDFB] text-xs font-semibold rounded-full cursor-pointer">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full text-[#1F1F1F]">
      {/* Delivery Section */}
      <div className="space-y-3 w-full">
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-[#1F1F1F]">Delivery</h4>
          <p className="text-xs text-[#6F6F6B]">
            {deliveryType === 'FILE' ? 'File customers will receive after purchase.' : 'Destination URL customers are redirected to.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 bg-[#F5F5F3] rounded-full border border-[#E5E5E3] w-full">
          <button
            type="button"
            onClick={() => setDeliveryType('FILE')}
            className={`py-2 text-xs font-semibold rounded-full transition-all cursor-pointer ${deliveryType === 'FILE' ? 'bg-[#1F1F1F] text-[#FFFFFF]' : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
              }`}
          >
            Upload a file
          </button>
          <button
            type="button"
            onClick={() => setDeliveryType('URL')}
            className={`py-2 text-xs font-semibold rounded-full transition-all cursor-pointer ${deliveryType === 'URL' ? 'bg-[#1F1F1F] text-[#FFFFFF]' : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
              }`}
          >
            Route to a URL
          </button>
        </div>

        {deliveryType === 'FILE' ? (
          <div className="space-y-3 w-full">
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />

            {fileObj ? (
              <div className="w-full p-4 rounded-xl border border-[#16A34A]/20 bg-[#16A34A]/10 flex items-center justify-between gap-3 min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#1F1F1F] truncate min-w-0">{fileObj.name}</p>
                    <p className="text-[11px] font-semibold text-[#16A34A] mt-0.5">{fileObj.size || 'Attached file'}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 text-xs font-semibold bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] hover:bg-[#F5F5F3] shrink-0 ml-2 rounded-full cursor-pointer"
                >
                  Replace file
                </Button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#E5E5E3] hover:border-[#1F1F1F] rounded-xl p-6 text-center cursor-pointer transition-colors bg-[#FBFBFB] space-y-2"
              >
                <Upload className="h-8 w-8 text-[#1F1F1F] mx-auto" />
                <div>
                  <p className="text-xs font-bold text-[#1F1F1F]">Upload file</p>
                  <p className="text-[11px] text-[#6F6F6B]">Drag & drop or click to select file (PDF, ZIP, MP4, etc.)</p>
                </div>
                {uploadingFile && (
                  <div className="space-y-1 pt-2 w-full">
                    <p className="text-xs font-semibold text-[#1F1F1F]">Uploading... {uploadProgress}%</p>
                    <div className="h-1.5 w-full bg-[#E5E5E3] rounded-full overflow-hidden">
                      <div className="h-full bg-[#1F1F1F] transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 w-full">
            <label className="block text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Destination URL *</label>
            <Input
              type="url"
              placeholder="https://example.com/access-link"
              value={destinationUrl}
              onChange={(e) => {
                setDestinationUrl(e.target.value)
                setUrlError(validateUrl(e.target.value))
              }}
              className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-xs w-full focus:border-[#1F1F1F]"
            />
            {urlError && <p className="text-xs text-[#DC2626] font-semibold">{urlError}</p>}
          </div>
        )}
      </div>

      {/* Product Details Section */}
      <div className="space-y-4 pt-2 border-t border-[#E5E5E3] w-full">
        <h4 className="text-sm font-bold text-[#1F1F1F]">Product Information</h4>

        {/* Thumbnail */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold text-[#1F1F1F] uppercase tracking-wider">Thumbnail</label>
          <input ref={thumbInputRef} type="file" accept="image/*" onChange={handleThumbUpload} className="hidden" />
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full border border-[#E5E5E3] bg-[#F5F5F3] flex items-center justify-center overflow-hidden shrink-0 text-[#1F1F1F]">
              {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6" />}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => thumbInputRef.current?.click()}
                className="h-8 text-xs font-semibold bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] hover:bg-[#F5F5F3] rounded-full cursor-pointer"
              >
                {uploadingThumb ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Upload'}
              </Button>
              {thumbnail && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setThumbnail('')}
                  className="h-8 text-xs text-[#DC2626] hover:bg-[#DC2626]/10 rounded-full cursor-pointer"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Product Title *</label>
          <Input
            placeholder="Product title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-xs w-full focus:border-[#1F1F1F]"
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Description</label>
          <Textarea
            placeholder="Product description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-xs resize-none w-full focus:border-[#1F1F1F]"
          />
        </div>

        {/* Pricing & Currency */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Price *</label>
            <Input
              type="number"
              min="0"
              placeholder="499"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-xs w-full focus:border-[#1F1F1F]"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full h-9 bg-[#FFFFFF] border border-[#E5E5E3] text-[#1F1F1F] text-xs px-3 rounded-full focus:border-[#1F1F1F]"
            >
              <option value="inr">INR (₹)</option>
              <option value="usd">USD ($)</option>
              <option value="eur">EUR (€)</option>
              <option value="gbp">GBP (£)</option>
            </select>
          </div>
        </div>

        {/* Compare-at Price */}
        <div className="space-y-1 w-full">
          <label className="block text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Compare-at Price (Optional Original Price)</label>
          <Input
            type="number"
            min="0"
            placeholder="999"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-xs w-full focus:border-[#1F1F1F]"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-[#E5E5E3] w-full gap-3">
        <Button variant="outline" type="button" onClick={onClose} className="h-10 text-xs font-semibold bg-[#FFFFFF] text-[#1F1F1F] border-[#E5E5E3] hover:bg-[#F5F5F3] rounded-full cursor-pointer">
          Cancel
        </Button>
        <Button
          onClick={handleSaveChanges}
          disabled={saving}
          className="font-semibold text-xs h-10 px-6 bg-[#1F1F1F] text-[#FFFFFF] hover:bg-[#000000] rounded-full flex items-center gap-2 cursor-pointer shadow-xs"
        >
          {saving ? <CreatorStoreLoader variant="button" text="Saving..." size="xs" /> : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
