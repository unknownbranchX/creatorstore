'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Droplets,
  Grid3x3,
  Image as ImageIcon,
  Square,
  Blend,
  Video,
  Upload,
  Zap,
  Loader2,
  RotateCcw,
  Check,
} from 'lucide-react'
import ColorField from './ColorField'
import {
  WALLPAPER_PATTERNS,
  patternPreviewStyle,
  parseGradientAngle,
  wallpaperStyleFromTheme,
} from '@/lib/storefront-themes'
import { Slider } from '@/components/ui/slider'
import PanelHeader from './PanelHeader'

/**
 * Linktree-inspired Wallpaper Customization Panel (#wallpaper)
 * Matches Linktree Screenshot 3 with Wallpaper style cards (Fill, Gradient, Blur, Pattern, Image, Video),
 * interactive color pills, pattern selectors, and full top action controls.
 */
export default function WallpaperPanel({
  theme,
  onChange,
  onBack,
  onSave,
  onCancel,
  onReset,
  onUpgrade,
  onUploadImage,
  onUploadVideo,
  hasUnsavedChanges = false,
  isSaving = false,
}) {
  const [history, setHistory] = useState([theme])
  const [historyIndex, setHistoryIndex] = useState(0)

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const applyChange = (patch) => {
    const updated = { ...theme, ...patch }
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(updated)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    onChange(patch)
  }

  const handleUndo = () => {
    if (!canUndo) return
    const prevTheme = history[historyIndex - 1]
    setHistoryIndex(historyIndex - 1)
    onChange(prevTheme)
  }

  const handleRedo = () => {
    if (!canRedo) return
    const nextTheme = history[historyIndex + 1]
    setHistoryIndex(historyIndex + 1)
    onChange(nextTheme)
  }

  const style = wallpaperStyleFromTheme(theme)
  const fillColor = theme.background || '#000000'
  const angle = parseGradientAngle(theme.gradientDirection)

  const STYLES = [
    { id: 'fill', label: 'Fill', Icon: Square, gated: false },
    { id: 'gradient', label: 'Gradient', Icon: Blend, gated: false },
    { id: 'blur', label: 'Blur', Icon: Droplets, gated: false },
    { id: 'pattern', label: 'Pattern', Icon: Grid3x3, gated: false },
    { id: 'image', label: 'Image', Icon: ImageIcon, gated: true },
    { id: 'video', label: 'Video', Icon: Video, gated: true },
  ]

  function selectStyle(next) {
    if (STYLES.find((s) => s.id === next)?.gated && wallpaperStyleFromTheme(theme) !== next) {
      onUpgrade?.()
    }
    if (next === 'fill') applyChange({ bgType: 'solid' })
    else if (next === 'gradient') applyChange({ bgType: 'gradient' })
    else applyChange({ bgType: next })
  }

  function selectPattern(id, pro) {
    if (pro && theme.wallpaperPattern !== id) onUpgrade?.()
    applyChange({ bgType: 'pattern', wallpaperPattern: id })
  }

  return (
    <div className="bg-white rounded-[24px] border border-[#E5E5E3] p-5 sm:p-6 shadow-xs space-y-6">
      {/* TOP HEADER: Standardized PanelHeader with Undo/Redo + Cancel/Save (black Save #000000; legacy #8B3DFF) */}
      <PanelHeader
        title="Wallpaper"
        onBack={onBack}
        onSave={onSave}
        onCancel={onCancel}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
        extraActions={
          <div className="flex items-center gap-1 mr-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                canUndo ? 'text-[#1F1F1F] hover:bg-[#F5F5F3]' : 'text-[#CCCCCC] cursor-not-allowed'
              }`}
              title="Undo"
              aria-label="Undo wallpaper change"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                canRedo ? 'text-[#1F1F1F] hover:bg-[#F5F5F3]' : 'text-[#CCCCCC] cursor-not-allowed'
              }`}
              title="Redo"
              aria-label="Redo wallpaper change"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* 1. WALLPAPER STYLE SELECTOR CARDS (Matches Linktree Screenshot 3) */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Wallpaper style</h4>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {STYLES.map(({ id, label, Icon, gated }) => {
            const selected = style === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectStyle(id)}
                className="flex flex-col items-center gap-1.5 cursor-pointer group select-none"
              >
                <div
                  className={`relative h-14 sm:h-16 w-full rounded-2xl border transition-all flex flex-col items-center justify-center p-1.5 overflow-hidden ${
                    selected
                      ? 'border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-xs'
                      : 'border-[#E5E5E3] bg-[#FAFAFA] hover:border-[#A8A8A4] hover:bg-white'
                  }`}
                >
                  {/* Visual preview representation inside card */}
                  {id === 'fill' ? (
                    <div
                      className="h-full w-full rounded-xl border border-black/10"
                      style={{ backgroundColor: fillColor }}
                    />
                  ) : id === 'gradient' ? (
                    <div
                      className="h-full w-full rounded-xl border border-black/10"
                      style={{
                        background: `linear-gradient(${angle}deg, ${theme.gradientStart || fillColor}, ${theme.gradientEnd || '#121212'})`,
                      }}
                    />
                  ) : id === 'blur' ? (
                    <div
                      className="h-full w-full rounded-xl border border-black/10 opacity-75 backdrop-blur-md"
                      style={{ backgroundColor: fillColor }}
                    />
                  ) : id === 'pattern' ? (
                    <div
                      className="h-full w-full rounded-xl border border-black/10"
                      style={patternPreviewStyle(theme.wallpaperPattern || 'grid', fillColor)}
                    />
                  ) : (
                    <Icon className="h-5 w-5 text-[#6F6F6B] group-hover:text-[#1F1F1F] transition-colors" />
                  )}

                  {gated && (
                    <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                      <Zap className="h-2.5 w-2.5 fill-current" />
                    </span>
                  )}
                </div>
                <span className={`text-xs ${selected ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#6F6F6B]'}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. BACKGROUND COLOR PILL (for fill, blur, pattern) */}
      {(style === 'fill' || style === 'blur' || style === 'pattern') && (
        <div className="pt-2 border-t border-[#F0EFEB]">
          <ColorField
            label="Background color"
            value={theme.background}
            fallback="#CCD7A3"
            onChange={(v) => applyChange({ background: v })}
            showBorder={false}
          />
        </div>
      )}

      {/* 3. PATTERN SELECTOR (Matches Linktree Screenshot 3) */}
      {style === 'pattern' && (
        <div className="space-y-2.5 pt-2 border-t border-[#F0EFEB]">
          <h4 className="text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Pattern</h4>
          <div className="grid grid-cols-4 gap-2.5">
            {WALLPAPER_PATTERNS.map((p) => {
              const selected = (theme.wallpaperPattern || 'grid') === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPattern(p.id, p.pro)}
                  className="flex flex-col items-center gap-1.5 cursor-pointer group select-none"
                >
                  <div
                    className={`relative h-14 sm:h-16 w-full rounded-2xl border transition-all overflow-hidden ${
                      selected
                        ? 'border-2 border-[#1F1F1F] ring-1 ring-[#1F1F1F] shadow-xs'
                        : 'border-[#E5E5E3] hover:border-[#A8A8A4]'
                    }`}
                    style={patternPreviewStyle(p.id, fillColor)}
                  >
                    {p.pro && (
                      <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                        <Zap className="h-2.5 w-2.5 fill-current" />
                      </span>
                    )}
                    {selected && (
                      <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <span className={`text-xs ${selected ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#6F6F6B]'}`}>
                    {p.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 4. GRADIENT SETTINGS */}
      {style === 'gradient' && (
        <div className="space-y-4 pt-2 border-t border-[#F0EFEB]">
          <ColorField
            label="Start color"
            value={theme.gradientStart || theme.background}
            fallback="#000000"
            onChange={(v) => applyChange({ gradientStart: v, gradientStops: null })}
            showBorder={false}
          />
          <ColorField
            label="End color"
            value={theme.gradientEnd}
            fallback="#121212"
            onChange={(v) => applyChange({ gradientEnd: v, gradientStops: null })}
            showBorder={false}
          />
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">Angle</span>
              <span className="text-xs font-mono font-bold text-[#1F1F1F]">{angle}°</span>
            </div>
            <Slider
              min={0}
              max={360}
              step={1}
              value={[angle]}
              onValueChange={([v]) => applyChange({ gradientDirection: `${v}deg`, gradientStops: null })}
            />
          </div>
        </div>
      )}

      {/* 5. IMAGE UPLOAD */}
      {style === 'image' && (
        <div className="pt-2 border-t border-[#F0EFEB]">
          <MediaUpload
            kind="image"
            src={theme.backgroundImage}
            accept="image/*"
            onUpload={onUploadImage}
            onRemove={() => applyChange({ backgroundImage: '', bgType: 'solid' })}
          />
        </div>
      )}

      {/* 6. VIDEO UPLOAD */}
      {style === 'video' && (
        <div className="pt-2 border-t border-[#F0EFEB]">
          <MediaUpload
            kind="video"
            src={theme.backgroundVideo}
            accept="video/mp4,video/webm"
            onUpload={onUploadVideo}
            onRemove={() => applyChange({ backgroundVideo: '', bgType: 'solid' })}
          />
        </div>
      )}

      {/* RESET TO DEFAULTS */}
      {onReset && (
        <div className="pt-2 flex justify-end border-t border-[#F0EFEB]">
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset wallpaper to defaults</span>
          </button>
        </div>
      )}
    </div>
  )
}

function MediaUpload({ kind, src, accept, onUpload, onRemove }) {
  return src ? (
    <div className="space-y-3">
      <div className="relative h-40 w-full rounded-2xl overflow-hidden border border-[#E5E5E3] bg-[#FAFAFA] shadow-xs">
        {kind === 'video' ? (
          <video src={src} className="h-full w-full object-cover" muted />
        ) : (
          <img src={src} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex gap-2">
        <label className="flex-1 h-9 rounded-full bg-white hover:bg-[#F5F5F3] border border-[#E5E5E3] text-xs font-bold text-[#1F1F1F] flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs">
          <Upload className="h-3.5 w-3.5" /> Replace
          <input type="file" accept={accept} onChange={onUpload} className="hidden" />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="px-4 h-9 rounded-full text-red-600 hover:bg-red-50 text-xs font-bold border border-red-200 cursor-pointer transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  ) : (
    <label className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-[#E5E5E3] hover:border-[#1F1F1F] bg-[#FAFAFA] hover:bg-white cursor-pointer text-center gap-2.5 transition-colors group">
      <div className="h-10 w-10 rounded-full bg-[#F0EFEB] group-hover:bg-[#E5E5E3] flex items-center justify-center transition-colors">
        <Upload className="h-5 w-5 text-[#1F1F1F]" />
      </div>
      <div className="space-y-0.5">
        <span className="text-xs font-bold text-[#1F1F1F] block">Upload {kind}</span>
        <span className="text-[11px] text-[#6F6F6B] block">JPG, PNG, WebP or MP4 up to 20MB</span>
      </div>
      <input type="file" accept={accept} onChange={onUpload} className="hidden" />
    </label>
  )
}
