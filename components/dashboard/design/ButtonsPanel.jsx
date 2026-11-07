'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ArrowLeft, Undo2, Redo2, RotateCcw } from 'lucide-react'
import PanelHeader from './PanelHeader'
import {
  ROUNDNESS_PRESETS,
  roundnessKeyFromTheme,
  shadowKeyFromTheme,
  styleKeyFromTheme,
} from '@/lib/storefrontLayout'

/**
 * Available button styles in CreatorStore
 */
const BUTTON_STYLES = [
  { key: 'filled', label: 'Solid', description: 'Filled background' },
  { key: 'outline', label: 'Outline', description: 'Transparent outline' },
  { key: 'soft', label: 'Soft', description: 'Subtle neutral surface' },
]

/**
 * Button shadow presets
 */
const SHADOW_PRESETS = [
  { key: 'none', label: 'None' },
  { key: 'soft', label: 'Soft' },
  { key: 'strong', label: 'Strong' },
  { key: 'hard', label: 'Hard' },
]

/**
 * SVG corner roundness indicators matching Linktree reference
 */
function CornerRoundnessIcon({ type }) {
  if (type === 'sharp') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="stroke-current">
        <path d="M 4 18 V 4 H 18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="miter" />
      </svg>
    )
  }
  if (type === 'medium') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="stroke-current">
        <path d="M 4 18 V 10 C 4 6.69 6.69 4 10 4 H 18" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'soft') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="stroke-current">
        <path d="M 4 18 V 12 C 4 7.58 7.58 4 12 4 H 18" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  // Full / pill
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="stroke-current">
      <path d="M 4 18 C 4 10.27 10.27 4 18 4" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Accessible Hex color picker with double-outlined swatch and validated hex text input
 */
function HexColorPickerField({ label, value, fallback = '#000000', onChange }) {
  const [localText, setLocalText] = useState(value || fallback)

  useEffect(() => {
    setLocalText(value || fallback)
  }, [value, fallback])

  const isValidHex = (hex) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)
  const currentHex = isValidHex(value) ? value : fallback

  const handleTextChange = (e) => {
    let raw = e.target.value.trim()
    if (!raw.startsWith('#') && raw.length > 0) {
      raw = `#${raw}`
    }
    setLocalText(raw)
    if (isValidHex(raw)) {
      onChange(raw)
    }
  }

  const handleBlur = () => {
    if (!isValidHex(localText)) {
      setLocalText(currentHex)
    }
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F0EFEB] last:border-b-0">
      <label className="text-xs sm:text-sm font-semibold text-[#1F1F1F] tracking-tight">{label}</label>
      <div className="flex items-center gap-2">
        <label
          className="relative h-9 w-9 shrink-0 rounded-lg border border-black/20 ring-1 ring-inset ring-black/10 shadow-xs cursor-pointer overflow-hidden transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: currentHex }}
          title={`Click to pick ${label}`}
        >
          <input
            type="color"
            value={isValidHex(currentHex) && currentHex.length === 7 ? currentHex : '#000000'}
            onChange={(e) => {
              const hexVal = e.target.value.toUpperCase()
              setLocalText(hexVal)
              onChange(hexVal)
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            aria-label={`Choose ${label}`}
          />
        </label>
        <input
          type="text"
          value={localText}
          placeholder={fallback}
          onChange={handleTextChange}
          onBlur={handleBlur}
          maxLength={7}
          className="h-9 w-24 px-2.5 text-xs font-mono font-bold uppercase tracking-wider text-[#1F1F1F] bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg focus:bg-white focus:border-[#1F1F1F] focus:ring-1 focus:ring-[#1F1F1F] outline-none transition-colors"
          aria-label={`${label} hex code`}
        />
      </div>
    </div>
  )
}

/**
 * ButtonsPanel component for Storefront Appearance customization
 * Redesigned to match the Linktree Buttons Customization UI/UX reference.
 */
export default function ButtonsPanel({
  theme = {},
  activePreset = {},
  onChange,
  onBack,
  onSave,
  onCancel,
  onReset,
  hasUnsavedChanges = false,
  isSaving = false,
}) {
  const currentStyleKey = styleKeyFromTheme(theme)
  const currentRoundnessKey = roundnessKeyFromTheme(theme)
  const currentShadowKey = shadowKeyFromTheme(theme)

  // Default color values: Black button background, white text, black shadow
  const defaultButtonColor = theme.buttonColor || activePreset?.colors?.buttonColor || activePreset?.colors?.primaryColor || '#000000'
  const defaultTextColor = theme.buttonTextColor || activePreset?.colors?.buttonText || '#FFFFFF'
  const defaultShadowColor = theme.buttonShadowColor || activePreset?.colors?.buttonShadows || '#000000'

  // Undo / Redo history stack for buttons settings
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isInternalHistoryStep = useRef(false)

  // Snapshot current button parameters
  const currentButtonSnapshot = useCallback(() => ({
    buttonStyle: theme.buttonStyle || 'filled',
    buttonShape: theme.buttonShape || 'rounded',
    buttonRadius: theme.buttonRadius !== undefined ? theme.buttonRadius : 8,
    buttonShadow: theme.buttonShadow || 'soft',
    buttonColor: theme.buttonColor || defaultButtonColor,
    buttonTextColor: theme.buttonTextColor || defaultTextColor,
    buttonShadowColor: theme.buttonShadowColor || defaultShadowColor,
  }), [theme, defaultButtonColor, defaultTextColor, defaultShadowColor])

  // Initialize history with initial state
  useEffect(() => {
    if (history.length === 0) {
      const snap = currentButtonSnapshot()
      setHistory([snap])
      setHistoryIndex(0)
    }
  }, [history.length, currentButtonSnapshot])

  // Push new state to history when changed by user
  const applyChange = useCallback((patch) => {
    if (!isInternalHistoryStep.current) {
      const newSnap = { ...currentButtonSnapshot(), ...patch }
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1)
        return [...sliced, newSnap]
      })
      setHistoryIndex((prev) => prev + 1)
    }
    onChange(patch)
  }, [currentButtonSnapshot, historyIndex, onChange])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const handleUndo = () => {
    if (!canUndo) return
    isInternalHistoryStep.current = true
    const targetSnap = history[historyIndex - 1]
    setHistoryIndex((prev) => prev - 1)
    onChange(targetSnap)
    setTimeout(() => {
      isInternalHistoryStep.current = false
    }, 50)
  }

  const handleRedo = () => {
    if (!canRedo) return
    isInternalHistoryStep.current = true
    const targetSnap = history[historyIndex + 1]
    setHistoryIndex((prev) => prev + 1)
    onChange(targetSnap)
    setTimeout(() => {
      isInternalHistoryStep.current = false
    }, 50)
  }

  const handleResetToDefaults = () => {
    if (onReset) {
      onReset()
    } else {
      applyChange({
        buttonStyle: 'filled',
        buttonRadius: 8,
        buttonShape: 'rounded',
        buttonShadow: 'soft',
        buttonColor: '#000000',
        buttonTextColor: '#FFFFFF',
        buttonShadowColor: '#000000',
      })
    }
  }

  return (
    <div className="bg-white border border-[#E5E5E3] rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
      {/* HEADER & EDITING ACTIONS (Standardized PanelHeader) */}
      <PanelHeader
        title="Buttons"
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
              aria-label="Undo button customization"
              title="Undo"
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
                canUndo
                  ? 'text-[#1F1F1F] hover:bg-[#F5F5F3] cursor-pointer active:scale-90'
                  : 'text-[#C5C5C0] cursor-not-allowed opacity-40'
              }`}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="Redo button customization"
              title="Redo"
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
                canRedo
                  ? 'text-[#1F1F1F] hover:bg-[#F5F5F3] cursor-pointer active:scale-90'
                  : 'text-[#C5C5C0] cursor-not-allowed opacity-40'
              }`}
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* 1. BUTTON STYLE */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Button style</h4>
          <span className="text-[11px] text-[#6F6F6B]">Surface treatment</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {BUTTON_STYLES.map((opt) => {
            const selected = currentStyleKey === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => applyChange({ buttonStyle: opt.key })}
                className={`relative flex flex-col items-center justify-between p-3 h-[90px] rounded-xl border text-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F1F1F] focus-visible:ring-offset-2 select-none ${
                  selected
                    ? 'border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-xs'
                    : 'border-[#E5E5E3] bg-[#FAFAFA] hover:border-[#A8A8A4] hover:bg-white'
                }`}
              >
                {selected && (
                  <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </div>
                )}
                {/* Miniature Button Preview */}
                <div className="w-full h-10 rounded-lg bg-[#E0E0DE] flex items-center justify-center p-1.5">
                  {opt.key === 'filled' ? (
                    <div className="h-5 w-full max-w-[70px] rounded-full bg-white shadow-xs" />
                  ) : opt.key === 'outline' ? (
                    <div className="h-5 w-full max-w-[70px] rounded-full border-2 border-white bg-transparent" />
                  ) : (
                    <div className="h-5 w-full max-w-[70px] rounded-full border border-white/50 bg-white/60" />
                  )}
                </div>
                <span className={`text-xs ${selected ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#444444]'}`}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. CORNER ROUNDNESS */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Corner roundness</h4>
          <span className="text-[11px] text-[#6F6F6B]">Border radius</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {ROUNDNESS_PRESETS.map((opt) => {
            const selected = currentRoundnessKey === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => applyChange({ buttonShape: opt.shape, buttonRadius: opt.radius })}
                className={`relative flex flex-col items-center justify-center p-2.5 h-[68px] sm:h-[72px] rounded-xl border text-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F1F1F] focus-visible:ring-offset-2 select-none ${
                  selected
                    ? 'border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-xs'
                    : 'border-[#E5E5E3] bg-[#FAFAFA] hover:border-[#A8A8A4] hover:bg-white'
                }`}
                aria-label={`Corner roundness: ${opt.label}`}
                title={opt.label}
              >
                {selected && (
                  <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                    <Check className="h-2 w-2 stroke-[3]" />
                  </div>
                )}
                <div className={`transition-transform ${selected ? 'text-[#1F1F1F] scale-105' : 'text-[#6F6F6B]'}`}>
                  <CornerRoundnessIcon type={opt.key} />
                </div>
                <span className={`text-[11px] mt-1 ${selected ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#444444]'}`}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. BUTTON SHADOW */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[#1F1F1F] uppercase tracking-wider">Button shadow</h4>
          <span className="text-[11px] text-[#6F6F6B]">Elevation depth</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
          {SHADOW_PRESETS.map((opt) => {
            const selected = currentShadowKey === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => applyChange({ buttonShadow: opt.key })}
                className={`relative flex items-center justify-center px-2 py-2.5 rounded-full border text-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F1F1F] focus-visible:ring-offset-2 select-none ${
                  selected
                    ? 'border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-xs'
                    : 'border-[#E5E5E3] bg-[#FAFAFA] hover:border-[#A8A8A4] hover:bg-white'
                }`}
              >
                {selected && (
                  <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-[#1F1F1F] text-white flex items-center justify-center shadow-xs">
                    <Check className="h-2 w-2 stroke-[3]" />
                  </div>
                )}
                <span className={`text-xs ${selected ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#444444]'}`}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 4. BUTTON COLORS */}
      <div className="pt-2 border-t border-[#F0EFEB] space-y-1">
        <HexColorPickerField
          label="Button color"
          value={theme.buttonColor || defaultButtonColor}
          fallback={defaultButtonColor}
          onChange={(val) => applyChange({ buttonColor: val })}
        />
        <HexColorPickerField
          label="Button text color"
          value={theme.buttonTextColor || defaultTextColor}
          fallback={defaultTextColor}
          onChange={(val) => applyChange({ buttonTextColor: val })}
        />
        <HexColorPickerField
          label="Button shadow color"
          value={theme.buttonShadowColor || defaultShadowColor}
          fallback={defaultShadowColor}
          onChange={(val) => applyChange({ buttonShadowColor: val })}
        />
      </div>

      {/* 5. RESET TO DEFAULTS */}
      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={handleResetToDefaults}
          className="text-xs font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset button to defaults</span>
        </button>
      </div>
    </div>
  )
}
