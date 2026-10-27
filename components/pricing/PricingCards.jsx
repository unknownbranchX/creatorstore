'use client'

import { CREATOR_FEATURES, PRO_FEATURES } from '@/lib/plans'

export { CREATOR_FEATURES, PRO_FEATURES }

export function CreatorPricingCard({
  pricing,
  isAnnual,
  onSelect,
  isCurrent = false,
  isLoading = false,
  disabled = false,
  buttonText = 'Get Started with Creator',
  subtext = null,
}) {
  const planPricing = pricing?.CREATOR
  const priceDisplay = isAnnual ? planPricing?.annual?.priceFormatted : planPricing?.monthly?.priceFormatted
  const periodLabel = isAnnual ? '/year' : '/mo'
  const originalPrice = isAnnual
    ? planPricing?.annual?.originalPriceInrFormatted || planPricing?.annual?.originalPriceFormatted
    : null

  return (
    <div
      className={`bg-[#F7F7F9] rounded-2xl sm:rounded-[24px] p-6 sm:p-8 flex flex-col justify-between border transition-all ${
        isCurrent
          ? 'border-[#111111] ring-2 ring-black/10'
          : 'border-transparent hover:border-[#E0E0E4]'
      }`}
    >
      <div>
        {/* Title & Badge */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-[#111111] tracking-tight">
            Creator
          </h3>
          {isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#111111] bg-black/10 px-2.5 py-0.5 rounded-full">
              Current Plan
            </span>
          )}
        </div>
        <p className="text-xs text-[#666666] leading-relaxed mt-1 min-h-[34px]">
          High-impact storefront &amp; bio link designed to convert audience into customers.
        </p>

        {/* Price Display */}
        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#111111]">
            {priceDisplay}
          </span>
          <span className="text-xs text-[#777777] font-medium">
            {periodLabel}
          </span>
          {isAnnual && originalPrice && (
            <span className="text-[11px] text-[#999999] line-through ml-2">
              {originalPrice}
            </span>
          )}
        </div>

        {/* Divider Line */}
        <div className="border-b border-[#E4E4E8] my-6" />

        {/* Full-width Black Pill Action Button */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled || isCurrent}
            className={`w-full py-3 px-4 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 text-center flex items-center justify-center ${
              isCurrent
                ? 'bg-[#E5E5E8] text-[#888888] cursor-not-allowed'
                : disabled
                  ? 'bg-[#111111]/70 text-white cursor-wait'
                  : 'bg-[#111111] hover:bg-black text-white shadow-xs cursor-pointer'
            }`}
          >
            {buttonText}
          </button>
          {subtext && (
            <p className="text-[10px] text-center text-[#666666] pt-1">{subtext}</p>
          )}
        </div>

        {/* Feature Checklist with `+ ` prefix */}
        <div className="space-y-3 pt-7 text-xs sm:text-sm text-[#444444]">
          {CREATOR_FEATURES.map((feat, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-[#999999] font-mono select-none">+</span>
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProPricingCard({
  pricing,
  isAnnual,
  onSelect,
  isCurrent = false,
  isLoading = false,
  disabled = false,
  buttonText = 'Get Started with Pro',
  subtext = null,
}) {
  const planPricing = pricing?.PRO
  const priceDisplay = isAnnual ? planPricing?.annual?.priceFormatted : planPricing?.monthly?.priceFormatted
  const periodLabel = isAnnual ? '/year' : '/mo'
  const originalPrice = isAnnual
    ? planPricing?.annual?.originalPriceInrFormatted || planPricing?.annual?.originalPriceFormatted
    : null

  return (
    <div
      className={`bg-[#18181A] text-white rounded-2xl sm:rounded-[24px] p-6 sm:p-8 flex flex-col justify-between shadow-[0_12px_36px_rgba(0,0,0,0.18)] relative border transition-all ${
        isCurrent
          ? 'border-white/40 ring-2 ring-white/20'
          : 'border-white/5'
      }`}
    >
      <div>
        {/* Title & Badge */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white tracking-tight">
            Pro
          </h3>
          {isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-black bg-white px-2.5 py-0.5 rounded-full">
              Current Plan
            </span>
          )}
        </div>
        <p className="text-xs text-[#999999] leading-relaxed mt-1 min-h-[34px]">
          Full creator suite with automated Instagram DMs and viral growth workflows.
        </p>

        {/* Price Display */}
        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            {priceDisplay}
          </span>
          <span className="text-xs text-[#888888] font-medium">
            {periodLabel}
          </span>
          {isAnnual && originalPrice && (
            <span className="text-[11px] text-[#666666] line-through ml-2">
              {originalPrice}
            </span>
          )}
        </div>

        {/* Divider Line */}
        <div className="border-b border-white/10 my-6" />

        {/* Full-width White Pill Action Button */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled || isCurrent}
            className={`w-full py-3 px-4 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 text-center flex items-center justify-center ${
              isCurrent
                ? 'bg-[#2A2A2D] text-[#888888] cursor-not-allowed'
                : disabled
                  ? 'bg-white/70 text-black cursor-wait'
                  : 'bg-white hover:bg-[#F2F2F2] text-black shadow-md cursor-pointer'
            }`}
          >
            {buttonText}
          </button>
          {subtext && (
            <p className="text-[10px] text-center text-[#CCCCCC] pt-1">{subtext}</p>
          )}
        </div>

        {/* Feature Checklist with `+ ` prefix */}
        <div className="space-y-3 pt-7 text-xs sm:text-sm text-[#CCCCCC]">
          <div className="flex items-start gap-2 font-medium text-white">
            <span className="text-[#777777] font-mono select-none">+</span>
            <span>Everything in Creator, plus:</span>
          </div>
          {PRO_FEATURES.map((feat, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-[#777777] font-mono select-none">+</span>
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
