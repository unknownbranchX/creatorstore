'use client'

import { useState, useMemo } from 'react'
import {
  Play, Video, Images, Headphones, FileText, Download,
  ExternalLink, Eye, ChevronLeft, ChevronRight, Music,
  X, Camera, MoreVertical, Youtube, Music2, PlayCircle
} from 'lucide-react'
import { getContrastColor, getResourceButtonStyles } from '@/lib/colorContrast'
import { extractVideoEmbed, extractAudioEmbed } from '@/components/dashboard/AddMediaConfig'
import GalleryWizardModal from '@/components/storefront/GalleryWizardModal'
import ClassicLinkPill from '@/components/storefront/ClassicLinkPill'
import { storefrontCardRadiusCss } from '@/lib/storefrontLayout'

export default function StorefrontMediaCard({
  section,
  tokens = {},
  editor = false,
  username = '',
  products = [],
  onProductClick,
  onGalleryClick,
}) {
  const props = section.props || {}
  const rawType = section.type || props.mediaType || 'video'
  const sectionType = ['youtube', 'tiktok', 'vimeo', 'video'].includes(rawType) ? rawType : (props.mediaType || 'video')
  const title = props.title || ''
  const caption = props.caption || ''
  const url = props.url || ''

  const { colors = {}, buttons = {}, cards = {} } = tokens
  const bgHex = colors.background || colors.bg || '#0A0A0A'
  const surfaceTheme = useMemo(() => getContrastColor(bgHex, tokens), [bgHex, tokens])
  const isLight = surfaceTheme.isLight ?? false

  // Resource CTA Button dynamic contrast calculation
  const resourceBtnStyles = useMemo(() => {
    const rawBtnBg = buttons.color || colors.buttonColor || colors.primaryColor || '#194DF5'
    return getResourceButtonStyles(bgHex, rawBtnBg, surfaceTheme.cardBg)
  }, [bgHex, buttons.color, colors.buttonColor, colors.primaryColor, surfaceTheme.cardBg])

  // Selected image index for gallery lightbox / modal preview (null = closed)
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(null)
  const [isGalleryWizardOpen, setIsGalleryWizardOpen] = useState(false)

  // Card container styles standardized across all storefront cards
  const cardRadius = storefrontCardRadiusCss ? storefrontCardRadiusCss(tokens) : '20px'

  /* ========================================================================= */
  /* YOUTUBE MEDIA RENDERER & SOCIAL MEDIA RENDERER (Classic & Image layouts)  */
  /* ========================================================================= */
  const isCardMedia =
    (sectionType === 'youtube' || props.mediaType === 'youtube' || props.embedType === 'youtube') ||
    ['tiktok', 'vimeo'].includes(sectionType) ||
    ['tiktok', 'vimeo'].includes(props.mediaType) ||
    ['tiktok', 'vimeo'].includes(props.embedType) ||
    ((sectionType === 'video' || props.mediaType === 'video') && (props.layout === 'classic' || props.layout === 'image' || props.displayMode === 'classic' || props.displayMode === 'featured' || props.isUpload))

  if (isCardMedia) {
    const isImage = props.layout === 'image' || props.layout === 'featured' || props.displayMode === 'image' || props.displayMode === 'featured'

    // Determine platform
    const platform =
      sectionType === 'youtube' || props.mediaType === 'youtube' || props.embedType === 'youtube'
        ? 'youtube'
        : sectionType === 'tiktok' || props.mediaType === 'tiktok' || props.embedType === 'tiktok'
          ? 'tiktok'
          : sectionType === 'vimeo' || props.mediaType === 'vimeo' || props.embedType === 'vimeo'
            ? 'vimeo'
            : 'video'

    // Platform-specific styling & icons
    const PlatformIcon =
      platform === 'youtube'
        ? Youtube
        : platform === 'tiktok'
          ? Music2
          : platform === 'vimeo'
            ? PlayCircle
            : Play

    const platformColor =
      platform === 'youtube'
        ? '#EF4444'
        : platform === 'tiktok'
          ? '#18181B'
          : platform === 'vimeo'
            ? '#06B6D4'
            : '#84CC16'

    const platformLabel =
      platform === 'youtube'
        ? 'YouTube'
        : platform === 'tiktok'
          ? 'TikTok'
          : platform === 'vimeo'
            ? 'Vimeo'
            : 'Video'

    const ytId = platform === 'youtube'
      ? (props.videoId || extractVideoEmbed(url)?.videoId || (url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/) || [])[1])
      : null
    const defaultYtThumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null
    const tiktokThumbFallback = null
    const vimeoThumbFallback = null
    const defaultVideoThumb = null
    const fallbackThumb = defaultYtThumb || tiktokThumbFallback || vimeoThumbFallback || defaultVideoThumb
    const activeThumbnail = props.customThumbnail || props.thumbnail || fallbackThumb
    const safeUrl = url || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : '#')

    if (isImage) {
      // IMAGE LAYOUT (Phase 4.B & Phase 6)
      const card = (
        <div
          className="w-full overflow-hidden transition-all duration-200 group shadow-sm hover:shadow-md storefront-tile-chassis"
          style={{
            borderRadius: cardRadius,
            backgroundColor: surfaceTheme.cardBg,
            border: `1px solid ${surfaceTheme.cardBorder}`,
          }}
        >
          <div className="relative w-full aspect-video bg-[#0A0A0A] overflow-hidden flex items-center justify-center">
            {activeThumbnail ? (
              <img
                src={activeThumbnail}
                alt={title || `${platformLabel} Video`}
                onError={(e) => {
                  if (defaultYtThumb && e.currentTarget.src !== defaultYtThumb) {
                    e.currentTarget.src = defaultYtThumb
                  }
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
                <PlatformIcon className="h-10 w-10" style={{ color: platformColor }} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/20 transition-colors">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform"
                style={{ backgroundColor: platformColor }}
              >
                <Play className="h-6 w-6 text-white fill-current ml-0.5" />
              </div>
            </div>
          </div>
          <div className="p-4 flex items-center justify-between gap-3 text-left">
            <div className="min-w-0 flex-1">
              <h4
                className="text-sm font-bold tracking-tight line-clamp-2 leading-snug"
                style={{ color: surfaceTheme.heading || surfaceTheme.text }}
              >
                {title || `${platformLabel} Video`}
              </h4>
              <p
                className="text-[11px] font-semibold mt-1 flex items-center gap-1.5"
                style={{ color: platformColor }}
              >
                <PlatformIcon className="h-3.5 w-3.5" />
                <span>{platformLabel}</span>
              </p>
            </div>
            <div className="h-8 w-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center text-[#6F6F6B] group-hover:text-[#1F1F1F] dark:group-hover:text-white transition-colors shrink-0">
              <ExternalLink className="h-4 w-4" />
            </div>
          </div>
        </div>
      )

      return (
        <div className="w-full">
          {editor || !safeUrl || safeUrl === '#' ? (
            card
          ) : (
            <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
              {card}
            </a>
          )}
        </div>
      )
    }

    // CLASSIC LAYOUT: Standardized horizontal link tile matching Linktree reference
    const leading = activeThumbnail ? (
      <img
        src={activeThumbnail}
        alt=""
        onError={(e) => {
          if (defaultYtThumb && e.currentTarget.src !== defaultYtThumb) {
            e.currentTarget.src = defaultYtThumb
          }
        }}
        className="h-full w-full object-cover"
      />
    ) : (
      <div
        className="h-full w-full flex items-center justify-center"
        style={{ backgroundColor: platformColor }}
      >
        <PlatformIcon className="h-5 w-5 text-white" />
      </div>
    )

    return (
      <div className="w-full">
        <ClassicLinkPill
          tokens={tokens}
          leadingMedia={leading}
          badge="play"
          badgeBg={platformColor}
          label={title || `${platformLabel} Video`}
          meta={platformLabel}
          metaIcon={PlatformIcon}
          trailingIcon={MoreVertical}
          href={safeUrl}
          editor={editor}
        />
      </div>
    )
  }

  /* ========================================================================= */
  /* GENERAL VIDEO RENDERER                                                    */
  /* ========================================================================= */
  if (sectionType === 'video') {
    const embedInfo = extractVideoEmbed(url)

    return (
      <div
        className="w-full overflow-hidden transition-all shadow-sm storefront-tile-chassis"
        style={{
          borderRadius: cardRadius,
          backgroundColor: surfaceTheme.cardBg,
          border: `1px solid ${surfaceTheme.cardBorder}`,
        }}
      >
        {/* Video Player / Embed Container */}
        <div className="relative w-full aspect-video bg-[#0A0A0A] flex items-center justify-center overflow-hidden">
          {embedInfo?.embedUrl ? (
            <iframe
              src={embedInfo.embedUrl}
              title={title || 'Video Player'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          ) : embedInfo?.type === 'direct' ? (
            <video
              src={embedInfo.videoUrl || url}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
          ) : embedInfo?.thumbnail ? (
            <a
              href={editor ? undefined : url}
              target="_blank"
              rel="noreferrer"
              className="relative w-full h-full group block"
            >
              <img
                src={embedInfo.thumbnail}
                alt={title || 'Video Thumbnail'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/30 transition-colors">
                <div className="h-12 w-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                  <Play className="h-6 w-6 text-white fill-current ml-0.5" />
                </div>
              </div>
            </a>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
              <div className="h-12 w-12 rounded-full bg-[#242424] flex items-center justify-center">
                {sectionType === 'youtube' ? (
                  <Video className="h-6 w-6 text-red-500" />
                ) : (
                  <Play className="h-6 w-6 text-blue-400 fill-current" />
                )}
              </div>
              <p className="text-xs font-semibold" style={{ color: surfaceTheme.text }}>
                {url ? 'External Video Link' : 'No video URL specified'}
              </p>
            </div>
          )}
        </div>

        {/* Title & Caption Info */}
        {(title || caption) && (
          <div className="p-4 space-y-1 text-left">
            {title && (
              <h4
                className="text-sm font-bold tracking-tight line-clamp-1"
                style={{ color: surfaceTheme.heading || surfaceTheme.text }}
              >
                {title}
              </h4>
            )}
            {caption && (
              <p
                className="text-xs line-clamp-2"
                style={{ color: surfaceTheme.muted || surfaceTheme.textMuted }}
              >
                {caption}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ========================================================================= */
  /* IMAGE GALLERY RENDERER                                                    */
  /* ========================================================================= */
  if (sectionType === 'gallery') {
    const images = Array.isArray(props.images) ? props.images : []
    const layout = props.layout || props.displayMode || 'classic'
    const isClassic = layout === 'classic'

    if (!images.length) {
      return (
        <div
          className="w-full p-6 text-center border border-dashed rounded-2xl"
          style={{
            borderRadius: cardRadius,
            borderColor: surfaceTheme.cardBorder,
            backgroundColor: surfaceTheme.cardBg,
            color: surfaceTheme.muted || surfaceTheme.textMuted,
          }}
        >
          <Images className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs font-medium">Empty Image Gallery</p>
        </div>
      )
    }

    const gridClass = images.length === 1
      ? 'grid-cols-1'
      : images.length === 2
        ? 'grid-cols-2'
        : images.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3'

    const firstImgUrl = images[0]?.url
    const galleryThumbnail = firstImgUrl ? (
      <img
        src={firstImgUrl}
        alt={images[0]?.name || title || 'Gallery'}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
      />
    ) : (
      <Images className="h-5 w-5 opacity-60" style={{ color: surfaceTheme.text }} />
    )

    return (
      <>
        {/* CLASSIC STYLE: Compact Link-Style Gallery Pill matching Linktree reference */}
        {isClassic ? (
          <div className="w-full">
            <ClassicLinkPill
              tokens={tokens}
              leadingMedia={galleryThumbnail}
              label={title || 'My gallery'}
              meta={`Gallery · ${images.length} ${images.length === 1 ? 'photo' : 'photos'}`}
              metaIcon={Camera}
              trailingIcon={MoreVertical}
              onClick={() => {
                if (onGalleryClick) {
                  onGalleryClick(section)
                } else {
                  setIsGalleryWizardOpen(true)
                }
                setActiveGalleryIndex(0)
              }}
              editor={editor}
            />
          </div>
        ) : (
          /* FEATURED STYLE: Prominent Visual Card Presentation */
          <div
            onClick={() => {
              if (onGalleryClick) {
                onGalleryClick(section)
              } else {
                setIsGalleryWizardOpen(true)
              }
              setActiveGalleryIndex(0)
            }}
            className="w-full p-4 space-y-3 overflow-hidden shadow-sm transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] group storefront-tile-chassis"
            style={{
              borderRadius: cardRadius,
              backgroundColor: surfaceTheme.cardBg,
              border: `1px solid ${surfaceTheme.cardBorder}`,
            }}
          >
            {/* Gallery Title & Header */}
            {title && (
              <div className="text-left pb-1 flex items-center justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold tracking-tight" style={{ color: surfaceTheme.heading || surfaceTheme.text }}>
                    {title}
                  </h4>
                  {caption && (
                    <p className="text-xs mt-0.5" style={{ color: surfaceTheme.muted || surfaceTheme.textMuted }}>
                      {caption}
                    </p>
                  )}
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                  style={{
                    backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                    color: surfaceTheme.text,
                  }}
                >
                  <Camera className="h-3 w-3" />
                  {images.length}
                </span>
              </div>
            )}

            {/* Gallery Grid */}
            <div className={`grid ${gridClass} gap-2`}>
              {images.map((img, idx) => (
                <div
                  key={img.id || idx}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onGalleryClick) {
                      onGalleryClick(section)
                    } else {
                      setIsGalleryWizardOpen(true)
                    }
                    setActiveGalleryIndex(idx)
                  }}
                  className="relative aspect-square rounded-xl overflow-hidden group/item cursor-pointer bg-black/20 border border-white/5 shadow-xs"
                >
                  <img
                    src={img.url}
                    alt={img.name || `Gallery photo ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/item:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover/item:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover/item:opacity-100">
                    <div className="h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center shadow-md">
                      <Eye className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DEDICATED GALLERY WIZARD MODAL (Reference Image 1) */}
        {!onGalleryClick && (
          <GalleryWizardModal
            gallery={section}
            isOpen={isGalleryWizardOpen}
            onClose={() => {
              setIsGalleryWizardOpen(false)
              setActiveGalleryIndex(null)
            }}
            onProductClick={onProductClick}
          />
        )}
      </>
    )
  }

  /* ========================================================================= */
  /* AUDIO RENDERER                                                            */
  /* ========================================================================= */
  if (sectionType === 'audio') {
    const embedInfo = extractAudioEmbed(url)

    return (
      <div
        className="w-full p-4 space-y-3 overflow-hidden shadow-sm storefront-tile-chassis"
        style={{
          borderRadius: cardRadius,
          backgroundColor: surfaceTheme.cardBg,
          border: `1px solid ${surfaceTheme.cardBorder}`,
        }}
      >
        {/* Header with Title and Headphones Icon */}
        <div className="flex items-center gap-3 text-left">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: isLight ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.2)',
              color: isLight ? '#059669' : '#34D399',
            }}
          >
            <Headphones className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4
              className="text-sm font-bold tracking-tight truncate"
              style={{ color: surfaceTheme.heading || surfaceTheme.text }}
            >
              {title || 'Audio Stream'}
            </h4>
            {caption ? (
              <p
                className="text-xs truncate"
                style={{ color: surfaceTheme.muted || surfaceTheme.textMuted }}
              >
                {caption}
              </p>
            ) : (
              <p className="text-xs truncate" style={{ color: surfaceTheme.muted || surfaceTheme.textMuted }}>
                {embedInfo?.type === 'spotify' ? 'Spotify Player' : embedInfo?.type === 'soundcloud' ? 'SoundCloud' : 'Audio Track'}
              </p>
            )}
          </div>
        </div>

        {/* Audio Player / Embed Component */}
        <div className="w-full">
          {embedInfo?.type === 'spotify' && embedInfo?.embedUrl ? (
            <iframe
              src={embedInfo.embedUrl}
              width="100%"
              height="80"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="rounded-xl shadow-xs"
            />
          ) : embedInfo?.type === 'soundcloud' ? (
            <iframe
              width="100%"
              height="110"
              scrolling="no"
              frameBorder="no"
              allow="autoplay"
              src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%2310b981&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
              className="rounded-xl overflow-hidden"
            />
          ) : embedInfo?.type === 'direct' ? (
            <audio controls className="w-full rounded-lg" src={embedInfo.audioUrl || url}>
              Your browser does not support the audio element.
            </audio>
          ) : (
            <a
              href={editor ? undefined : url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl transition-colors hover:brightness-110"
              style={{
                backgroundColor: isLight ? '#F4F4F4' : '#242424',
                border: `1px solid ${surfaceTheme.inputBorder}`,
              }}
            >
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4" style={{ color: isLight ? '#059669' : '#34D399' }} />
                <span className="text-xs font-semibold" style={{ color: surfaceTheme.heading || surfaceTheme.text }}>
                  Listen to Audio Link
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5" style={{ color: surfaceTheme.muted || surfaceTheme.textMuted }} />
            </a>
          )}
        </div>
      </div>
    )
  }

  /* ========================================================================= */
  /* PDF DISPLAY RENDERER                                                      */
  /* ========================================================================= */
  if (sectionType === 'pdf') {
    const fileName = props.fileName || 'document.pdf'
    const fileSize = props.fileSize || ''

    return (
      <div
        className="w-full p-4 space-y-3 overflow-hidden shadow-sm transition-all storefront-tile-chassis"
        style={{
          borderRadius: cardRadius,
          backgroundColor: surfaceTheme.cardBg,
          border: `1px solid ${surfaceTheme.cardBorder}`,
        }}
      >
        <div className="flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
              style={{
                backgroundColor: isLight ? 'rgba(225, 29, 72, 0.12)' : 'rgba(244, 63, 94, 0.20)',
                color: isLight ? '#E11D48' : '#FB7185',
              }}
            >
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h4
                className="text-sm font-bold tracking-tight truncate"
                style={{ color: surfaceTheme.heading || surfaceTheme.text }}
              >
                {title || fileName}
              </h4>
              <p className="text-xs truncate flex items-center gap-1.5" style={{ color: surfaceTheme.muted || surfaceTheme.textMuted }}>
                <span
                  className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: isLight ? 'rgba(225, 29, 72, 0.12)' : 'rgba(244, 63, 94, 0.20)',
                    color: isLight ? '#BE123C' : '#FDA4AF',
                  }}
                >
                  PDF
                </span>
                {fileSize && <span>• {fileSize}</span>}
              </p>
            </div>
          </div>

          <a
            href={editor ? undefined : url}
            target="_blank"
            rel="noreferrer"
            download={fileName}
            className="group/btn flex items-center justify-center px-4 py-2 rounded-full font-bold text-xs shrink-0 transition-all hover:scale-105 hover:brightness-105 active:scale-95 shadow-sm"
            style={{
              backgroundColor: resourceBtnStyles.buttonBg,
              color: resourceBtnStyles.buttonTextColor,
              border: resourceBtnStyles.buttonBorder,
            }}
          >
            <Download
              className="h-3.5 w-3.5 mr-1.5 transition-transform group-hover/btn:-translate-y-0.5"
              style={{ color: resourceBtnStyles.buttonTextColor }}
            />
            <span style={{ color: resourceBtnStyles.buttonTextColor }}>View</span>
          </a>
        </div>

        {caption && (
          <p
            className="text-xs text-left pt-1 border-t"
            style={{
              borderColor: surfaceTheme.cardBorder,
              color: surfaceTheme.muted || surfaceTheme.textMuted,
            }}
          >
            {caption}
          </p>
        )}
      </div>
    )
  }

  return null
}
