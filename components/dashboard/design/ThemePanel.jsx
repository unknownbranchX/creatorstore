'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Shuffle,
  PenTool,
  Check,
  Zap,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import {
  STOREFRONT_GALLERY_THEMES,
  getGalleryThemeId,
  gallerySwatchStyle,
  themePatchFromGallery,
} from '@/lib/storefront-themes'
import { getThemeArtwork } from '@/lib/storefront-theme-artwork'

import PanelHeader from './PanelHeader'

/**
 * Linktree-inspired Themes Customization Panel (#theme)
 * Standardized with consistent PanelHeader (black Save button #000000; legacy #8B3DFF)
 */
export default function ThemePanel({
  theme,
  onChange,
  onBack,
  onSave,
  onCancel,
  onReset,
  hasUnsavedChanges = false,
  isSaving = false,
}) {
  const [activeTab, setActiveTab] = useState('customizable')
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

  const selectedId = getGalleryThemeId(theme)

  // Shuffle handler picks a random curated theme
  const handleShuffle = () => {
    const nonCustomThemes = STOREFRONT_GALLERY_THEMES.filter((t) => t.id !== 'custom' && t.id !== selectedId)
    if (nonCustomThemes.length === 0) return
    const randomTheme = nonCustomThemes[Math.floor(Math.random() * nonCustomThemes.length)]
    applyChange(themePatchFromGallery(randomTheme, theme))
  }

  // Split into Customizable and Curated
  const curatedThemes = STOREFRONT_GALLERY_THEMES.filter((t) => t.id !== 'custom')

  return (
    <div className="bg-white rounded-[24px] border border-[#E5E5E3] p-5 sm:p-6 shadow-xs space-y-6">
      {/* TOP HEADER: Standardized PanelHeader with Shuffle + Undo/Redo + Cancel/Save */}
      <PanelHeader
        title="Theme"
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
              aria-label="Undo theme change"
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
              aria-label="Redo theme change"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {/* Shuffle button matching Linktree Screenshot 2 */}
        <button
          type="button"
          onClick={handleShuffle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E5E3] text-xs font-bold text-[#1F1F1F] bg-white hover:bg-[#F5F5F3] transition-colors shadow-2xs cursor-pointer select-none ml-1"
          title="Randomize theme"
        >
          <Shuffle className="h-3.5 w-3.5 text-[#1F1F1F]" />
          <span>Shuffle</span>
        </button>
      </PanelHeader>

      {/* TABS: Customizable | Curated (Matches Linktree Screenshot 2) */}
      <div className="flex items-center gap-6 border-b border-[#F0EFEB]">
        <button
          type="button"
          onClick={() => setActiveTab('customizable')}
          className={`pb-2.5 text-xs sm:text-sm font-bold transition-colors relative cursor-pointer ${
            activeTab === 'customizable' ? 'text-[#1F1F1F]' : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
          }`}
        >
          Customizable
          {activeTab === 'customizable' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1F1F1F] rounded-full" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('curated')}
          className={`pb-2.5 text-xs sm:text-sm font-bold transition-colors relative cursor-pointer ${
            activeTab === 'curated' ? 'text-[#1F1F1F]' : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
          }`}
        >
          Curated
          {activeTab === 'curated' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1F1F1F] rounded-full" />
          )}
        </button>
      </div>

      {/* THEME PREVIEWS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* 'Custom' theme card in Customizable tab */}
        {activeTab === 'customizable' && (
          <button
            type="button"
            onClick={() => applyChange({ galleryThemeId: 'custom' })}
            className="flex flex-col gap-2 text-left cursor-pointer group select-none"
          >
            <div
              className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border transition-all flex flex-col items-center justify-center p-3 bg-white ${
                selectedId === 'custom'
                  ? 'border-2 border-[#1F1F1F] ring-1 ring-[#1F1F1F] shadow-xs'
                  : 'border-[#E5E5E3] hover:border-[#A8A8A4]'
              }`}
            >
              <div className="h-10 w-10 rounded-full bg-[#F5F5F3] group-hover:bg-[#EAEAE8] flex items-center justify-center transition-colors">
                <PenTool className="h-5 w-5 text-[#1F1F1F]" />
              </div>

              {selectedId === 'custom' && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
              )}
            </div>
            <span className={`text-xs ${selectedId === 'custom' ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#6F6F6B]'}`}>
              Custom
            </span>
          </button>
        )}

        {/* Gallery theme cards */}
        {curatedThemes.map((preset) => {
          const selected = selectedId === preset.id
          const swatch = gallerySwatchStyle(preset)
          const artwork = getThemeArtwork(preset.id)

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyChange(themePatchFromGallery(preset, theme))}
              className="flex flex-col gap-2 text-left cursor-pointer group select-none"
            >
              <div
                className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border transition-all flex flex-col justify-between p-3.5 ${
                  selected
                    ? 'border-2 border-[#1F1F1F] ring-1 ring-[#1F1F1F] shadow-xs'
                    : 'border-[#E5E5E3] hover:border-[#A8A8A4]'
                }`}
                style={swatch}
              >
                {/* Photographic Header Artwork Background (Sweat, Nourish, Vox, Encore, Tress, Bliss) */}
                {artwork?.svgDataUri ? (
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <img
                      src={artwork.svgDataUri}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                ) : null}

                {/* Font sample 'Aa' */}
                <span
                  className="relative z-10 text-2xl font-black leading-none tracking-tight drop-shadow-xs"
                  style={{
                    color: preset.colors?.title || preset.colors?.pageText || preset.text?.pageTextColor || '#FFFFFF',
                    fontFamily: preset.text?.pageFont || 'sans-serif',
                  }}
                >
                  Aa
                </span>

                {/* Pill button preview */}
                <span
                  className="relative z-10 h-3.5 w-12 rounded-full shrink-0 border shadow-2xs"
                  style={{
                    background: preset.button?.color || preset.colors?.buttons || '#FFFFFF',
                    borderColor: preset.button?.borderColor && preset.button?.borderColor !== 'transparent'
                      ? preset.button.borderColor
                      : (preset.colors?.buttonBorder || 'transparent'),
                  }}
                />

                {/* Selected check badge */}
                {selected && (
                  <div className="absolute top-2 right-2 z-20 h-5 w-5 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                )}

                {/* Pro badge if pro */}
                {preset.pro && !selected && (
                  <span className="absolute top-2 right-2 z-20 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-xs">
                    <Zap className="h-3 w-3 fill-current" />
                  </span>
                )}
              </div>
              <span className={`text-xs ${selected ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#6F6F6B]'}`}>
                {preset.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* RESET TO DEFAULTS */}
      {onReset && (
        <div className="pt-2 flex justify-end border-t border-[#F0EFEB]">
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset theme to defaults</span>
          </button>
        </div>
      )}
    </div>
  )
}
