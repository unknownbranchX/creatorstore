'use client'

import { useState } from 'react'
import { ArrowLeft, Undo2, Redo2, ChevronDown, Zap, Loader2, RotateCcw } from 'lucide-react'
import ColorField from './ColorField'
import FontPickerModal from './FontPickerModal'
import { STOREFRONT_FONTS } from '@/lib/storefrontFonts'
import PanelHeader from './PanelHeader'

/**
 * Linktree-inspired Text (Typography) Customization Panel (#text)
 * Matches Linktree Screenshot 4 with top action controls, font dropdowns,
 * alternative title font toggle, and integrated color pills.
 */
export default function TextPanel({
  theme,
  onChange,
  onBack,
  onSave,
  onCancel,
  onReset,
  onUpgrade,
  hasUnsavedChanges = false,
  isSaving = false,
}) {
  const [picker, setPicker] = useState(null)
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

  const altOn = !!theme.altTitleFont
  const pageFont = theme.font || 'Manrope'
  const titleFont = theme.titleFont || pageFont

  return (
    <div className="bg-white rounded-[24px] border border-[#E5E5E3] p-5 sm:p-6 shadow-xs space-y-6">
      {/* TOP HEADER: Standardized PanelHeader with Undo/Redo + Cancel/Save (black Save #000000; legacy #8B3DFF) */}
      <PanelHeader
        title="Text"
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
              aria-label="Undo text change"
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
              aria-label="Redo text change"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* TYPOGRAPHY CONTROLS LIST */}
      <div className="space-y-0.5 divide-y divide-[#F0EFEB]">
        {/* 1. Page font dropdown */}
        <div className="flex items-center justify-between py-3">
          <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">Page font</span>
          <button
            type="button"
            onClick={() => setPicker('page')}
            className="flex items-center justify-between gap-3 bg-white border border-[#E5E5E3] hover:border-[#1F1F1F]/40 rounded-xl px-3 py-2 min-w-[140px] transition-all cursor-pointer shadow-2xs group"
          >
            <span className="text-xs font-bold text-[#1F1F1F] truncate" style={{ fontFamily: pageFont }}>
              {pageFont}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#6F6F6B] group-hover:text-[#1F1F1F] shrink-0 transition-colors" />
          </button>
        </div>

        {/* 2. Page text color pill */}
        <ColorField
          label="Page text color"
          value={theme.textColor}
          fallback="#FFFFFF"
          onChange={(v) => applyChange({ textColor: v })}
          showBorder={false}
        />

        {/* 3. Alternative title font toggle */}
        <div className="flex items-center justify-between py-3 gap-3">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight block">
              Alternative title font
            </span>
            <span className="text-xs text-[#6F6F6B] block">
              Matches page font by default
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-[#EAEAE8] text-[#555555] flex items-center justify-center shrink-0">
              <Zap className="h-3 w-3 fill-current" />
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={altOn}
              onClick={() => {
                const nextVal = !altOn
                applyChange({ altTitleFont: nextVal })
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                altOn ? 'bg-[#1F1F1F]' : 'bg-[#D1D1CE]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  altOn ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 4. Title font dropdown (if alternative font enabled) */}
        {altOn && (
          <div className="flex items-center justify-between py-3 pl-2 border-l-2 border-[#1F1F1F]">
            <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">Title font</span>
            <button
              type="button"
              onClick={() => setPicker('title')}
              className="flex items-center justify-between gap-3 bg-white border border-[#E5E5E3] hover:border-[#1F1F1F]/40 rounded-xl px-3 py-2 min-w-[140px] transition-all cursor-pointer shadow-2xs group"
            >
              <span className="text-xs font-bold text-[#1F1F1F] truncate" style={{ fontFamily: titleFont }}>
                {titleFont}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#6F6F6B] group-hover:text-[#1F1F1F] shrink-0 transition-colors" />
            </button>
          </div>
        )}

        {/* 5. Title color pill */}
        <ColorField
          label="Title color"
          value={theme.titleColor || theme.textColor}
          fallback="#FFFFFF"
          onChange={(v) => applyChange({ titleColor: v })}
          showBorder={false}
        />
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
            <span>Reset text to defaults</span>
          </button>
        </div>
      )}

      {/* FONT SELECTION MODALS */}
      <FontPickerModal
        open={picker === 'page'}
        title="Page font"
        value={pageFont}
        onSelect={(id) => applyChange({ font: id })}
        onClose={() => setPicker(null)}
        onUpgrade={onUpgrade}
      />
      <FontPickerModal
        open={picker === 'title'}
        title="Title font"
        value={titleFont}
        onSelect={(id) => applyChange({ titleFont: id, altTitleFont: true })}
        onClose={() => setPicker(null)}
        onUpgrade={onUpgrade}
      />
    </div>
  )
}
