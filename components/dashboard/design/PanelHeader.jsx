'use client'

import { ArrowLeft, Loader2 } from 'lucide-react'

/**
 * Standardized Header for Storefront Theme & Design Option Panels
 * Implements the unified Linktree-exact visual pattern:
 * [ ← Section Title ]                      [ ExtraActions | Cancel | Save ]
 */
export default function PanelHeader({
  title,
  onBack,
  onSave,
  onCancel,
  hasUnsavedChanges = false,
  isSaving = false,
  children,
  extraActions,
}) {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-[#F0EFEB] gap-2">
      {/* LEFT: Back arrow + Section Title + Optional Left Controls (e.g. Shuffle) */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={`Back from ${title}`}
            title="Back to All Settings"
            className="h-8 w-8 shrink-0 rounded-full border border-[#E5E5E3] bg-[#FAFAFA] hover:bg-white text-[#1F1F1F] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h3 className="text-base sm:text-lg font-bold text-[#1F1F1F] tracking-tight truncate">
          {title}
        </h3>
        {children}
      </div>

      {/* RIGHT: Extra actions (Undo/Redo) + Cancel + Save */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {extraActions}

        {/* Cancel Button */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={!hasUnsavedChanges || isSaving}
            className={`h-8 px-3.5 rounded-full text-xs font-semibold border transition-all ${
              !hasUnsavedChanges || isSaving
                ? 'border-[#E5E5E3] bg-[#FAFAFA] text-[#A8A8A4] cursor-not-allowed'
                : 'border-[#E5E5E3] bg-white hover:bg-[#F5F5F3] text-[#1F1F1F] shadow-xs active:scale-95 cursor-pointer'
            }`}
          >
            Cancel
          </button>
        )}

        {/* Black Save Button (standardized across all option pages) */}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={!hasUnsavedChanges || isSaving}
            className={`h-8 px-4 rounded-full text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 select-none ${
              !hasUnsavedChanges || isSaving
                ? 'bg-[#E5E5E3] text-[#A8A8A4] cursor-not-allowed'
                : 'bg-[#000000] text-white hover:bg-[#222222] active:scale-95 cursor-pointer'
            }`}
          >
            {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        )}
      </div>
    </div>
  )
}
