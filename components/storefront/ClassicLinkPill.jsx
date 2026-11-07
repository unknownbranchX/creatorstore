'use client'

import React from 'react'
import { ExternalLink, MoreVertical, Play } from 'lucide-react'
import { getStorefrontTileStyle, storefrontTileRadiusCss, storefrontTileShadowCss } from '@/lib/storefrontLayout'

/**
 * Standardized storefront link/media pill matching Linktree geometry and CreatorStore theme.
 * Standard geometry tokens:
 *   - min-height: var(--storefront-tile-min-height, 64px)
 *   - border-radius: var(--storefront-tile-radius, 22px)
 *   - padding: var(--storefront-tile-padding-y, 14px) var(--storefront-tile-padding-x, 18px)
 *   - width: 100% within the centered storefront column
 */
export default function ClassicLinkPill({
  label = '',
  meta = null,
  metaIcon: MetaIcon = null,
  media = null,
  leadingMedia = null,
  icon: IconComponent = null,
  tokens = {},
  align = null,
  trailing = null,
  trailingIcon: TrailingIcon = MoreVertical,
  onClick = null,
  href = null,
  editor = false,
  badge = null,
  badgeBg = null,
  style = {},
  className = '',
  children = null,
}) {
  const { header, contrast } = tokens || {}
  const isImmersive = header?.layout === 'immersive' && contrast
  const tileStyle = getStorefrontTileStyle(tokens)

  const activeMedia = leadingMedia || media
  const hasLeading = Boolean(activeMedia || IconComponent)
  const effectiveAlign = align || (hasLeading ? 'left' : 'center')
  const isCentered = effectiveAlign === 'center'

  const pillStyle = isImmersive
    ? {
        backgroundColor: contrast.surface,
        color: contrast.text,
        border: `1px solid ${contrast.border}`,
        borderRadius: storefrontTileRadiusCss(tokens?.buttons),
        boxShadow: tokens?.buttons?.shadow === 'none' ? 'none' : storefrontTileShadowCss(tokens?.buttons),
      }
    : tileStyle

  const content = (
    <div
      onClick={editor ? undefined : onClick}
      className={`group w-full flex items-center justify-between gap-3 sm:gap-3.5 transition-all duration-200 select-none hover:scale-[1.01] active:scale-[0.99] cursor-pointer storefront-tile-chassis ${className}`}
      style={{
        ...pillStyle,
        ...style,
        minHeight: 'var(--storefront-tile-min-height, 64px)',
        borderRadius: pillStyle.borderRadius || 'var(--storefront-tile-radius, 22px)',
        padding: 'var(--storefront-tile-padding-y, 14px) var(--storefront-tile-padding-x, 18px)',
        boxSizing: 'border-box',
      }}
    >
      {/* Leading Media or Placeholder for Center Balance */}
      {hasLeading ? (
        <div className="relative w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-[14px] overflow-hidden flex items-center justify-center bg-black/20 border border-white/10 shadow-xs">
          {React.isValidElement(activeMedia) ? (
            activeMedia
          ) : activeMedia?.type === 'image' && activeMedia.src ? (
            <img
              src={activeMedia.src}
              alt=""
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : activeMedia?.type === 'icon' && activeMedia.Icon ? (
            <div
              className="h-full w-full flex items-center justify-center"
              style={{
                backgroundColor: `${activeMedia.color || '#3B82F6'}20`,
                color: activeMedia.color || '#3B82F6',
              }}
            >
              <activeMedia.Icon className="h-5 w-5" />
            </div>
          ) : IconComponent ? (
            <IconComponent className="h-5 w-5" style={{ color: pillStyle.color }} />
          ) : (
            <span className="text-xs font-black">{activeMedia?.letter || '?'}</span>
          )}

          {badge === 'play' && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div
                className="h-4 w-4 rounded-full flex items-center justify-center shadow-xs"
                style={{ backgroundColor: badgeBg || '#EF4444' }}
              >
                <Play className="h-2 w-2 text-white fill-current ml-0.5" />
              </div>
            </div>
          )}
        </div>
      ) : isCentered ? (
        <div className="w-7 sm:w-8 shrink-0 pointer-events-none" aria-hidden="true" />
      ) : null}

      {/* Middle Text Content */}
      <div className={`min-w-0 flex-1 ${isCentered ? 'text-center' : 'text-left'}`}>
        <div
          className="text-sm sm:text-base font-bold tracking-tight truncate leading-snug group-hover:opacity-95"
          style={{ color: isImmersive ? contrast.text : undefined }}
        >
          {label}
        </div>
        {meta && (
          <div
            className={`text-xs font-medium opacity-70 truncate mt-0.5 flex items-center gap-1.5 ${isCentered ? 'justify-center' : 'justify-start'}`}
            style={{ color: isImmersive ? contrast.textSecondary : undefined }}
          >
            {MetaIcon && <MetaIcon className="h-3 w-3 shrink-0 opacity-80" />}
            <span>{meta}</span>
          </div>
        )}
        {children}
      </div>

      {/* Trailing Icon (MoreVertical default matching Linktree screenshot) */}
      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 opacity-40 group-hover:opacity-85 transition-opacity">
        {trailing || (TrailingIcon ? <TrailingIcon className="h-4 w-4" /> : <MoreVertical className="h-4 w-4" />)}
      </div>
    </div>
  )

  if (!editor && href && href !== '#') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full focus:outline-none"
      >
        {content}
      </a>
    )
  }

  return <div className="w-full">{content}</div>
}
