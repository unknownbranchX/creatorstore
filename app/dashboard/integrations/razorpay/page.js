'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, formatMoney } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ShieldCheck, CheckCircle2, ArrowRight, Loader2, CreditCard, Sparkles,
  DollarSign, ArrowUpRight, Lock, AlertTriangle, Building, User, Banknote, RefreshCw
} from 'lucide-react'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'

export default function RazorpayPaymentsPage() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Onboarding Form State
  const [formData, setFormData] = useState({
    legalName: '',
    phone: '',
    email: '',
    businessType: 'individual',
    accountHolderName: '',
    accountNumber: '',
    ifscCode: '',
  })

  const [subData, setSubData] = useState(null)

  useEffect(() => {
    fetchDashboard()
    api.get('/creator/subscription/status')
      .then((res) => setSubData(res))
      .catch(() => {})
  }, [])

  function fetchDashboard() {
    setLoading(true)
    api.get('/payouts/dashboard')
      .then((res) => {
        setDashboard(res)
        setLoading(false)
      })
      .catch(() => {
        api.get('/payouts/status')
          .then((statusRes) => {
            setDashboard({
              overview: { totalSales: 0, creatorEarnings: 0, pendingPayouts: 0, paidOut: 0, refunds: 0 },
              status: statusRes,
              recentTransactions: [],
              payoutHistory: [],
            })
            setLoading(false)
          })
          .catch(() => setLoading(false))
      })
  }

  async function handleOnboardSubmit(e) {
    e.preventDefault()
    if (!formData.accountNumber.trim()) {
      toast.error('Please enter your bank account number.')
      return
    }
    if (formData.confirmAccountNumber && formData.accountNumber.trim() !== formData.confirmAccountNumber.trim()) {
      toast.error('Bank account numbers do not match.')
      return
    }
    const normIfsc = (formData.ifscCode || '').trim().toUpperCase()
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
    if (!ifscRegex.test(normIfsc)) {
      toast.error('Invalid bank IFSC code format. IFSC must be 11 characters (e.g. SBIN0001234).')
      return
    }

    setSubmitting(true)
    setStep(4) // Verifying

    try {
      const res = await api.post('/payouts/onboard', {
        ...formData,
        ifscCode: normIfsc,
      })
      toast.success('Payout details submitted for verification!')
      setStep(5)
      fetchDashboard()
    } catch (err) {
      toast.error(err.message || 'Failed to save payout details')
      setStep(3)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !dashboard) return <PaymentsSkeleton />

  const status = dashboard?.status || {}
  const overview = dashboard?.overview || { totalSales: 0, creatorEarnings: 0, pendingPayouts: 0, paidOut: 0, refunds: 0 }
  const isActive = status.status === 'ACTIVE' && status.verificationStatus === 'VERIFIED' && !!status.canSellPaidProducts
  const isValidating = status.status === 'VALIDATING' || status.verificationStatus === 'VALIDATING'
  const isFailed = status.status === 'ACTION_REQUIRED' || status.verificationStatus === 'FAILED'

  return (
    <div className="max-w-6xl space-y-8 pb-12 text-[var(--text-heading,#F5F5F5)]">
      
      {/* 0. SUBSCRIPTION & BILLING STATUS CARD */}
      <div className="bg-[var(--bg-surface,#242424)] p-6 sm:p-8 rounded-3xl border border-[var(--border-subtle,#303030)] shadow-md space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle,#303030)] pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-primary)] bg-[var(--bg-surface-hover,#2A2A2A)] px-3 py-1 rounded-full border border-[var(--border-subtle,#303030)]">
              <Sparkles className="h-3.5 w-3.5" /> Account Subscription
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {subData?.fullPlanTitle || 'CreatorStore Pro Subscription'}
            </h2>
            <p className="text-xs text-[var(--text-secondary,#A3A3A3)] font-medium">
              Authoritative subscription status managed via Secure Payment Gateway.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider ${
              subData?.status === 'ACTIVE' || subData?.status === 'TRIALING'
                ? 'bg-[var(--status-success,#22C55E)]/15 text-[var(--status-success,#22C55E)] border border-[var(--status-success,#22C55E)]/30'
                : subData?.status === 'PAYMENT_PENDING' || subData?.status === 'CANCELLED'
                ? 'bg-[var(--status-warning,#EF6820)]/15 text-[var(--status-warning,#EF6820)] border border-[var(--status-warning,#EF6820)]/30'
                : 'bg-[var(--status-error,#EF4444)]/15 text-[var(--status-error,#EF4444)] border border-[var(--status-error,#EF4444)]/30'
            }`}>
              {subData?.status === 'ACTIVE'
                ? '✓ Active'
                : subData?.status === 'TRIALING'
                ? '✓ Trial Active'
                : subData?.status === 'PAYMENT_PENDING'
                ? 'Payment Pending'
                : subData?.status === 'EXPIRED'
                ? 'Expired'
                : subData?.status || 'Inactive'}
            </span>

            {(subData?.status === 'EXPIRED' || subData?.status === 'PAYMENT_PENDING') && (
              <a href="/onboarding/plan">
                <Button className="font-extrabold bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white rounded-full text-xs h-10 px-5 shadow-sm">
                  {subData?.status === 'EXPIRED' ? 'Renew Subscription' : 'Complete Payment'} →
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Subscription Detail Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] space-y-1">
            <span className="text-[11px] font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Plan & Price</span>
            <div className="text-lg font-black text-white">
              {subData?.plan || 'Pro Monthly'}
            </div>
            <span className="text-xs font-semibold text-[var(--accent-primary)]">
              {formatMoney(subData?.price || 999, subData?.currency || 'INR')} / {subData?.billingCycle === 'YEARLY' ? 'year' : 'month'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] space-y-1">
            <span className="text-[11px] font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Time Remaining</span>
            <div className="text-lg font-black text-[var(--accent-primary)]">
              {subData?.daysRemaining ?? 0} days remaining
            </div>
            <span className="text-xs font-medium text-[var(--text-secondary,#A3A3A3)]">Calculated dynamically</span>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] space-y-1">
            <span className="text-[11px] font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Subscription Started</span>
            <div className="text-sm font-extrabold text-white">
              {subData?.startDate ? new Date(subData.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </div>
            <span className="text-xs font-medium text-[var(--text-secondary,#A3A3A3)]">Creation date</span>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--bg-surface-hover,#2A2A2A)] border border-[var(--border-subtle,#303030)] space-y-1">
            <span className="text-[11px] font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Next Renewal / Expiry</span>
            <div className="text-sm font-extrabold text-white">
              {subData?.nextBillingDate ? new Date(subData.nextBillingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </div>
            <span className="text-xs font-medium text-[var(--text-secondary,#A3A3A3)]">Automated cycle</span>
          </div>
        </div>

        {/* Latest Payment Details */}
        {subData?.latestPayment && (
          <div className="pt-2 border-t border-[var(--border-subtle,#303030)] flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-[var(--text-secondary,#A3A3A3)]">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--status-success,#22C55E)]" />
              <span>Latest Payment: <strong className="text-white">{formatMoney(subData.latestPayment.amount, subData.latestPayment.currency)}</strong></span>
            </div>
            <div>
              Payment ID: <code className="font-mono bg-[var(--bg-surface-hover,#2A2A2A)] px-2 py-0.5 rounded text-white border border-[var(--border-subtle,#303030)]">{subData.latestPayment.razorpayPaymentId}</code>
            </div>
            <div className="text-[var(--status-success,#22C55E)] font-bold">
              ✓ Successful ({new Date(subData.latestPayment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
            </div>
          </div>
        )}
      </div>

      {/* 1. PAYMENTS HEADER */}
      <div className="bg-[var(--bg-surface,#242424)] p-6 sm:p-8 rounded-3xl border border-[var(--border-subtle,#303030)] shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-primary)] bg-[var(--bg-surface-hover,#2A2A2A)] px-3 py-1 rounded-full border border-[var(--border-subtle,#303030)]">
              <Sparkles className="h-3.5 w-3.5" /> CreatorStore Payments System
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Payments & Direct Payouts</h1>
            <p className="text-sm text-[var(--text-secondary,#A3A3A3)] font-medium max-w-2xl">
              Get paid directly from your CreatorStore sales with 0% platform fees. Funds are transferred automatically to your bank account.
            </p>
          </div>

          <div>
            {!isActive ? (
              <Button
                onClick={() => { setStep(1); setShowModal(true) }}
                className="font-extrabold bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white rounded-full h-11 px-6 shadow-md"
              >
                {isValidating ? 'Verification Pending' : isFailed ? 'Update Bank Details' : 'Set Up Payouts'} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => { setStep(1); setShowModal(true) }}
                variant="outline"
                className="font-bold border-[var(--border-subtle,#303030)] bg-[var(--bg-surface-hover,#2A2A2A)] text-white hover:bg-[var(--border-subtle,#303030)] rounded-full h-11 px-6"
              >
                Edit Payout Details
              </Button>
            )}
          </div>
        </div>

        {/* Highlight Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-[var(--bg-surface-hover,#2A2A2A)] p-4 rounded-2xl border border-[var(--border-subtle,#303030)] space-y-0.5">
            <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)]">Account Status</span>
            <div className="text-xl font-black text-white flex items-center gap-1.5">
              <span className="text-[var(--status-success,#22C55E)] flex items-center gap-1">
                <ShieldCheck className="h-5 w-5" /> Connected
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-secondary,#A3A3A3)] font-medium">Direct Payout Account</span>
          </div>

          <div className="bg-[var(--bg-surface-hover,#2A2A2A)] p-4 rounded-2xl border border-[var(--border-subtle,#303030)] space-y-0.5">
            <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)]">Payment Processing</span>
            <div className="text-xl font-black text-white">Handled by CreatorStore</div>
            <span className="text-[11px] text-[var(--text-secondary,#A3A3A3)] font-medium">Secure 256-Bit SSL Encrypted Processing</span>
          </div>

          <div className="bg-[var(--bg-surface-hover,#2A2A2A)] p-4 rounded-2xl border border-[var(--border-subtle,#303030)] space-y-0.5">
            <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)]">Payout Status</span>
            <div className="text-xl font-black text-white flex items-center gap-1.5">
              {isActive ? (
                <span className="text-[var(--status-success,#22C55E)] flex items-center gap-1">
                  <CheckCircle2 className="h-5 w-5" /> Active
                </span>
              ) : isValidating ? (
                <span className="text-[var(--accent-primary)] flex items-center gap-1">
                  <Loader2 className="h-5 w-5 animate-spin" /> Verification Pending
                </span>
              ) : isFailed ? (
                <span className="text-[var(--status-error,#EF4444)] flex items-center gap-1">
                  <AlertTriangle className="h-5 w-5" /> Verification Failed
                </span>
              ) : (
                <span className="text-[var(--status-warning,#EF6820)] flex items-center gap-1">
                  <AlertTriangle className="h-5 w-5" /> Setup Required
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-secondary,#A3A3A3)] font-medium">
              {isActive ? `Bank: •••• ${status.bankLast4}` : isValidating ? `Validating: •••• ${status.bankLast4}` : isFailed ? 'Bank details failed validation' : 'Complete payout setup to sell paid products'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. EARNINGS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-surface,#242424)] p-6 rounded-3xl border border-[var(--border-subtle,#303030)] shadow-sm space-y-2">
          <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Total Sales</span>
          <div className="text-3xl font-black text-white">{formatMoney(overview.totalSales)}</div>
          <span className="text-xs font-semibold text-[var(--text-secondary,#A3A3A3)]">Gross revenue</span>
        </div>

        <div className="bg-[var(--bg-surface,#242424)] p-6 rounded-3xl border border-[var(--border-subtle,#303030)] shadow-sm space-y-2">
          <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Creator Earnings</span>
          <div className="text-3xl font-black text-[var(--accent-primary)]">{formatMoney(overview.creatorEarnings)}</div>
          <span className="text-xs font-semibold text-[var(--status-success,#22C55E)]">0% CreatorStore platform fee</span>
        </div>

        <div className="bg-[var(--bg-surface,#242424)] p-6 rounded-3xl border border-[var(--border-subtle,#303030)] shadow-sm space-y-2">
          <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Paid Out</span>
          <div className="text-3xl font-black text-[var(--status-success,#22C55E)]">{formatMoney(overview.paidOut)}</div>
          <span className="text-xs font-semibold text-[var(--text-secondary,#A3A3A3)]">Transferred to bank</span>
        </div>

        <div className="bg-[var(--bg-surface,#242424)] p-6 rounded-3xl border border-[var(--border-subtle,#303030)] shadow-sm space-y-2">
          <span className="text-xs font-bold text-[var(--text-secondary,#A3A3A3)] uppercase tracking-wider block">Pending Payouts</span>
          <div className="text-3xl font-black text-[var(--status-warning,#EF6820)]">{formatMoney(overview.pendingPayouts)}</div>
          <span className="text-xs font-semibold text-[var(--text-secondary,#A3A3A3)]">Scheduled settlement</span>
        </div>
      </div>

      {/* 3. RECENT TRANSACTIONS TABLE */}
      <div className="bg-[var(--bg-surface,#242424)] rounded-3xl border border-[var(--border-subtle,#303030)] shadow-md p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Recent Transactions</h2>
            <p className="text-xs text-[var(--text-secondary,#A3A3A3)] font-medium">Sales, customer payments, and payout status</p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchDashboard} className="text-xs font-bold text-[var(--accent-primary)] hover:bg-[var(--bg-surface-hover,#2A2A2A)] rounded-full">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>

        {dashboard?.recentTransactions?.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[var(--border-subtle,#303030)] rounded-2xl space-y-2">
            <Banknote className="h-10 w-10 text-[var(--text-secondary,#A3A3A3)] mx-auto" />
            <p className="text-sm font-bold text-white">No transactions recorded yet</p>
            <p className="text-xs text-[var(--text-secondary,#A3A3A3)]">Transactions will appear here automatically when customers purchase your products.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium text-[var(--text-heading,#F5F5F5)]">
              <thead className="bg-[var(--bg-sidebar,#0D0D0D)] text-[var(--text-secondary,#A3A3A3)] uppercase text-[10px] font-black tracking-wider border-b border-[var(--border-subtle,#303030)]">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Sale Amount</th>
                  <th className="py-3 px-4">CreatorStore Fee</th>
                  <th className="py-3 px-4">Creator Earnings</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 rounded-r-xl">Payout Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle,#303030)]">
                {dashboard?.recentTransactions?.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[var(--bg-surface-hover,#2A2A2A)] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-white">#{tx.id.slice(0, 8)}</td>
                    <td className="py-3.5 px-4 text-[var(--text-secondary,#A3A3A3)]">{tx.customerEmail || 'Anonymous'}</td>
                    <td className="py-3.5 px-4 font-bold text-white">{formatMoney(tx.amount, tx.currency)}</td>
                    <td className="py-3.5 px-4 font-bold text-[var(--status-success,#22C55E)]">0% (₹0.00)</td>
                    <td className="py-3.5 px-4 font-black text-[var(--accent-primary)]">{formatMoney(tx.creatorEarnings, tx.currency)}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-[var(--status-success,#22C55E)]/15 text-[var(--status-success,#22C55E)] border border-[var(--status-success,#22C55E)]/30">
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                        {tx.payoutStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. ONBOARDING / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-[var(--bg-surface,#242424)] rounded-3xl border border-[var(--border-subtle,#303030)] max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto text-white">
            
            {/* Step Header */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[var(--accent-primary)]">
                  Step {step} of 5
                </span>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="text-[var(--text-secondary,#A3A3A3)] hover:text-white font-bold text-sm"
                >
                  ✕
                </button>
              </div>
              <h2 className="text-2xl font-black text-white">
                {step === 1 && 'Set Up Your Payouts'}
                {step === 2 && 'Business & Creator Information'}
                {step === 3 && 'Bank Payout Details'}
                {step === 4 && 'Verifying Payout Account'}
                {step === 5 && 'You\'re Ready to Sell!'}
              </h2>
            </div>

            {/* STEP 1: Overview */}
            {step === 1 && (
              <div className="space-y-6">
                <p className="text-sm text-[var(--text-secondary,#A3A3A3)] leading-relaxed font-medium">
                  Connect your payout details so CreatorStore can automatically deposit your sales revenue to your bank account.
                </p>
                <div className="flex items-center gap-3 pt-2 text-xs font-bold text-[var(--text-secondary,#A3A3A3)]">
                  <span className="flex items-center gap-1 text-[var(--status-success,#22C55E)]"><CheckCircle2 className="h-4 w-4" /> Direct Settlements</span>
                  <span>•</span>
                  <span>0% CreatorStore Platform Fee</span>
                </div>

                <div className="space-y-3 bg-[var(--bg-surface-hover,#2A2A2A)] p-4 rounded-2xl border border-[var(--border-subtle,#303030)] text-xs font-bold text-white">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" />
                    <span>0% CreatorStore Platform Fee</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" />
                    <span>Automatic deposits to bank account</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" />
                    <span>256-Bit SSL Encrypted Security</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" />
                    <span>Direct Bank Deposit Support</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" />
                    <span>Instant Payment Webhook Verification</span>
                  </div>
                </div>

                <Button onClick={() => setStep(2)} className="w-full font-extrabold bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white h-11 rounded-full">
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* STEP 2 & 3 FORM */}
            {(step === 2 || step === 3) && (
              <form onSubmit={handleOnboardSubmit} className="space-y-4">
                {step === 2 && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="legalName" className="text-xs font-bold text-white">Legal Business / Full Name *</Label>
                      <Input
                        id="legalName"
                        required
                        placeholder="John Doe / Acme Studios"
                        value={formData.legalName}
                        onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-xs font-bold text-white">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-bold text-white">Notification Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white"
                      />
                    </div>

                    <Button type="button" onClick={() => setStep(3)} className="w-full font-extrabold bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white h-11 rounded-full mt-4">
                      Next: Bank Details <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="accountHolderName" className="text-xs font-bold text-white">Account Holder Name *</Label>
                      <Input
                        id="accountHolderName"
                        required
                        placeholder="John Doe"
                        value={formData.accountHolderName}
                        onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="accountNumber" className="text-xs font-bold text-white">Bank Account Number *</Label>
                      <Input
                        id="accountNumber"
                        required
                        type="password"
                        placeholder="Enter bank account number"
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="confirmAccountNumber" className="text-xs font-bold text-white">Confirm Bank Account Number *</Label>
                      <Input
                        id="confirmAccountNumber"
                        required
                        placeholder="Re-enter bank account number"
                        value={formData.confirmAccountNumber || ''}
                        onChange={(e) => setFormData({ ...formData, confirmAccountNumber: e.target.value })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ifscCode" className="text-xs font-bold text-white">Bank IFSC Code *</Label>
                      <Input
                        id="ifscCode"
                        required
                        placeholder="e.g. SBIN0001234"
                        value={formData.ifscCode}
                        onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                        className="bg-[var(--bg-surface-hover,#2A2A2A)] border-[var(--border-subtle,#303030)] rounded-full text-white font-mono"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => setStep(2)} className="w-1/3 rounded-full font-bold border-[var(--border-subtle,#303030)] bg-[var(--bg-surface-hover,#2A2A2A)] text-white hover:bg-[var(--border-subtle,#303030)]">
                        Back
                      </Button>
                      <Button type="submit" disabled={submitting} className="w-2/3 font-extrabold bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white h-11 rounded-full">
                        {submitting ? <CreatorStoreLoader variant="button" text="Saving..." size="xs" /> : 'Save Payout Details'}
                      </Button>
                    </div>
                  </>
                )}
              </form>
            )}

            {/* STEP 4: Verification Loading */}
            {step === 4 && (
              <div className="text-center py-8 space-y-4 flex flex-col items-center justify-center select-none">
                <CreatorStoreLoader size="2xl" badge badgeBg="#000000" className="mx-auto" />
                <h3 className="text-xl font-black text-white mt-3">Verifying Payout Account...</h3>
                <p className="text-xs text-[var(--text-secondary,#A3A3A3)] font-medium">Communicating with payout verification engine.</p>
              </div>
            )}

            {/* STEP 5: Pending Verification */}
            {step === 5 && (
              <div className="text-center py-6 space-y-4">
                <div className="h-16 w-16 bg-[var(--status-warning,#F9B67D)]/15 text-[var(--status-warning,#F9B67D)] rounded-full flex items-center justify-center mx-auto border border-[var(--status-warning,#F9B67D)]/30">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-black text-white">Pending verification</h3>
                <p className="text-xs text-[var(--text-secondary,#A3A3A3)] font-medium">Verification usually completes within 12–24 hours.</p>
                <Button onClick={() => setShowModal(false)} className="w-full font-extrabold bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white h-11 rounded-full">
                  Go to Dashboard
                </Button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}

function PaymentsSkeleton() {
  return (
    <div className="max-w-6xl space-y-8">
      <Skeleton className="h-48 w-full rounded-3xl bg-[var(--bg-surface,#242424)]" />
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-28 w-full rounded-3xl bg-[var(--bg-surface,#242424)]" />
        <Skeleton className="h-28 w-full rounded-3xl bg-[var(--bg-surface,#242424)]" />
        <Skeleton className="h-28 w-full rounded-3xl bg-[var(--bg-surface,#242424)]" />
        <Skeleton className="h-28 w-full rounded-3xl bg-[var(--bg-surface,#242424)]" />
      </div>
    </div>
  )
}
