'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Sequential dots forming the CreatorStore "C" geometry.
 * Ordered clockwise along the curve from the upper tip to the lower tip.
 */
export const CREATORSTORE_C_DOTS = [
  // Upper mouth & top curve
  { key: 't1', cx: 82.51, cy: 41.90, r: 1.6 },
  { key: 't0', cx: 78.28, cy: 38.57, r: 2.0 },
  { key: 'o0', cx: 80.68, cy: 29.31, r: 3.2 },
  { key: 'i0', cx: 68.73, cy: 29.17, r: 2.6 },
  { key: 'o1', cx: 67.14, cy: 17.77, r: 4.2 },
  { key: 'i1', cx: 55.85, cy: 24.66, r: 3.4 },
  { key: 'o2', cx: 48.76, cy: 14.52, r: 5.4 },
  { key: 'i2', cx: 42.59, cy: 27.65, r: 4.4 },
  // Upper spine
  { key: 'o3', cx: 30.15, cy: 20.70, r: 7.0 },
  { key: 'i3', cx: 32.90, cy: 35.79, r: 5.4 },
  { key: 'o4', cx: 17.55, cy: 37.11, r: 8.6 },
  // Center spine (thickest)
  { key: 'i4', cx: 29.07, cy: 50.00, r: 6.0 },
  // Lower spine
  { key: 'o5', cx: 17.55, cy: 62.89, r: 8.6 },
  { key: 'i5', cx: 32.90, cy: 64.21, r: 5.4 },
  { key: 'o6', cx: 30.15, cy: 79.30, r: 7.0 },
  // Bottom curve & lower mouth
  { key: 'i6', cx: 42.59, cy: 72.35, r: 4.4 },
  { key: 'o7', cx: 48.76, cy: 85.48, r: 5.4 },
  { key: 'i7', cx: 55.85, cy: 75.34, r: 3.4 },
  { key: 'o8', cx: 67.14, cy: 82.23, r: 4.2 },
  { key: 'i8', cx: 68.73, cy: 70.83, r: 2.6 },
  { key: 'o9', cx: 80.68, cy: 70.69, r: 3.2 },
  { key: 't2', cx: 78.28, cy: 61.43, r: 2.0 },
  { key: 't3', cx: 82.51, cy: 58.10, r: 1.6 },
]

const SIZE_MAP = {
  xs: 16,
  sm: 24,
  md: 36,
  lg: 48,
  xl: 64,
  '2xl': 80,
}

/**
 * Animated SVG Dotted "C" Logo Mark
 */
export function CreatorStoreLogoMark({
  size = 'md',
  badge = false,
  badgeBg = '#0D0D0D',
  activeColor = '#FF3828',
  inactiveColor = '#57130E',
  className = '',
  style = {},
  ariaHidden = true,
}) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || SIZE_MAP.md
  const totalDots = CREATORSTORE_C_DOTS.length
  const durationSec = 1.2

  return (
    <svg
      viewBox="0 0 100 100"
      width={pixelSize}
      height={pixelSize}
      className={cn('shrink-0 select-none overflow-visible', className)}
      style={style}
      aria-hidden={ariaHidden}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{`
          @keyframes cs-dot-pulse {
            0% {
              fill: ${inactiveColor};
              opacity: 0.28;
              transform: scale(0.92);
            }
            20% {
              fill: ${activeColor};
              opacity: 1;
              transform: scale(1.15);
              filter: drop-shadow(0 0 2px ${activeColor}88);
            }
            40% {
              fill: #C42618;
              opacity: 0.65;
              transform: scale(1.02);
            }
            70%, 100% {
              fill: ${inactiveColor};
              opacity: 0.28;
              transform: scale(0.92);
            }
          }
          .cs-pulse-dot {
            transform-box: fill-box;
            transform-origin: center;
            animation: cs-dot-pulse ${durationSec}s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .cs-pulse-dot {
              animation: none !important;
              opacity: 0.88 !important;
              fill: ${activeColor} !important;
              transform: none !important;
              filter: none !important;
            }
          }
        `}</style>
      </defs>

      {/* Optional dark circular background badge */}
      {badge && <circle cx="50" cy="50" r="48" fill={badgeBg} />}

      {/* 23 Sequential Dotted-C circles */}
      {CREATORSTORE_C_DOTS.map((dot, index) => {
        // Negative delay ensures animation is already running on mount
        const delay = -((totalDots - index) / totalDots * durationSec).toFixed(3)
        return (
          <circle
            key={dot.key}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            className="cs-pulse-dot"
            style={{ animationDelay: `${delay}s` }}
          />
        )
      })}
    </svg>
  )
}

/**
 * FullScreenLoader
 * Centered modal/full-page overlay for critical data hydration
 */
export function FullScreenLoader({
  message = 'Loading your dashboard...',
  subtext,
  theme = 'dark',
  size = 'xl',
  badgeBg,
  activeColor = '#FF3828',
  inactiveColor,
  className = '',
  ...props
}) {
  const isDark = theme === 'dark'
  const resolvedBadgeBg = badgeBg || (isDark ? '#000000' : '#141414')
  const resolvedInactiveColor = inactiveColor || (isDark ? '#4A110D' : '#6A1510')

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center p-6 transition-opacity duration-300',
        isDark ? 'bg-[#0B0B0C]/95 text-[#FFFFFF]' : 'bg-[#FAFAFA]/95 text-[#1F1F1F]',
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center text-center max-w-sm">
        {/* Animated Signature Logo */}
        <div className="relative mb-5 flex items-center justify-center">
          <CreatorStoreLogoMark
            size={size}
            badge
            badgeBg={resolvedBadgeBg}
            activeColor={activeColor}
            inactiveColor={resolvedInactiveColor}
          />
        </div>

        {/* Status Message */}
        {message && (
          <h2
            className={cn(
              'text-base sm:text-lg font-bold tracking-tight',
              isDark ? 'text-[#FFFFFF]' : 'text-[#1F1F1F]'
            )}
          >
            {message}
          </h2>
        )}

        {/* Optional Subtext */}
        {subtext && (
          <p
            className={cn(
              'mt-1.5 text-xs sm:text-sm font-medium',
              isDark ? 'text-[#9CA3AF]' : 'text-[#6F6F6B]'
            )}
          >
            {subtext}
          </p>
        )}

        {/* Screen Reader Label */}
        <span className="sr-only">{message || 'Loading...'}</span>
      </div>
    </div>
  )
}

/**
 * InlineLoader
 * Compact loader for table sections, cards, and panels
 */
export function InlineLoader({
  message,
  size = 'sm',
  className = '',
  textClassName = '',
  activeColor,
  inactiveColor,
  ...props
}) {
  return (
    <div
      role="status"
      className={cn(
        'inline-flex items-center justify-center gap-2.5 py-4 select-none',
        className
      )}
      {...props}
    >
      <CreatorStoreLogoMark size={size} activeColor={activeColor} inactiveColor={inactiveColor} />
      {message && (
        <span className={cn('text-xs font-semibold text-[#6F6F6B]', textClassName)}>
          {message}
        </span>
      )}
      <span className="sr-only">{message || 'Loading...'}</span>
    </div>
  )
}

/**
 * ButtonLoader
 * Compact loader designed for action buttons (preserves button height/width)
 */
export function ButtonLoader({
  text = 'Saving...',
  size = 'xs',
  className = '',
  activeColor = '#FFFFFF',
  inactiveColor = 'rgba(255, 255, 255, 0.35)',
  ...props
}) {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-2 leading-none shrink-0', className)}
      {...props}
    >
      <CreatorStoreLogoMark size={size} activeColor={activeColor} inactiveColor={inactiveColor} />
      {text && <span>{text}</span>}
      <span className="sr-only">{text}</span>
    </span>
  )
}

/**
 * Master CreatorStoreLoader Component
 * Supports: 'default' | 'inline' | 'fullscreen' | 'button'
 */
export default function CreatorStoreLoader({
  variant = 'default',
  size,
  badge = false,
  badgeBg = '#0D0D0D',
  activeColor = '#FF3828',
  inactiveColor = '#57130E',
  message,
  subtext,
  text,
  theme = 'dark',
  className = '',
  ariaLabel = 'Loading...',
  textClassName = '',
  ...props
}) {
  if (variant === 'fullscreen') {
    return (
      <FullScreenLoader
        size={size || 'xl'}
        message={message || text || 'Loading...'}
        subtext={subtext}
        theme={theme}
        badgeBg={badgeBg}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
        className={className}
        {...props}
      />
    )
  }

  if (variant === 'inline') {
    return (
      <InlineLoader
        size={size || 'sm'}
        message={message || text}
        className={className}
        textClassName={textClassName}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
        {...props}
      />
    )
  }

  if (variant === 'button') {
    return (
      <ButtonLoader
        size={size || 'xs'}
        text={text || message || 'Saving...'}
        className={className}
        activeColor={activeColor === '#FF3828' ? '#FFFFFF' : activeColor}
        inactiveColor={inactiveColor === '#57130E' ? 'rgba(255, 255, 255, 0.35)' : inactiveColor}
        {...props}
      />
    )
  }

  // Default compact loader
  return (
    <div
      role="status"
      className={cn('inline-flex items-center justify-center', className)}
      {...props}
    >
      <CreatorStoreLogoMark
        size={size || 'md'}
        badge={badge}
        badgeBg={badgeBg}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
      />
      <span className="sr-only">{ariaLabel}</span>
    </div>
  )
}
