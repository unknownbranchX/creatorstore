'use client'

import React from 'react'
import Link from 'next/link'

/**
 * CreatorStore Brand Constants
 * Primary brand color: CreatorStore orange #FF4B1F
 */
export const BRAND_COLOR = '#FF4B1F'
export const BRAND_COLOR_HOVER = '#FF6238'
export const BRAND_DARK = '#0D0D0D'
export const BRAND_WHITE = '#FFFFFF'

/**
 * Geometric Dotted "C" Dots Data
 * Formed by concentric circular arcs:
 * - Outer spine with larger dots at 158°-194° tapering down toward open tips (34° & 318°)
 * - Inner arc staggered in valleys between outer dots
 * - Trailing dots gracefully finishing the open mouth of the C
 */
export const CREATORSTORE_DOTS = [
  // Outer arc (10 circles)
  { cx: 80.68, cy: 29.31, r: 3.2, key: 'o0' },
  { cx: 67.14, cy: 17.77, r: 4.2, key: 'o1' },
  { cx: 48.76, cy: 14.52, r: 5.4, key: 'o2' },
  { cx: 30.15, cy: 20.70, r: 7.0, key: 'o3' },
  { cx: 17.55, cy: 37.11, r: 8.6, key: 'o4' },
  { cx: 17.55, cy: 62.89, r: 8.6, key: 'o5' },
  { cx: 30.15, cy: 79.30, r: 7.0, key: 'o6' },
  { cx: 48.76, cy: 85.48, r: 5.4, key: 'o7' },
  { cx: 67.14, cy: 82.23, r: 4.2, key: 'o8' },
  { cx: 80.68, cy: 70.69, r: 3.2, key: 'o9' },

  // Inner arc (9 circles staggered in valleys)
  { cx: 68.73, cy: 29.17, r: 2.6, key: 'i0' },
  { cx: 55.85, cy: 24.66, r: 3.4, key: 'i1' },
  { cx: 42.59, cy: 27.65, r: 4.4, key: 'i2' },
  { cx: 32.90, cy: 35.79, r: 5.4, key: 'i3' },
  { cx: 29.07, cy: 50.00, r: 6.0, key: 'i4' },
  { cx: 32.90, cy: 64.21, r: 5.4, key: 'i5' },
  { cx: 42.59, cy: 72.35, r: 4.4, key: 'i6' },
  { cx: 55.85, cy: 75.34, r: 3.4, key: 'i7' },
  { cx: 68.73, cy: 70.83, r: 2.6, key: 'i8' },

  // Trailing tips (4 circles)
  { cx: 78.28, cy: 38.57, r: 2.0, key: 't0' },
  { cx: 82.51, cy: 41.90, r: 1.6, key: 't1' },
  { cx: 78.28, cy: 61.43, r: 2.0, key: 't2' },
  { cx: 82.51, cy: 58.10, r: 1.6, key: 't3' },
]

export const SIZES = {
  xs: {
    iconSize: 'h-5 w-5',
    iconPx: 20,
    text: 'text-sm font-bold tracking-tight',
    gap: 'gap-2',
  },
  sm: {
    iconSize: 'h-6 w-6',
    iconPx: 24,
    text: 'text-[15px] sm:text-base font-bold tracking-tight',
    gap: 'gap-2.5',
  },
  md: {
    iconSize: 'h-7 w-7 sm:h-8 sm:w-8',
    iconPx: 32,
    text: 'text-[17px] sm:text-lg md:text-[19px] font-bold tracking-tight',
    gap: 'gap-3',
  },
  lg: {
    iconSize: 'h-9 w-9 sm:h-10 sm:w-10',
    iconPx: 40,
    text: 'text-xl sm:text-2xl md:text-[23px] font-bold tracking-tight',
    gap: 'gap-3.5',
  },
  xl: {
    iconSize: 'h-11 w-11 sm:h-12 sm:w-12',
    iconPx: 48,
    text: 'text-2xl sm:text-3xl font-bold tracking-tight',
    gap: 'gap-4',
  },
}

/**
 * CreatorStoreMark
 * Reusable abstract dotted "C" symbol component (icon only).
 * Flat orange-red (#FF3B20) fill by default, pure vector geometry.
 */
export function CreatorStoreMark({
  size = 'md',
  color = 'brand', // 'brand' | 'dark' | 'white' | 'inherit'
  className = '',
  style = {},
  ariaLabel = 'CreatorStore',
}) {
  const sizeConfig = SIZES[size] || SIZES.md
  const isCustomClass = className.includes('h-') || className.includes('w-')
  const sizeClasses = isCustomClass ? className : `${sizeConfig.iconSize} ${className}`

  return (
    <img
      src="/brand/creatorstore-logo.png"
      alt={ariaLabel || 'CreatorStore'}
      aria-label={ariaLabel || 'CreatorStore'}
      role="img"
      className={`aspect-square shrink-0 select-none object-contain rounded-full transition-transform duration-200 group-hover:scale-105 ${sizeClasses}`}
      style={style}
    />
  )
}

/**
 * Backwards-compatible alias for CreatorStoreLogoIcon
 */
export function CreatorStoreLogoIcon({
  size = 'md',
  variant = 'blue',
  className = '',
  alt = '',
}) {
  const color = variant === 'dark' || variant === 'black' ? 'dark' : variant === 'white' ? 'white' : 'brand'
  return (
    <CreatorStoreMark
      size={size}
      color={color}
      className={className}
      ariaLabel={alt || 'CreatorStore'}
    />
  )
}

/**
 * CreatorStoreWordmark
 * Clean modern sans-serif wordmark "CreatorStore"
 */
export function CreatorStoreWordmark({
  theme = 'dark',
  size = 'md',
  className = '',
}) {
  const sizeConfig = SIZES[size] || SIZES.md

  const themeTextColor =
    theme === 'light'
      ? 'text-[#0D0D0D]'
      : theme === 'brand' || theme === 'orange'
      ? 'text-[#000000]'
      : 'text-[#FFFFFF]'

  return (
    <span
      className={`creatorstore-wordmark font-sans font-bold whitespace-nowrap leading-none select-none transition-colors duration-150 tracking-tight ${sizeConfig.text} ${themeTextColor} ${className}`}
    >
      CreatorStore
    </span>
  )
}

/**
 * CreatorStoreLogo
 * Standard reusable lockup: [ICON] + [WORDMARK]
 */
export function CreatorStoreLogo({
  size = 'md',
  theme = 'dark', // 'dark' (orange-red icon + white text) | 'light' (orange-red icon + dark text) | 'brand' (dark icon + dark text)
  href = '/',
  className = '',
  iconClassName = '',
  wordmarkClassName = '',
  onClick,
  ariaLabel = 'CreatorStore',
}) {
  const sizeConfig = SIZES[size] || SIZES.md
  const iconColor = theme === 'brand' ? 'dark' : 'brand'

  const content = (
    <div
      className={`group flex items-center ${sizeConfig.gap} shrink-0 select-none ${className}`}
    >
      <CreatorStoreMark
        size={size}
        color={iconColor}
        className={iconClassName}
      />
      <CreatorStoreWordmark
        theme={theme}
        size={size}
        className={wordmarkClassName}
      />
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        onClick={onClick}
        className="no-underline shrink-0 flex items-center cursor-pointer select-none"
      >
        {content}
      </Link>
    )
  }

  return content
}

/**
 * CreatorStoreLogoCompact
 * Smaller icon + wordmark for compact navigation / header areas
 */
export function CreatorStoreLogoCompact({
  theme = 'dark',
  href = '/',
  className = '',
  onClick,
}) {
  return (
    <CreatorStoreLogo
      size="xs"
      theme={theme}
      href={href}
      className={className}
      onClick={onClick}
    />
  )
}

/**
 * Master CreatorStoreBrand component
 * Supports full backwards compatibility with all previous props while applying
 * the new CreatorStore dotted C brand identity.
 */
export default function CreatorStoreBrand({
  variant = 'full', // 'full' | 'compact' | 'icon' | 'wordmark-only' | 'stacked'
  theme = 'dark',   // 'dark' | 'light' | 'colored' | 'brand' | 'auto'
  size = 'md',      // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  iconVariant,      // override for icon color
  collapsed = false,
  href = '/',
  className = '',
  logoClassName = '',
  wordmarkClassName = '',
  ariaLabel = 'CreatorStore',
  onClick,
}) {
  const isCompact = collapsed || variant === 'compact' || variant === 'icon'
  const isWordmarkOnly = variant === 'wordmark-only'
  const isStacked = variant === 'stacked'
  const sizeConfig = SIZES[size] || SIZES.md

  // Determine icon color
  const resolvedColor =
    iconVariant === 'dark' || iconVariant === 'black'
      ? 'dark'
      : iconVariant === 'white'
      ? 'white'
      : theme === 'brand' || theme === 'colored'
      ? 'dark'
      : 'brand'

  const content = (
    <div
      className={`group flex ${
        isStacked ? 'flex-col items-center gap-1.5' : `items-center ${sizeConfig.gap}`
      } shrink-0 select-none ${className}`}
    >
      {!isWordmarkOnly && (
        <CreatorStoreMark
          size={size}
          color={resolvedColor}
          className={logoClassName}
          ariaLabel={isCompact ? 'CreatorStore' : ''}
        />
      )}

      {!isCompact && (
        <CreatorStoreWordmark
          theme={theme === 'colored' ? 'brand' : theme}
          size={size}
          className={wordmarkClassName}
        />
      )}
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        onClick={onClick}
        className="no-underline shrink-0 flex items-center cursor-pointer select-none"
      >
        {content}
      </Link>
    )
  }

  return content
}
