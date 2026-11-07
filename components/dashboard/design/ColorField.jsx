'use client'

import { useState, useEffect } from 'react'

/**
 * Linktree-inspired Color Field with integrated swatch + hex input pill
 * [ 🟩 #CCD7A3 ]
 */
export default function ColorField({ label, value, fallback = '#000000', onChange, showBorder = true }) {
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
      onChange(raw.toUpperCase())
    }
  }

  const handleBlur = () => {
    if (!isValidHex(localText)) {
      setLocalText(currentHex)
    }
  }

  return (
    <div className={`flex items-center justify-between py-3 ${showBorder ? 'border-b border-[#F0EFEB] last:border-b-0' : ''}`}>
      {label && <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">{label}</span>}
      <div className="relative flex items-center gap-2 bg-white border border-[#E5E5E3] hover:border-[#1F1F1F]/40 focus-within:border-[#1F1F1F] focus-within:ring-1 focus-within:ring-[#1F1F1F] rounded-xl px-2.5 py-1.5 transition-all shadow-2xs">
        <label
          className="relative h-6 w-6 shrink-0 rounded-md border border-black/15 shadow-2xs cursor-pointer overflow-hidden transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: currentHex }}
          title={`Click to pick ${label || 'color'}`}
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
            aria-label={`Choose ${label || 'color'}`}
          />
        </label>
        <input
          type="text"
          value={localText}
          placeholder={fallback}
          onChange={handleTextChange}
          onBlur={handleBlur}
          maxLength={7}
          className="w-20 font-mono text-xs font-bold text-[#1F1F1F] uppercase tracking-wider bg-transparent outline-none focus:outline-none"
        />
      </div>
    </div>
  )
}
