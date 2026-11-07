'use client'

import { useState, useMemo } from 'react'
import {
  ArrowLeft,
  Undo2,
  Redo2,
  RotateCcw,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  Palette,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react'
import ColorField from './ColorField'
import {
  generateAdaptivePalette,
  THEME_PALETTE_PRESETS,
  validateContrast,
} from '@/lib/adaptiveTheme'
import PanelHeader from './PanelHeader'

/**
 * Enhanced Colors Customization Panel with Adaptive Theme Color System.
 * 
 * Supports 3 Modes:
 * 1. Adaptive (default): Automatically coordinates card surfaces, text, and CTAs
 *    from the selected button color and page background.
 * 2. Manual: Allows granular customization of every color with live WCAG contrast checking.
 * 3. Presets: Curated accessible palettes (Light, Dark, and Accent themes).
 */
export default function ColorsPanel({
  theme = {},
  onChange,
  onBack,
  onSave,
  onCancel,
  onReset,
  hasUnsavedChanges = false,
  isSaving = false,
}) {
  const [history, setHistory] = useState([theme])
  const [historyIndex, setHistoryIndex] = useState(0)

  // Determine current active mode (defaults to 'adaptive' if not set)
  const currentMode = theme.themeMode || (theme.cardBg ? 'manual' : 'adaptive')

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

  // Generate live palette for inspection and contrast feedback
  const livePalette = useMemo(() => {
    return generateAdaptivePalette({
      buttonColor: theme.buttonColor || '#4D7CFF',
      pageBg: theme.background || '#000000',
      themeMode: currentMode,
      buttonStyle: theme.buttonStyle || 'filled',
      manualOverrides: {
        cardBg: theme.cardBg,
        cardBgOverride: theme.cardBgOverride,
        cardTextColor: theme.cardTextColor,
        textColor: theme.textColor,
        titleColor: theme.titleColor,
        buttonTextColor: theme.buttonTextColor,
      },
    })
  }, [
    theme.buttonColor,
    theme.background,
    currentMode,
    theme.buttonStyle,
    theme.cardBg,
    theme.cardBgOverride,
    theme.cardTextColor,
    theme.textColor,
    theme.titleColor,
    theme.buttonTextColor,
  ])

  // Contrast validations for manual mode
  const manualCardContrast = useMemo(() => {
    if (currentMode !== 'manual') return null
    const cardSurface = theme.cardBg || livePalette.productCard.background
    const textColor = theme.textColor || livePalette.productCard.text
    return validateContrast({
      foreground: textColor,
      background: cardSurface,
      minContrast: 4.5,
      label: 'Card Text on Card Surface',
    })
  }, [currentMode, theme.cardBg, theme.textColor, livePalette])

  const manualTileContrast = useMemo(() => {
    if (currentMode !== 'manual') return null
    const btnColor = theme.buttonColor || '#4D7CFF'
    const btnTextColor = theme.buttonTextColor || livePalette.tile.text
    return validateContrast({
      foreground: btnTextColor,
      background: btnColor,
      minContrast: 4.5,
      label: 'Button Text on Button',
    })
  }, [currentMode, theme.buttonColor, theme.buttonTextColor, livePalette])

  // Manual Color Rows
  const manualColorRows = [
    { key: 'background', label: 'Background', fallback: '#000000' },
    { key: 'buttonColor', label: 'Buttons', fallback: '#4D7CFF' },
    { key: 'buttonTextColor', label: 'Button text', fallback: '#FFFFFF' },
    { key: 'textColor', label: 'Page text', fallback: '#FFFFFF' },
    { key: 'titleColor', label: 'Title', fallback: theme.textColor || '#FFFFFF' },
    { key: 'cardBg', label: 'Card surface', fallback: livePalette.productCard.background },
    { key: 'buttonShadowColor', label: 'Button shadows', fallback: '#000000' },
  ]

  return (
    <div className="bg-white rounded-[24px] border border-[#E5E5E3] p-5 sm:p-6 shadow-xs space-y-5">
      {/* TOP HEADER: Standardized PanelHeader with Undo/Redo + Cancel/Save (black Save #000000; legacy #8B3DFF) */}
      <PanelHeader
        title="Colors"
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
              aria-label="Undo color change"
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
              aria-label="Redo color change"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* THEME MODE SEGMENTED CONTROL: Adaptive | Manual | Presets */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-[#6F6F6B]">Theme Color Mode</label>
        <div className="grid grid-cols-3 gap-1.5 bg-[#F5F5F3] p-1 rounded-xl border border-[#E5E5E3]">
          <button
            type="button"
            onClick={() => applyChange({ themeMode: 'adaptive' })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              currentMode === 'adaptive'
                ? 'bg-white text-[#1F1F1F] shadow-xs'
                : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Adaptive</span>
          </button>
          <button
            type="button"
            onClick={() => applyChange({ themeMode: 'manual' })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              currentMode === 'manual'
                ? 'bg-white text-[#1F1F1F] shadow-xs'
                : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Manual</span>
          </button>
          <button
            type="button"
            onClick={() => applyChange({ themeMode: 'preset' })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              currentMode === 'preset'
                ? 'bg-white text-[#1F1F1F] shadow-xs'
                : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            <span>Presets</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. ADAPTIVE MODE UI                                            */}
      {/* ============================================================== */}
      {currentMode === 'adaptive' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155]">
            <Sparkles className="h-4 w-4 shrink-0 text-[#8B3DFF] mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <p className="font-semibold text-[#0F172A]">Adaptive Color Coordination</p>
              <p className="text-[11px] text-[#64748B]">
                Changing your <strong>Button color</strong> automatically generates cohesive card surfaces, text, and high-contrast CTA buttons.
              </p>
            </div>
          </div>

          <div className="space-y-0.5 divide-y divide-[#F0EFEB]">
            {/* Primary Driving Button Color */}
            <ColorField
              label="Button color (Driving)"
              value={theme.buttonColor}
              fallback="#4D7CFF"
              onChange={(v) => applyChange({ buttonColor: v })}
              showBorder={false}
            />

            {/* Page Background */}
            <ColorField
              label="Background"
              value={theme.background}
              fallback="#000000"
              onChange={(v) => applyChange({ background: v })}
              showBorder={false}
            />

            {/* Coordinated Card Surface with Override Support */}
            <div className="py-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">Card surface</span>
                  {theme.cardBgOverride ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      Custom override
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-[#8B3DFF] border border-purple-200">
                      Auto-adapted
                    </span>
                  )}
                </div>

                {theme.cardBgOverride && (
                  <button
                    type="button"
                    onClick={() => applyChange({ cardBg: undefined, cardBgOverride: false })}
                    className="text-[11px] font-semibold text-[#8B3DFF] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset to auto</span>
                  </button>
                )}
              </div>

              <ColorField
                value={theme.cardBg || livePalette.productCard.background}
                fallback={livePalette.productCard.background}
                onChange={(v) => applyChange({ cardBg: v, cardBgOverride: true })}
                showBorder={false}
              />
            </div>

            {/* Read-Only Auto-Derived Values Preview */}
            <div className="pt-3 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6F6F6B]">Auto-generated contrast preview</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl border border-[#E5E5E3] bg-[#FAFAFA] space-y-1">
                  <span className="text-[11px] font-medium text-[#6F6F6B]">Tile Text</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs" style={{ color: livePalette.tile.text }}>
                      {livePalette.tile.text}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {Math.round(livePalette.contrast.tileContrast * 10) / 10}:1
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-[#E5E5E3] bg-[#FAFAFA] space-y-1">
                  <span className="text-[11px] font-medium text-[#6F6F6B]">Card Text</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs" style={{ color: livePalette.productCard.text }}>
                      {livePalette.productCard.text}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {Math.round(livePalette.contrast.cardTextContrast * 10) / 10}:1
                    </span>
                  </div>
                </div>
              </div>

              {/* Status info */}
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium pt-1">
                <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                <span>All tiles, cards, and CTA buttons meet WCAG AA/AAA standards</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. MANUAL MODE UI                                              */}
      {/* ============================================================== */}
      {currentMode === 'manual' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900">
            <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Manual Mode:</strong> You can explicitly configure each color. If a combination has low contrast, CreatorStore will render a safe fallback on the storefront to keep text readable.
            </p>
          </div>

          {/* Warnings for low contrast */}
          {(manualCardContrast?.warning || manualTileContrast?.warning) && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-1 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>Contrast Warning</span>
              </div>
              {manualCardContrast?.warning && <p>{manualCardContrast.warning}</p>}
              {manualTileContrast?.warning && <p>{manualTileContrast.warning}</p>}
            </div>
          )}

          <div className="space-y-0.5 divide-y divide-[#F0EFEB]">
            {manualColorRows.map((row) => (
              <ColorField
                key={row.key}
                label={row.label}
                value={theme[row.key]}
                fallback={row.fallback}
                onChange={(v) => applyChange({ [row.key]: v })}
                showBorder={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. PRESETS MODE UI                                             */}
      {/* ============================================================== */}
      {currentMode === 'preset' && (
        <div className="space-y-4">
          <p className="text-xs text-[#6F6F6B]">
            Select an expertly curated color palette with guaranteed WCAG contrast.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {THEME_PALETTE_PRESETS.map((preset) => {
              const isSelected =
                theme.background === preset.pageBg &&
                theme.buttonColor === preset.buttonColor
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    applyChange({
                      themeMode: 'preset',
                      background: preset.pageBg,
                      buttonColor: preset.buttonColor,
                      buttonTextColor: preset.buttonTextColor,
                      cardBg: preset.cardBg,
                      textColor: preset.textColor,
                      titleColor: preset.textColor,
                    })
                  }
                  className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer group hover:scale-[1.01] ${
                    isSelected
                      ? 'border-2 border-[#8B3DFF] bg-[#FBF9FF] shadow-xs'
                      : 'border-[#E5E5E3] bg-white hover:border-[#1F1F1F]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-[#8B3DFF] text-white flex items-center justify-center shadow-xs">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  )}

                  {/* Swatch row */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-5 w-5 rounded-md border border-black/15 shadow-2xs" style={{ backgroundColor: preset.pageBg }} title="Page Background" />
                    <div className="h-5 w-5 rounded-md border border-black/15 shadow-2xs" style={{ backgroundColor: preset.buttonColor }} title="Button Color" />
                    <div className="h-5 w-5 rounded-md border border-black/15 shadow-2xs" style={{ backgroundColor: preset.cardBg }} title="Card Surface" />
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-[#1F1F1F]">{preset.name}</p>
                    <p className="text-[10px] text-[#6F6F6B] line-clamp-1">{preset.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
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
            <span>Reset colors to defaults</span>
          </button>
        </div>
      )}
    </div>
  )
}
