'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, formatMoney } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Landmark, QrCode, ShieldCheck, AlertTriangle, CheckCircle2,
  Loader2, Save, Sparkles, HelpCircle, Check, Info, ArrowUpRight, ArrowLeft, Wallet
} from 'lucide-react'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'

function FieldError({ message }) {
  if (!message) return null
  return <p className="text-xs font-medium text-[var(--status-error,#EF4444)] mt-1.5">{message}</p>
}

function maskUpi(upiId) {
  if (!upiId) return ''
  const trimmed = String(upiId).trim()
  const parts = trimmed.split('@')
  if (parts.length !== 2) return trimmed
  const [handle, bank] = parts
  if (handle.length <= 2) return `${handle[0] || ''}••@${bank}`
  if (handle.length <= 4) return `${handle.slice(0, 2)}•••@${bank}`
  return `${handle.slice(0, 3)}••••@${bank}`
}

function maskPayPal(email) {
  if (!email) return ''
  const trimmed = String(email).trim().toLowerCase()
  const parts = trimmed.split('@')
  if (parts.length !== 2) return trimmed
  const [handle, domain] = parts
  if (handle.length <= 2) return `${handle[0] || ''}••@${domain}`
  if (handle.length <= 4) return `${handle.slice(0, 2)}•••@${domain}`
  return `${handle.slice(0, 2)}••••${handle.slice(-1)}@${domain}`
}

function maskAccount(acc) {
  if (!acc) return ''
  const clean = String(acc).trim()
  return `•••• ${clean.slice(-4)}`
}

function maskIfscCode(ifsc) {
  if (!ifsc) return ''
  const clean = String(ifsc).trim().toUpperCase()
  if (clean.length < 11) return clean
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`
}

export default function PayoutSettingsView({ showSettingsNav = true }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // Form states
  const [payoutSchedule, setPayoutSchedule] = useState('weekly') // 'weekly' | 'monthly'
  const [minimumPayoutThreshold, setMinimumPayoutThreshold] = useState('100')
  const [isPayoutPaused, setIsPayoutPaused] = useState(false)
  const [payoutMethod, setPayoutMethod] = useState('BANK_ACCOUNT') // 'BANK_ACCOUNT' | 'UPI' | 'PAYPAL'

  // Bank form details
  const [accountHolderName, setAccountHolderName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')

  // UPI form details
  const [upiId, setUpiId] = useState('')

  // PayPal form details (international creators)
  const [paypalEmail, setPayPalEmail] = useState('')

  // Loaded Profile Overview
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    try {
      const res = await api.get('/payouts/settings')
      if (res) {
        setProfile(res)
        const isIndiaCreator = res.country ? res.country === 'IN' : true
        const defaultThreshold = isIndiaCreator ? 100 : 50
        setPayoutSchedule(res.payoutSchedule === 'monthly' ? 'monthly' : 'weekly')
        setMinimumPayoutThreshold(String(res.minimumPayoutThreshold || defaultThreshold))
        setIsPayoutPaused(Boolean(res.isPayoutPaused))
        
        let method = ''
        if (!isIndiaCreator) {
          method = 'PAYPAL'
        } else {
          method = res.payoutMethod === 'UPI' ? 'UPI' : 'BANK_ACCOUNT'
        }
        setPayoutMethod(method)

        setAccountHolderName(res.accountHolderName || '')
        setBankName(res.bankName || '')
        setIfscCode(res.ifsc || '')
        
        if (res.paypalEmail) {
          setPayPalEmail(res.paypalEmail)
        }

        if (res.bankAccountRaw) {
          setAccountNumber(res.bankAccountRaw)
          setConfirmAccountNumber(res.bankAccountRaw)
        } else if (res.bankLast4) {
          setAccountNumber('')
          setConfirmAccountNumber('')
        }

        if (res.upiIdRaw) {
          setUpiId(res.upiIdRaw)
        }
      }
    } catch (err) {
      console.error('Failed to load payout settings:', err)
      toast.error('Failed to load payment settings')
    } finally {
      setLoading(false)
    }
  }

  function validate() {
    const nextErrors = {}

    // Threshold validation
    const numThreshold = Number(minimumPayoutThreshold)
    if (isNaN(numThreshold) || numThreshold <= 0) {
      nextErrors.minimumPayoutThreshold = 'Please enter a valid positive payout threshold.'
    }

    const isIndiaCreator = profile?.country ? profile.country === 'IN' : true

    if (!isIndiaCreator || payoutMethod === 'PAYPAL') {
      const trimmedPayPal = paypalEmail.trim()
      if (!trimmedPayPal) {
        nextErrors.paypalEmail = 'PayPal email address is required.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedPayPal)) {
        nextErrors.paypalEmail = 'Enter a valid PayPal email address.'
      }
    } else if (payoutMethod === 'UPI') {
      const trimmedUpi = upiId.trim()
      if (!trimmedUpi) {
        nextErrors.upiId = 'UPI ID is required.'
      } else if (!trimmedUpi.includes('@')) {
        nextErrors.upiId = 'Enter a valid UPI ID (e.g. yourname@okhdfcbank).'
      } else if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(trimmedUpi)) {
        nextErrors.upiId = 'Invalid UPI ID format (e.g. name@bank).'
      }
    } else {
      // Bank Account validation
      if (!accountHolderName.trim()) {
        nextErrors.accountHolderName = 'Account holder name is required.'
      } else if (accountHolderName.trim().length < 2) {
        nextErrors.accountHolderName = 'Please enter full legal account holder name.'
      }

      if (!bankName.trim()) {
        nextErrors.bankName = 'Bank name is required.'
      } else if (bankName.trim().length < 2) {
        nextErrors.bankName = 'Please enter a valid bank name.'
      }

      const acc = accountNumber.trim()
      const confirmAcc = confirmAccountNumber.trim()
      const ifsc = ifscCode.trim().toUpperCase()

      if (!acc && !profile?.bankLast4) {
        nextErrors.accountNumber = 'Bank account number is required.'
      } else if (acc && !/^\d{8,20}$/.test(acc)) {
        nextErrors.accountNumber = 'Account number must be 8–20 numeric digits.'
      }

      if (acc && confirmAcc !== acc) {
        nextErrors.confirmAccountNumber = "Account numbers don't match."
      }

      if (!ifsc) {
        nextErrors.ifscCode = 'IFSC code is required.'
      } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        nextErrors.ifscCode = 'Enter a valid 11-character IFSC code (e.g. SBIN0001234).'
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSaveSettings() {
    if (!validate()) {
      toast.error('Please fix the errors in the form before saving.')
      return
    }

    setSaving(true)
    try {
      const isIndiaCreator = profile?.country ? profile.country === 'IN' : true
      const resolvedMethod = !isIndiaCreator ? 'PAYPAL' : (payoutMethod === 'UPI' ? 'UPI' : 'ACCOUNT')

      const payload = {
        payoutSchedule,
        minimumPayoutThreshold: Number(minimumPayoutThreshold) || (isIndiaCreator ? 100 : 50),
        isPayoutPaused,
        payoutMethod: resolvedMethod,
        accountHolderName: (!isIndiaCreator || payoutMethod === 'UPI') ? '' : accountHolderName.trim(),
        bankName: (!isIndiaCreator || payoutMethod === 'UPI') ? '' : bankName.trim(),
        accountNumber: (!isIndiaCreator || payoutMethod === 'UPI') ? '' : (accountNumber.trim() || profile?.bankAccountRaw || ''),
        confirmAccountNumber: (!isIndiaCreator || payoutMethod === 'UPI') ? '' : (confirmAccountNumber.trim() || profile?.bankAccountRaw || ''),
        ifscCode: (!isIndiaCreator || payoutMethod === 'UPI') ? '' : ifscCode.trim().toUpperCase(),
        upiId: (isIndiaCreator && payoutMethod === 'UPI') ? upiId.trim() : '',
        paypalEmail: !isIndiaCreator ? paypalEmail.trim().toLowerCase() : '',
      }

      const updated = await api.post('/payouts/settings', payload)
      setProfile(updated)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('creatorstore:setup-updated'))
      }
      toast.success('Payout details submitted successfully.')
    } catch (err) {
      toast.error(err.message || 'Failed to save payment settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center select-none">
        <CreatorStoreLoader size="lg" message="Loading payout details..." />
        <p className="mt-3 text-xs font-semibold text-[#6F6F6B]">Loading payout details...</p>
      </div>
    )
  }

  const statusValue = profile?.status
  const isPending = statusValue === 'PENDING'
  const isActive = statusValue === 'ACTIVE' || statusValue === 'VERIFIED'
  const isConfigured = isPending || isActive
  const availableEarnings = profile?.availableEarnings || 0
  const isEligible = profile?.isEligibleForPayout ?? (isActive && !isPayoutPaused && availableEarnings >= Number(minimumPayoutThreshold))
  const isIndia = profile?.country ? profile.country === 'IN' : true
  const countryName = profile?.countryName || profile?.country || (isIndia ? 'India' : 'International')

  return (
    <div className="max-w-4xl mx-auto space-y-8 font-sans text-[#1F1F1F] pb-16">

      {/* 1. SETTINGS NAVIGATION TABS */}
      {showSettingsNav && (
        <div className="flex items-center gap-3 border-b border-[#E5E5E3] pb-4 overflow-x-auto">
          <Link
            href="/dashboard/settings"
            className="px-4 py-2 text-sm font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] transition-colors shrink-0"
          >
            Profile &amp; Store
          </Link>
          <Link
            href="/dashboard/settings/payments"
            className="px-4 py-2 text-sm font-bold text-[#1F1F1F] border-b-2 border-[#1F1F1F] shrink-0"
          >
            Payments
          </Link>
          <Link
            href="/dashboard/settings/connected-accounts"
            className="px-4 py-2 text-sm font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] transition-colors shrink-0"
          >
            Connected Accounts
          </Link>
          <Link
            href="/dashboard/settings/billing"
            className="px-4 py-2 text-sm font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] transition-colors shrink-0"
          >
            Billing &amp; Subscription
          </Link>
        </div>
      )}

      {/* 2. PAYMENT SETTINGS HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E5E3] pb-6">
        <div>
          <h1 className="text-3xl font-black text-[#1F1F1F] tracking-tight">Payments</h1>
          <p className="text-xs sm:text-sm text-[#6F6F6B] font-medium mt-1">
            Configure how and when you receive earnings from your product sales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-[#1F1F1F] hover:bg-[#000000] active:bg-[#111111] text-[#FFFFFF] font-bold text-xs h-11 px-6 rounded-full transition-all shadow-none flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 3. PAYOUT SCHEDULE SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 border-b border-[#E5E5E3] pb-10">
        <div className="md:col-span-4 space-y-2">
          <h2 className="text-lg font-bold text-[#1F1F1F] tracking-tight">Payout schedule</h2>
          <p className="text-xs sm:text-sm text-[#6F6F6B] leading-relaxed font-medium">
            Choose when your eligible earnings should be paid out. Payouts are processed only when your minimum payout threshold is reached.
          </p>
        </div>

        <div className="md:col-span-8 space-y-6">
          {/* Schedule Dropdown */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-[#1F1F1F]">Schedule</Label>
            <Select value={payoutSchedule} onValueChange={setPayoutSchedule}>
              <SelectTrigger className="w-full h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] focus:border-[#1F1F1F]">
                <SelectValue placeholder="Select payout schedule" />
              </SelectTrigger>
              <SelectContent className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] rounded-[14px] shadow-xl">
                <SelectItem value="weekly" className="cursor-pointer hover:bg-[#F5F5F3]">Weekly</SelectItem>
                <SelectItem value="monthly" className="cursor-pointer hover:bg-[#F5F5F3]">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[#6F6F6B] font-medium">
              Payouts are processed automatically according to your selected schedule.
            </p>
          </div>

          {/* Minimum Payout Threshold */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-[#1F1F1F]">Minimum payout threshold</Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#6F6F6B] select-none">
                {isIndia ? '₹' : '$'}
              </span>
              <Input
                type="number"
                min="1"
                step="1"
                value={minimumPayoutThreshold}
                onChange={(e) => {
                  setMinimumPayoutThreshold(e.target.value)
                  setErrors((prev) => ({ ...prev, minimumPayoutThreshold: '' }))
                }}
                className="pl-8 h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] font-bold focus:border-[#1F1F1F]"
                placeholder={isIndia ? "100" : "50"}
              />
            </div>
            <FieldError message={errors.minimumPayoutThreshold} />
            <p className="text-[11px] text-[#6F6F6B] font-medium">
              Payouts will only be processed when your available balance reaches this amount.
            </p>
          </div>

          {/* Pause Payouts Toggle */}
          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="pause-payouts-toggle" className="text-xs font-bold text-[#1F1F1F] cursor-pointer">
                  Pause payouts
                </Label>
                {isPayoutPaused && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#D97706]/10 text-[#D97706] border border-[#D97706]/20">
                    Payouts on hold
                  </span>
                )}
              </div>
              <Switch
                id="pause-payouts-toggle"
                checked={isPayoutPaused}
                onCheckedChange={setIsPayoutPaused}
              />
            </div>
            <p className="text-[11px] text-[#6F6F6B] leading-relaxed font-medium">
              By pausing payouts, they won't be processed until you decide to resume them, and your balance will remain in your account until then.
            </p>
          </div>
        </div>
      </div>

      {/* 4. PAYOUT METHOD SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 border-b border-[#E5E5E3] pb-10">
        <div className="md:col-span-4 space-y-2">
          <h2 className="text-lg font-bold text-[#1F1F1F] tracking-tight">Payout method</h2>
          <p className="text-xs sm:text-sm text-[#6F6F6B] leading-relaxed font-medium">
            {isIndia
              ? 'Choose whether you want to receive direct creator settlements via Bank Account or UPI.'
              : `Configure your PayPal ID to receive direct creator settlements in ${countryName}.`}
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#6F6F6B] font-medium">
              <HelpCircle className="h-3.5 w-3.5 text-[#1F1F1F]" />
              Direct settlements have 0% CreatorStore platform fees.
            </span>
          </div>
        </div>

        <div className="md:col-span-8 space-y-6">
          {/* Method Selection Cards - Conditional on creator's registered country */}
          {isIndia ? (
            /* INDIA CREATOR: Show Account Details & UPI cards. PayPal is hidden. */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* OPTION 1: Account Details */}
              <div
                onClick={() => {
                  setPayoutMethod('BANK_ACCOUNT')
                  setErrors({})
                }}
                className={`p-5 rounded-[18px] border transition-all cursor-pointer space-y-2 ${
                  payoutMethod === 'BANK_ACCOUNT'
                    ? 'border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-none'
                    : 'border border-[#E5E5E3] bg-[#FFFFFF] hover:border-[#1F1F1F]/40 hover:bg-[#F5F5F3]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center border ${
                    payoutMethod === 'BANK_ACCOUNT' ? 'bg-[#1F1F1F] text-white border-[#1F1F1F]' : 'bg-[#F2F1EF] text-[#1F1F1F] border-[#E5E5E3]'
                  }`}>
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                    payoutMethod === 'BANK_ACCOUNT' ? 'border-[#1F1F1F] bg-[#1F1F1F] text-white' : 'border-[#E5E5E3] bg-white'
                  }`}>
                    {payoutMethod === 'BANK_ACCOUNT' && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1F1F1F]">Account Details</h3>
                  <p className="text-xs text-[#6F6F6B] mt-0.5">
                    Receive payouts directly to your bank account.
                  </p>
                </div>
              </div>

              {/* OPTION 2: UPI */}
              <div
                onClick={() => {
                  setPayoutMethod('UPI')
                  setErrors({})
                }}
                className={`p-5 rounded-[18px] border transition-all cursor-pointer space-y-2 ${
                  payoutMethod === 'UPI'
                    ? 'border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-none'
                    : 'border border-[#E5E5E3] bg-[#FFFFFF] hover:border-[#1F1F1F]/40 hover:bg-[#F5F5F3]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center border ${
                    payoutMethod === 'UPI' ? 'bg-[#1F1F1F] text-white border-[#1F1F1F]' : 'bg-[#F2F1EF] text-[#1F1F1F] border-[#E5E5E3]'
                  }`}>
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                    payoutMethod === 'UPI' ? 'border-[#1F1F1F] bg-[#1F1F1F] text-white' : 'border-[#E5E5E3] bg-white'
                  }`}>
                    {payoutMethod === 'UPI' && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1F1F1F]">UPI</h3>
                  <p className="text-xs text-[#6F6F6B] mt-0.5">
                    Receive payouts directly to your UPI ID.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* NON-INDIA CREATOR: Show only PayPal card. Bank Account and UPI are hidden. */
            <div className="grid grid-cols-1 gap-4">
              <div
                onClick={() => {
                  setPayoutMethod('PAYPAL')
                  setErrors({})
                }}
                className="p-5 rounded-[18px] border-2 border-[#1F1F1F] bg-[#F5F5F3] shadow-none space-y-2 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center border bg-[#1F1F1F] text-white border-[#1F1F1F]">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div className="h-5 w-5 rounded-full border border-[#1F1F1F] bg-[#1F1F1F] text-white flex items-center justify-center">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1F1F1F]">PayPal</h3>
                  <p className="text-xs text-[#6F6F6B] mt-0.5">
                    Receive payouts directly to your PayPal account.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC FORM: Account Details (India only) */}
          {isIndia && payoutMethod === 'BANK_ACCOUNT' && (
            <div className="bg-[#FFFFFF] p-6 rounded-[20px] border border-[#E5E5E3] space-y-4 animate-in fade-in duration-150 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#1F1F1F]">Account holder name</Label>
                <Input
                  value={accountHolderName}
                  onChange={(e) => {
                    setAccountHolderName(e.target.value)
                    setErrors((prev) => ({ ...prev, accountHolderName: '' }))
                  }}
                  className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] focus:border-[#1F1F1F]"
                  placeholder="Full name as on bank passbook"
                />
                <FieldError message={errors.accountHolderName} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1F1F1F]">Bank name</Label>
                  <Input
                    value={bankName}
                    onChange={(e) => {
                      setBankName(e.target.value)
                      setErrors((prev) => ({ ...prev, bankName: '' }))
                    }}
                    className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] focus:border-[#1F1F1F]"
                    placeholder="e.g. HDFC Bank, SBI, ICICI"
                  />
                  <FieldError message={errors.bankName} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1F1F1F]">IFSC code</Label>
                  <Input
                    value={ifscCode}
                    onChange={(e) => {
                      setIfscCode(e.target.value.toUpperCase())
                      setErrors((prev) => ({ ...prev, ifscCode: '' }))
                    }}
                    className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] uppercase font-mono focus:border-[#1F1F1F]"
                    placeholder="SBIN0001234"
                    maxLength={11}
                  />
                  <FieldError message={errors.ifscCode} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1F1F1F]">Bank account number</Label>
                  <Input
                    type="password"
                    value={accountNumber}
                    onChange={(e) => {
                      setAccountNumber(e.target.value)
                      setErrors((prev) => ({ ...prev, accountNumber: '' }))
                    }}
                    className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] font-mono focus:border-[#1F1F1F]"
                    placeholder="Enter account number"
                  />
                  <FieldError message={errors.accountNumber} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1F1F1F]">Confirm bank account number</Label>
                  <Input
                    value={confirmAccountNumber}
                    onChange={(e) => {
                      setConfirmAccountNumber(e.target.value)
                      setErrors((prev) => ({ ...prev, confirmAccountNumber: '' }))
                    }}
                    className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] font-mono focus:border-[#1F1F1F]"
                    placeholder="Re-enter account number"
                  />
                  <FieldError message={errors.confirmAccountNumber} />
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC FORM: UPI (India only) */}
          {isIndia && payoutMethod === 'UPI' && (
            <div className="bg-[#FFFFFF] p-6 rounded-[20px] border border-[#E5E5E3] space-y-4 animate-in fade-in duration-150 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#1F1F1F]">UPI ID</Label>
                <Input
                  value={upiId}
                  onChange={(e) => {
                    setUpiId(e.target.value)
                    setErrors((prev) => ({ ...prev, upiId: '' }))
                  }}
                  className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] font-mono focus:border-[#1F1F1F]"
                  placeholder="yourname@okhdfcbank"
                />
                <FieldError message={errors.upiId} />
                <p className="text-[11px] text-[#6F6F6B] font-medium">
                  Enter your verified VPA / UPI address.
                </p>
              </div>
            </div>
          )}

          {/* DYNAMIC FORM: PayPal (Non-India only) */}
          {!isIndia && (
            <div className="bg-[#FFFFFF] p-6 rounded-[20px] border border-[#E5E5E3] space-y-4 animate-in fade-in duration-150 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#1F1F1F]">PayPal account email / ID</Label>
                <Input
                  type="email"
                  value={paypalEmail}
                  onChange={(e) => {
                    setPayPalEmail(e.target.value)
                    setErrors((prev) => ({ ...prev, paypalEmail: '' }))
                  }}
                  className="h-11 bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] text-sm rounded-[14px] focus:border-[#1F1F1F]"
                  placeholder="your-paypal-email@example.com"
                />
                <FieldError message={errors.paypalEmail} />
                <p className="text-[11px] text-[#6F6F6B] font-medium">
                  Enter the email address registered with your PayPal account. Payouts for non-Indian creators are delivered via PayPal.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. PAYOUT ACCOUNT OVERVIEW SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 border-b border-[#E5E5E3] pb-10">
        <div className="md:col-span-4 space-y-2">
          <h2 className="text-lg font-bold text-[#1F1F1F] tracking-tight">Payout account overview</h2>
          <p className="text-xs sm:text-sm text-[#6F6F6B] leading-relaxed font-medium">
            Active configuration and masked destination for settled creator transfers.
          </p>
        </div>

        <div className="md:col-span-8">
          <div className="bg-[#FFFFFF] p-6 rounded-[24px] border border-[#E5E5E3] space-y-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            {profile?.methodMismatch && (
              <div className="p-4 rounded-[16px] bg-[#FFF5DD] border border-[#D97706]/30 text-[#D97706] text-xs font-medium flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Configuration Attention Required</p>
                  <p className="text-[11px] mt-0.5">
                    {profile?.eligibilityReason || `Your registered country is ${countryName}. Please update and save the payout method required for your country.`}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs text-[#6F6F6B] font-medium block">Configuration Status</span>
                <div className="space-y-0.5">
                  {profile?.methodMismatch ? (
                    <div>
                      <span className="text-[#DC2626] flex items-center gap-1.5 font-bold text-sm">
                        <AlertTriangle className="h-4 w-4" /> Action Required
                      </span>
                      <p className="text-[11px] text-[#6F6F6B] font-medium mt-0.5">
                        Saved payout details do not match your registered country.
                      </p>
                    </div>
                  ) : isActive ? (
                    <div>
                      <span className="text-[#16A34A] flex items-center gap-1.5 font-bold text-sm">
                        <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> Payout is active
                      </span>
                      <p className="text-[11px] text-[#6F6F6B] font-medium mt-0.5">
                        Your payout account has been verified and is ready for payouts.
                      </p>
                    </div>
                  ) : isPending ? (
                    <div>
                      <span className="text-[#D97706] flex items-center gap-1.5 font-bold text-sm">
                        <span className="h-2 w-2 rounded-full bg-[#D97706]" /> Pending verification
                      </span>
                      <p className="text-[11px] text-[#6F6F6B] font-medium mt-0.5">
                        Verification usually completes within 12–24 hours.
                      </p>
                    </div>
                  ) : (
                    <span className="text-[#DC2626] flex items-center gap-1.5 font-bold text-sm">
                      <AlertTriangle className="h-4 w-4" /> Setup Required
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1 text-right">
                <span className="text-xs text-[#6F6F6B] font-medium block">Payout Eligibility</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  isEligible 
                    ? 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/20'
                    : 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/20'
                }`}>
                  {isEligible ? 'Eligible for Payout' : 'Not Eligible Yet'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs border-t border-[#E5E5E3] pt-4">
              <div>
                <span className="text-[#6F6F6B] font-medium block mb-0.5">Method</span>
                <span className="text-[#1F1F1F] font-bold">
                  {profile?.payoutMethod === 'PAYPAL'
                    ? 'PayPal'
                    : (profile?.payoutMethod === 'UPI' ? 'UPI Transfer' : 'Bank Transfer')}
                </span>
              </div>
              <div>
                <span className="text-[#6F6F6B] font-medium block mb-0.5">Account / Holder</span>
                <span className="text-[#1F1F1F] font-bold truncate block">
                  {profile?.payoutMethod === 'PAYPAL'
                    ? (profile?.paypalEmailMasked || profile?.paypalEmail || 'PayPal Account')
                    : (profile?.accountHolderName || 'Not configured')}
                </span>
              </div>
              <div>
                <span className="text-[#6F6F6B] font-medium block mb-0.5">Destination</span>
                <span className="text-[#1F1F1F] font-mono font-bold truncate block">
                  {profile?.payoutMethod === 'PAYPAL'
                    ? (profile?.paypalEmailMasked || profile?.paypalEmail || 'Not configured')
                    : (profile?.payoutMethod === 'UPI'
                      ? (profile?.upiIdMasked || profile?.upiId || 'Not configured')
                      : (profile?.bankLast4 ? `•••• ${profile.bankLast4}` : 'Not configured'))}
                </span>
              </div>
              <div>
                <span className="text-[#6F6F6B] font-medium block mb-0.5">Threshold</span>
                <span className="text-[#1F1F1F] font-bold">
                  {isIndia ? '₹' : '$'}{profile?.minimumPayoutThreshold || minimumPayoutThreshold}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#6F6F6B] bg-[#FBFBFB] p-3.5 rounded-[14px] border border-[#E5E5E3]">
              {profile?.eligibilityReason || 'Configure payout details to receive transfers.'}
            </div>
          </div>
        </div>
      </div>

      {/* 6. FEES INFORMATION SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
        <div className="md:col-span-4 space-y-2">
          <h2 className="text-lg font-bold text-[#1F1F1F] tracking-tight">Fee structure</h2>
          <p className="text-xs sm:text-sm text-[#6F6F6B] leading-relaxed font-medium">
            CreatorStore charges zero commission on your digital products and services.
          </p>
        </div>

        <div className="md:col-span-8">
          <div className="bg-[#FFFFFF] p-6 rounded-[24px] border border-[#E5E5E3] space-y-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-[#F2F1EF] text-[#1F1F1F] border border-[#E5E5E3] flex items-center justify-center font-bold text-xs">
                0%
              </div>
              <span className="text-sm font-bold text-[#1F1F1F]">CreatorStore platform fee: 0%</span>
            </div>

            <p className="text-xs text-[#6F6F6B] leading-relaxed">
              Only payment gateway fees apply.
            </p>
            <p className="text-xs text-[#999995] leading-relaxed">
              Standard payment gateway processing fees apply. Applicable GST is charged on gateway processing fees.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
