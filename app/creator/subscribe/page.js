'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Check, Sparkles, ShieldCheck, CreditCard, Loader2, ArrowRight, Globe } from 'lucide-react'
import { getSubscriptionPricing } from '@/lib/plans'
import CreatorStoreBrand from '@/components/brand/CreatorStoreBrand'
import CountrySelect from '@/components/ui/CountrySelect'
import { openRazorpaySubscriptionCheckout } from '@/lib/razorpayClient'
import { getCountryName } from '@/lib/countries'

export default function CreatorSubscribePage() {
  const router = useRouter()
  const [subStatus, setSubStatus] = useState(null)
  const [meData, setMeData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('PRO') // 'CREATOR' | 'PRO'
  const [billingInterval, setBillingInterval] = useState('monthly') // 'monthly' | 'annual'
  const [selectedCountry, setSelectedCountry] = useState('')
  const [isEditingCountry, setIsEditingCountry] = useState(false)

  const isAnnual = billingInterval === 'annual'

  useEffect(() => {
    Promise.all([
      api.get('/creator/subscription/status').catch(() => null),
      api.get('/me').catch(() => null),
    ]).then(([res, me]) => {
      setSubStatus(res)
      setMeData(me)
      const userCountry = me?.user?.country || me?.profile?.country || ''
      if (userCountry) {
        setSelectedCountry(userCountry)
      }
      // If user has not completed onboarding, send to onboarding
      if (res?.status === 'ACTIVE' && !me?.profile?.onboardingComplete) {
        router.push('/onboarding')
        return
      }
      // If user is already on PRO, they have the top plan; send to dashboard
      if (res?.status === 'ACTIVE' && res?.planId === 'PRO' && !res?.hasScheduledChange) {
        router.push('/dashboard')
      }
    }).finally(() => setLoading(false))
  }, [router])

  const isPaidActive = subStatus?.status === 'ACTIVE' && !subStatus?.isTrial
  const activePlanId = isPaidActive ? (subStatus?.planId || 'PRO') : null
  const activeInterval = isPaidActive ? String(subStatus?.billingInterval || 'MONTHLY').toLowerCase() : null

  const isCurrentSelection = isPaidActive && selectedPlan === activePlanId && billingInterval === activeInterval
  const isUpgrade = isPaidActive && activePlanId === 'CREATOR' && selectedPlan === 'PRO'
  const isDowngrade = isPaidActive && activePlanId === 'PRO' && selectedPlan === 'CREATOR'

  const isIndia = String(selectedCountry || '').toUpperCase().trim() === 'IN'
  const currency = isIndia ? 'INR' : 'USD'
  const pricing = getSubscriptionPricing(currency, billingInterval)

  async function handleCountryChange(newCode) {
    setSelectedCountry(newCode)
    setIsEditingCountry(false)
    try {
      await api.patch('/me/profile', { country: newCode })
      toast.success(`Country updated to ${getCountryName(newCode)} (${newCode})`)
    } catch (e) {
      console.warn('Failed to save country:', e.message)
    }
  }

  async function handleStartPayment() {
    if (paying || isCurrentSelection) return

    if (!selectedCountry) {
      toast.error('Please select your country before continuing.')
      setIsEditingCountry(true)
      return
    }

    setPaying(true)
    try {
      console.log(`[Checkout] Initiating plan action for ${selectedPlan} (${billingInterval}) [Country: ${selectedCountry}]`)
      const checkoutRes = await api.post('/creator/subscription/checkout', {
        plan: selectedPlan,
        interval: billingInterval,
      })

      if (checkoutRes.alreadyActive) {
        toast.info(checkoutRes.message || 'You already have an active subscription for this plan.')
        setPaying(false)
        router.push('/dashboard')
        return
      }

      // Route A: Razorpay Checkout (India)
      if (checkoutRes.provider === 'razorpay') {
        console.log('[Razorpay] Opening checkout modal for subscription:', checkoutRes.subscriptionId)
        await openRazorpaySubscriptionCheckout({
          keyId: checkoutRes.keyId,
          subscriptionId: checkoutRes.subscriptionId,
          planName: checkoutRes.planName,
          billingInterval,
          customerEmail: meData?.user?.email,
          customerName: meData?.profile?.name || meData?.user?.name || 'Creator',
          onSuccess: async (rzpResp) => {
            try {
              const verifyRes = await api.post('/creator/subscription/verify', {
                razorpaySubscriptionId: rzpResp.razorpay_subscription_id,
                razorpayPaymentId: rzpResp.razorpay_payment_id,
                razorpaySignature: rzpResp.razorpay_signature,
              })
              if (verifyRes.status === 'ACTIVE') {
                toast.success('Subscription activated successfully!')
                router.push('/dashboard')
              }
            } catch (err) {
              toast.error(err.message || 'Subscription verification failed')
            } finally {
              setPaying(false)
            }
          },
          onError: (err) => {
            const userMsg = err?.customerMessage || err?.description || 'Razorpay payment was not completed'
            toast.error(userMsg)
            setPaying(false)
          },
          onDismiss: () => {
            toast.info('Checkout was canceled. No charges were made.')
            setPaying(false)
          },
        })
        return
      }

      // Route B: Dodo Payments Hosted Checkout (Outside India)
      if (checkoutRes.checkoutUrl) {
        console.log('[Dodo Payments] Redirecting directly to secure hosted checkout:', checkoutRes.checkoutUrl)
        window.location.href = checkoutRes.checkoutUrl
        return
      }

      // Pending payment
      if (checkoutRes.pending) {
        toast.info(checkoutRes.message || 'Upgrade payment is processing. Pro entitlements will activate once confirmed.')
        setPaying(false)
        router.push('/dashboard')
        return
      }

      // Verified Instant Upgrade applied
      if (checkoutRes.upgraded && checkoutRes.status === 'ACTIVE') {
        toast.success(checkoutRes.message || 'Successfully upgraded to Pro!')
        setPaying(false)
        router.push('/dashboard')
        return
      }

      if (checkoutRes.scheduledDowngrade) {
        toast.success(checkoutRes.message || 'Downgrade scheduled for your next billing cycle.')
        setPaying(false)
        router.push('/dashboard')
        return
      }

      toast.error(checkoutRes.message || checkoutRes.error || 'Failed to initiate secure checkout session. Please try again.')
      setPaying(false)
    } catch (err) {
      if (err.code === 'COUNTRY_REQUIRED' || err.message?.includes('Country selection is required') || err.message?.includes('Country is required')) {
        toast.error('Please select your country to continue to checkout.')
        setIsEditingCountry(true)
      } else {
        toast.error(err.message || 'Subscription checkout failed')
      }
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000000] p-6">
        <Skeleton className="h-96 w-full max-w-md rounded-3xl bg-[#0A0B13]" />
      </div>
    )
  }

  const isPro = selectedPlan === 'PRO'
  const planData = isPro ? pricing.PRO : pricing.CREATOR
  const priceDisplay = planData.priceFormatted
  const periodLabel = planData.periodLabel

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000000] p-6 font-sans text-[#F4F2EC]">
      <div className="w-full max-w-xl bg-[#0A0B13] rounded-3xl p-8 sm:p-10 border border-white/10 shadow-2xl space-y-8">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <CreatorStoreBrand href="/" theme="dark" size="lg" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C7F000]/30 bg-[#C7F000]/10 px-3.5 py-1 text-xs font-bold text-[#C7F000]">
            <Sparkles className="h-3.5 w-3.5" /> 0% CreatorStore Platform Fee
          </div>
          <h1 className="text-3xl font-black text-[#F4F2EC] tracking-tight">Pick your Creator plan</h1>
          <p className="text-xs sm:text-sm text-[#A1A1AA] font-medium">
            Keep 100% of your product revenue and automate your creator business.
          </p>

          {/* Segmented Controls: Billing Interval */}
          <div className="pt-3 flex items-center justify-center">
            <div className="inline-flex items-center p-1 rounded-full bg-[#12141c] border border-white/20 transition-all">
              <button
                type="button"
                onClick={() => setBillingInterval('monthly')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  !isAnnual ? 'bg-primary text-black font-black shadow-md' : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval('annual')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  isAnnual ? 'bg-primary text-black font-black shadow-md' : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <span>Annual</span>
                <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${
                  isAnnual ? 'bg-black text-[#C7F000]' : 'bg-[#C7F000]/20 text-[#C7F000]'
                }`}>
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Country Selector */}
          {(!selectedCountry || isEditingCountry) ? (
            <div className="pt-3 max-w-sm mx-auto text-left">
              <CountrySelect
                value={selectedCountry}
                onChange={handleCountryChange}
                label="Billing Country"
                placeholder="Select your country..."
                required
              />
            </div>
          ) : (
            <div className="pt-2 flex items-center justify-center gap-2 text-xs text-[#A1A1AA]">
              <span className="flex items-center gap-1.5 font-medium">
                <Globe className="w-3.5 h-3.5 text-[#C7F000]" />
                <span>Billing Country:</span>
                <span className="font-semibold text-white">{getCountryName(selectedCountry)} ({selectedCountry})</span>
                <span className="text-[11px] text-[#A1A1AA]">· {isIndia ? 'Razorpay (INR)' : 'Dodo Payments (USD)'}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsEditingCountry(true)}
                className="text-[#C7F000] hover:underline font-semibold text-xs cursor-pointer ml-1"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Plan Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setSelectedPlan('CREATOR')}
            className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              selectedPlan === 'CREATOR'
                ? 'border-primary bg-[#12141c]'
                : 'border-white/10 bg-[#0A0B13] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-primary">Creator</span>
              <span className="text-base font-black text-[#F4F2EC]">{pricing.CREATOR.priceFormatted}{pricing.CREATOR.periodLabel}</span>
            </div>
            {isAnnual && (
              <div className="text-[11px] text-[#C7F000] font-bold mt-1">
                Save 20% vs monthly
              </div>
            )}
            <p className="text-xs text-[#A1A1AA] mt-2">Unlimited products, Instagram Auto-DMs, basic analytics &amp; up to 3 pages.</p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPlan('PRO')}
            className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer relative ${
              selectedPlan === 'PRO'
                ? 'border-primary bg-[#12141c] shadow-[0_0_20px_rgba(192,132,252,0.15)]'
                : 'border-white/10 bg-[#0A0B13] hover:border-white/20'
            }`}
          >
            <span className="absolute -top-2.5 right-3 bg-[#C7F000] text-[#000000] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
              Recommended
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-[#C7F000]">Pro</span>
              <span className="text-base font-black text-[#F4F2EC]">{pricing.PRO.priceFormatted}{pricing.PRO.periodLabel}</span>
            </div>
            {isAnnual && (
              <div className="text-[11px] text-[#C7F000] font-bold mt-1">
                Save 20% vs monthly
              </div>
            )}
            <p className="text-xs text-[#A1A1AA] mt-2">Advanced analytics, data export, remove branding &amp; unlimited pages.</p>
          </button>
        </div>

        {/* Pricing Card Details */}
        <div className="p-6 rounded-2xl bg-[#12141c] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-[#F4F2EC] text-base">
                {isPro ? (isAnnual ? 'Pro Annual Plan' : 'Pro Monthly Plan') : (isAnnual ? 'Creator Annual Plan' : 'Creator Monthly Plan')}
              </h3>
              <p className="text-xs text-[#A1A1AA] font-medium">
                {isAnnual ? 'Billed annually • Cancel anytime in settings' : 'Cancel anytime in settings'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-primary">{priceDisplay}</span>
              <span className="text-xs text-[#A1A1AA] font-bold">{periodLabel}</span>
              {isAnnual && (
                <div className="text-[10px] text-[#C7F000] font-bold">20% Discount Applied</div>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10 text-xs font-semibold text-[#F4F2EC]">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[#C7F000] shrink-0 stroke-[3]" />
              <span>0% CreatorStore platform transaction fees</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[#C7F000] shrink-0 stroke-[3]" />
              <span>Unlimited Instagram Auto-DMs</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[#C7F000] shrink-0 stroke-[3]" />
              <span>{isPro ? 'Advanced analytics + Data export + Remove branding' : 'Custom storefront designs + Basic analytics + Up to 3 pages'}</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-3">
          <Button
            onClick={handleStartPayment}
            disabled={paying || isCurrentSelection}
            className={`w-full h-12 font-black text-sm rounded-xl gap-2 shadow-lg transition-all ${
              isCurrentSelection
                ? 'bg-white/10 text-white/40 cursor-not-allowed shadow-none'
                : 'bg-primary hover:bg-primary-hover text-[#000000] shadow-primary/25 cursor-pointer'
            }`}
          >
            {paying ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Processing...
              </>
            ) : isCurrentSelection ? (
              'Current Plan'
            ) : isUpgrade ? (
              <>
                <Sparkles className="h-5 w-5" /> Upgrade to Pro ({priceDisplay}{periodLabel}) <ArrowRight className="h-4 w-4 ml-1" />
              </>
            ) : isDowngrade ? (
              <>
                <CreditCard className="h-5 w-5" /> Downgrade to Creator ({priceDisplay}{periodLabel}) <ArrowRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" /> Continue to Payment ({priceDisplay}{periodLabel}) <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>

          {isUpgrade && (
            <p className="text-[11px] text-center text-[#C7F000] font-semibold">
              Immediate upgrade • Unused Creator balance is prorated
            </p>
          )}

          {isDowngrade && (
            <p className="text-[11px] text-center text-[#A1A1AA] font-semibold">
              Downgrade takes effect at your next billing cycle • Maintain Pro until then
            </p>
          )}

          <p className="text-[11px] text-center text-[#A1A1AA]/80 font-medium flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-[#C7F000]" />
            {isIndia
              ? 'Secure checkout via Razorpay (UPI, Cards, Netbanking) • 0% platform fee'
              : 'Secure checkout via Dodo Payments • 0% platform fee • Global payment methods'}
          </p>
        </div>
      </div>
    </div>
  )
}
