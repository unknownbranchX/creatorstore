'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, formatMoney } from '@/lib/clientApi'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Sparkles, TrendingUp, Users, ShoppingBag, Eye, Percent, Bot, MessageSquare, MousePointer, DollarSign, Zap, Globe, Package, Download, RotateCcw } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

import { useDashboardHeader } from '@/components/dashboard/HeaderContext'

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const { setHeaderConfig, setPricingModalOpen } = useDashboardHeader()

  useEffect(() => {
    setHeaderConfig({
      title: 'Analytics',
      actions: (
        <div className="flex items-center gap-1 p-1 bg-[#F2F1EF] rounded-full border border-[#E5E5E3]">
          {[
            { label: '7D', value: 7 },
            { label: '30D', value: 30 },
            { label: '90D', value: 90, pro: true },
            { label: 'All', value: 365, pro: true },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setDays(item.value)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                days === item.value
                  ? 'bg-[#1F1F1F] text-white shadow-none'
                  : 'text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#FFFFFF]'
              }`}
            >
              {item.label}
              {item.pro && <Zap className="h-2.5 w-2.5 text-[#D97706]" />}
            </button>
          ))}
        </div>
      ),
    })
  }, [days, setHeaderConfig])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setUpgradeRequired(false)
    api.get(`/analytics/overview?days=${days}`)
      .then((d) => {
        if (mounted) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (mounted) {
          setLoading(false)
          if (err?.status === 403 || err?.code === 'PLAN_UPGRADE_REQUIRED' || (err?.message && err.message.includes('Upgrade to Pro'))) {
            setUpgradeRequired(true)
          }
        }
      })
    return () => { mounted = false }
  }, [days])

  const cur = data?.currency || 'usd'

  const funnel = data ? [
    { stage: 'Store Views', value: data.storeViews ?? 0 },
    { stage: 'Product Views', value: data.productViews ?? 0 },
    { stage: 'Checkouts', value: data.checkoutStarted ?? 0 },
    { stage: 'Paid Orders', value: data.orders ?? 0 },
  ] : []

  const ig = data?.instagram || {
    comments: 0,
    dmsSent: 0,
    dmFailures: 0,
    dmSuccessRate: 0,
    clicks: 0,
    checkouts: 0,
    purchases: 0,
    revenue: 0,
    conversionRate: 0,
  }

  const stats = [
    { label: `${days}-Day Net Revenue`, value: formatMoney(data?.netRevenue ?? data?.revenue ?? 0, cur), icon: TrendingUp, highlight: true },
    { label: 'Gross Sales', value: formatMoney(data?.grossRevenue ?? data?.revenue ?? 0, cur), icon: DollarSign },
    { label: 'Refunds Total', value: `${formatMoney(data?.refundsTotal ?? 0, cur)} (${data?.refundCount ?? 0})`, icon: RotateCcw },
    { label: 'Total Orders', value: data?.orders ?? 0, icon: ShoppingBag },
    { label: 'Conversion Rate', value: `${data?.conversion ?? 0}%`, icon: Percent },
    { label: 'Storefront Views', value: (data?.storeViews ?? 0).toLocaleString(), icon: Eye },
    { label: 'Product Views', value: (data?.productViews ?? 0).toLocaleString(), icon: Package },
    { label: 'Checkout Clicks', value: (data?.checkoutStarted ?? 0).toLocaleString(), icon: MousePointer },
  ]

  const trafficSources = data?.trafficSources || []
  const productPerformance = data?.productPerformance || data?.topProducts || []

  return (
    <div className="space-y-6 text-[#1F1F1F]">

      {/* Subtitle Banner with Data Export Link */}
      <div className="bg-[#FFFFFF] p-6 sm:p-8 rounded-[24px] border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] bg-[#F2F1EF] px-3.5 py-1 rounded-full border border-[#E5E5E3] mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Performance &amp; Attribution Metrics
          </div>
          <p className="text-xs sm:text-sm text-[#6F6F6B] font-medium">Real-time storefront performance, verified net revenue, traffic sources, and conversion funnels.</p>
        </div>
        <Link href="/dashboard/settings">
          <Button variant="outline" size="sm" className="font-bold text-xs bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] hover:bg-[#F5F5F3] rounded-full shrink-0 gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export Data (CSV)
          </Button>
        </Link>
      </div>

      {/* Pro Upgrade Prompt Banner (when 90D/All requested by non-Pro) */}
      {upgradeRequired && (
        <div className="bg-[#FFFBEB] p-6 sm:p-8 rounded-[24px] border border-[#FDE68A] shadow-[0_8px_30px_rgba(217,119,6,0.06)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-black text-[#92400E] bg-[#FEF3C7] px-3 py-0.5 rounded-full border border-[#FDE68A]">
              <Zap className="h-3.5 w-3.5 text-[#D97706]" /> Pro Analytics Feature
            </div>
            <h3 className="text-base font-extrabold text-[#92400E]">
              Extended {days}-day analytics requires a Pro subscription
            </h3>
            <p className="text-xs text-[#B45309]">
              Creator plans include 30-day analytics. Upgrade to Pro to unlock 90-day and all-time reporting, refund tracking, traffic source breakdowns, and complete business data exports.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDays(30)}
              className="text-xs font-bold rounded-full bg-white border-[#FDE68A] text-[#92400E]"
            >
              Back to 30D
            </Button>
            <Button
              size="sm"
              onClick={() => setPricingModalOpen(true)}
              className="text-xs font-black rounded-full bg-[#1F1F1F] hover:bg-black text-white"
            >
              Upgrade to Pro
            </Button>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[24px] border border-[#E5E5E3] bg-[#FFFFFF] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#F2F1EF] text-[#1F1F1F] border border-[#E5E5E3]">
              <s.icon className="h-5 w-5" />
            </div>
            {loading ? <Skeleton className="mt-4 h-8 w-24 rounded-lg bg-[#F2F1EF]" /> : <p className="mt-4 text-2xl sm:text-3xl font-extrabold text-[#1F1F1F] tracking-tight">{s.value}</p>}
            <p className="mt-1 text-xs font-bold text-[#6F6F6B] tracking-wide uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Traffic Sources & Product Performance (Pro Insights) */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Traffic Sources Breakdown */}
        <div className="rounded-[24px] border border-[#E5E5E3] bg-[#FFFFFF] p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#1F1F1F]" />
              <h2 className="font-extrabold text-base text-[#1F1F1F]">Traffic Sources Breakdown</h2>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#6F6F6B] bg-[#F2F1EF] px-2.5 py-1 rounded-full border border-[#E5E5E3]">
              {days}D Traffic
            </span>
          </div>

          {loading ? (
            <Skeleton className="h-48 w-full rounded-[18px] bg-[#F2F1EF]" />
          ) : trafficSources.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6F6F6B] rounded-[18px] border border-dashed border-[#E5E5E3] bg-[#FBFBFB]">
              No external traffic sources recorded yet for this period. Direct visits are not attributed to third-party referrers.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {trafficSources.map((ts) => (
                <div key={ts.source} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1F1F1F]">
                    <span>{ts.source}</span>
                    <span className="text-[#6F6F6B]">{ts.count} visits ({ts.percentage}%)</span>
                  </div>
                  <div className="h-2 w-full bg-[#F2F1EF] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1F1F1F] rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(5, ts.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Performance Deep-Dive */}
        <div className="rounded-[24px] border border-[#E5E5E3] bg-[#FFFFFF] p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-[#1F1F1F]" />
              <h2 className="font-extrabold text-base text-[#1F1F1F]">Top Performing Products</h2>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#6F6F6B] bg-[#F2F1EF] px-2.5 py-1 rounded-full border border-[#E5E5E3]">
              Sales &amp; Conversion
            </span>
          </div>

          {loading ? (
            <Skeleton className="h-48 w-full rounded-[18px] bg-[#F2F1EF]" />
          ) : productPerformance.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6F6F6B] rounded-[18px] border border-dashed border-[#E5E5E3] bg-[#FBFBFB]">
              No product sales recorded yet for this period.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {productPerformance.slice(0, 5).map((p) => (
                <div key={p.id} className="p-3 rounded-[16px] bg-[#FBFBFB] border border-[#E5E5E3] flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#1F1F1F] truncate">{p.title || 'Untitled Product'}</p>
                    <p className="text-[11px] text-[#6F6F6B] mt-0.5">
                      {p.unitsSold ?? 0} units sold {p.views ? `· ${p.views} views (${p.conversion ?? 0}% conv)` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-[#1F1F1F]">{formatMoney(p.netRevenue ?? p.revenue ?? 0, cur)}</p>
                    {p.refundsTotal > 0 && (
                      <p className="text-[10px] text-[#DC2626]">-{formatMoney(p.refundsTotal, cur)} refunded</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Instagram Automation Attribution Metrics Card */}
      <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] p-6 sm:p-8 space-y-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#F2F1EF] text-[#1F1F1F] rounded-[16px] border border-[#E5E5E3]">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#1F1F1F] tracking-tight">Instagram Conversion Attribution</h2>
              <p className="text-xs text-[#6F6F6B]">Verified sales attributable to Instagram Comment → DM automations.</p>
            </div>
          </div>
          <span className="text-xs font-black text-[#1F1F1F] bg-[#F2F1EF] px-3.5 py-1.5 rounded-full border border-[#E5E5E3]">
            Conv. Rate: {ig.conversionRate}%
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3]">
            <span className="text-[10px] font-bold text-[#6F6F6B] uppercase tracking-wider block">Comments</span>
            <p className="text-2xl font-black text-[#1F1F1F] mt-1">{ig.comments.toLocaleString()}</p>
          </div>

          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3]">
            <span className="text-[10px] font-bold text-[#6F6F6B] uppercase tracking-wider block">DMs Sent</span>
            <p className="text-2xl font-black text-[#16A34A] mt-1">{ig.dmsSent.toLocaleString()}</p>
            <span className="text-[10px] text-[#6F6F6B]">{ig.dmSuccessRate}% success</span>
          </div>

          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3]">
            <span className="text-[10px] font-bold text-[#6F6F6B] uppercase tracking-wider block">DM Clicks</span>
            <p className="text-2xl font-black text-[#1F1F1F] mt-1">{ig.clicks.toLocaleString()}</p>
          </div>

          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3]">
            <span className="text-[10px] font-bold text-[#6F6F6B] uppercase tracking-wider block">Checkouts</span>
            <p className="text-2xl font-black text-[#1F1F1F] mt-1">{ig.checkouts.toLocaleString()}</p>
          </div>

          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3]">
            <span className="text-[10px] font-bold text-[#6F6F6B] uppercase tracking-wider block">IG Purchases</span>
            <p className="text-2xl font-black text-[#1F1F1F] mt-1">{ig.purchases.toLocaleString()}</p>
          </div>

          <div className="bg-[#FBFBFB] p-4 rounded-[18px] border border-[#E5E5E3] col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-[#6F6F6B] uppercase tracking-wider block">IG Revenue</span>
            <p className="text-2xl font-black text-[#1F1F1F] mt-1">₹{ig.revenue.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Revenue Area Chart */}
        <div className="rounded-[24px] border border-[#E5E5E3] bg-[#FFFFFF] p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-4">
          <div>
            <h2 className="font-extrabold text-lg text-[#1F1F1F]">Revenue Trajectory</h2>
            <p className="text-xs text-[#6F6F6B] font-medium">Daily net revenue progression over the selected period</p>
          </div>

          <div className="h-64 pt-2">
            {loading ? <Skeleton className="h-full w-full rounded-[18px] bg-[#F2F1EF]" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.revenueSeries || []}>
                  <defs>
                    <linearGradient id="anGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1F1F1F" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#1F1F1F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6F6F6B' }} tickFormatter={(d) => d.slice(5)} minTickGap={24} stroke="#E5E5E3" />
                  <YAxis tick={{ fontSize: 11, fill: '#6F6F6B' }} width={45} stroke="#E5E5E3" />
                  <Tooltip formatter={(v) => formatMoney(v, cur)} contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E5E5E3', color: '#1F1F1F', fontSize: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.04)' }} />
                  <Area type="monotone" dataKey="value" stroke="#1F1F1F" strokeWidth={2.5} fill="url(#anGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="rounded-[24px] border border-[#E5E5E3] bg-[#FFFFFF] p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-4">
          <div>
            <h2 className="font-extrabold text-lg text-[#1F1F1F]">Conversion Funnel</h2>
            <p className="text-xs text-[#6F6F6B] font-medium">Visitor drop-off from storefront views to paid orders</p>
          </div>

          <div className="h-64 pt-2">
            {loading ? <Skeleton className="h-full w-full rounded-[18px] bg-[#F2F1EF]" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E5E3" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6F6F6B' }} allowDecimals={false} stroke="#E5E5E3" />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 11, fill: '#6F6F6B', fontWeight: 600 }} width={100} stroke="#E5E5E3" />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E5E5E3', color: '#1F1F1F', fontSize: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" fill="#1F1F1F" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

    </div>
  )
}
