'use client'

import React from 'react'
import { ArrowLeft, Eye, EyeOff, MoreVertical, Copy, Trash2, Smartphone, Check, Loader2 } from 'lucide-react'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { motion, AnimatePresence } from 'framer-motion'

export default function StoreItemEditorShell({
  itemTypeLabel = 'Item',
  title = 'Untitled',
  onBack,
  tabs = [],
  activeTab,
  onTabChange,
  saveState = 'saved', // 'saved' | 'saving' | 'dirty'
  isHidden = false,
  onToggleHidden,
  onDuplicate,
  onDelete,
  onOpenMobilePreview,
  customHeaderActions,
  children,
}) {
  const handleBack = () => {
    if (saveState === 'dirty') {
      const ok = typeof window !== 'undefined'
        ? window.confirm('You have unsaved changes. Discard changes and leave?')
        : true
      if (!ok) return
    }
    onBack?.()
  }

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 relative bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] lg:h-full">
      {/* ========================================================================= */}
      {/* STICKY TOP HEADER                                                         */}
      {/* ========================================================================= */}
      <div className="sticky top-0 z-20 bg-[#FFFFFF] px-6 sm:px-8 pt-6 pb-2 flex items-center justify-between gap-4 border-b border-transparent">
        {/* Back button & Title Context */}
        <div className="flex items-center gap-3.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={handleBack}
              className="h-9 w-9 rounded-full border border-[#D9D9D9] bg-[#FFFFFF] hover:bg-[#F5F5F3] flex items-center justify-center text-[#1F1F1F] transition-colors cursor-pointer shrink-0"
              title="Back to store items"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            {typeof itemTypeLabel === 'string' ? (
              <p className="text-[13px] sm:text-sm font-medium text-[#6F6F6B] truncate leading-none mb-1">
                {itemTypeLabel}
              </p>
            ) : (
              <div className="text-[13px] sm:text-sm font-medium text-[#6F6F6B] truncate leading-none mb-1">
                {itemTypeLabel}
              </div>
            )}
            <h1 className="text-xl sm:text-[24px] font-bold text-[#1F1F1F] truncate leading-tight tracking-tight">
              {title || 'Untitled'}
            </h1>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Save status badge */}
          {saveState === 'saving' ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F5F3] text-[#6F6F6B] font-medium text-xs">
              <CreatorStoreLoader size={13} />
              Saving...
            </span>
          ) : saveState === 'saved' ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#16A34A]/10 text-[#16A34A] font-semibold text-xs border border-[#16A34A]/20">
              <Check className="h-3 w-3 text-[#16A34A]" />
              Saved
            </span>
          ) : null}

          {/* Mobile Preview toggle */}
          {onOpenMobilePreview && (
            <button
              type="button"
              onClick={onOpenMobilePreview}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#D9D9D9] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-xs font-semibold text-[#1F1F1F] transition-colors cursor-pointer"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Preview</span>
            </button>
          )}

          {customHeaderActions}

          {/* More Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-[#D9D9D9] bg-[#FFFFFF] hover:bg-[#F5F5F3] flex items-center justify-center text-[#1F1F1F] transition-colors cursor-pointer"
                title="More options"
                aria-label="More options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white border-[#E5E5E3] text-xs font-medium">
              {onToggleHidden && (
                <DropdownMenuItem onClick={onToggleHidden} className="cursor-pointer">
                  {isHidden ? (
                    <>
                      <Eye className="h-3.5 w-3.5 mr-2 text-[#16A34A]" /> Show on store
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3.5 w-3.5 mr-2 text-[#6F6F6B]" /> Hide from store
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
                  <Copy className="h-3.5 w-3.5 mr-2 text-[#6F6F6B]" /> Duplicate item
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator className="bg-[#E5E5E3]" />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-[#DC2626] focus:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2 text-[#DC2626]" /> Delete item
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HORIZONTAL SECTION TABS                                                   */}
      {/* ========================================================================= */}
      {tabs.length > 1 && (
        <div className="bg-[#FFFFFF] px-6 sm:px-8 flex items-center gap-7 pt-1 border-b border-[#E5E5E3]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange && onTabChange(tab.id)}
                className={`py-3 text-sm sm:text-[15px] font-semibold transition-all relative cursor-pointer border-b-2 ${
                  isActive
                    ? 'border-[#1F1F1F] text-[#1F1F1F] font-bold'
                    : 'border-transparent text-[#6F6F6B] hover:text-[#1F1F1F]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN FORM CANVAS                                                          */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto subtle-scrollbar">
        <div className="p-6 sm:p-8 max-w-[680px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab || 'single-canvas'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
