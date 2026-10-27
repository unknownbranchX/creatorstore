'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/clientApi'
import { toast } from 'sonner'
import {
  Users, Search, Download, Plus, Mail, Tag, Calendar, Sparkles,
  Loader2, AlertCircle, RefreshCw, X, ArrowRight
} from 'lucide-react'
import { useDashboardHeader } from '@/components/dashboard/HeaderContext'
import { useAuth } from '@/components/auth/AuthContext'

export default function CreatorLeadsPage() {
  const { setHeaderConfig } = useDashboardHeader()
  const { subscription } = useAuth()
  const isPro = subscription?.planId === 'PRO' || subscription?.plan === 'PRO' || Boolean(subscription?.entitlements?.dataExport || subscription?.entitlements?.leadExport)
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCaptureModal, setShowCaptureModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newLead, setNewLead] = useState({ name: '', email: '', leadMagnetTitle: 'Free Lead Magnet' })

  useEffect(() => {
    setHeaderConfig({
      title: 'Leads',
      actions: null,
    })
  }, [setHeaderConfig])

  useEffect(() => {
    fetchLeads()
  }, [search])

  function fetchLeads() {
    setLoading(true)
    api.get(`/leads?search=${encodeURIComponent(search)}`)
      .then((res) => {
        setLeads(res.items || [])
        setTotal(res.total || 0)
      })
      .catch((err) => {
        console.error('Failed to load leads:', err)
      })
      .finally(() => setLoading(false))
  }

  async function handleAddLead(e) {
    e.preventDefault()
    if (!newLead.email.trim()) return toast.error('Email address is required')
    setSubmitting(true)
    try {
      const me = await api.get('/me')
      await api.post('/leads/capture', { ...newLead, creatorId: me.user.id })
      toast.success('Lead captured successfully!')
      setShowCaptureModal(false)
      setNewLead({ name: '', email: '', leadMagnetTitle: 'Free Lead Magnet' })
      fetchLeads()
    } catch (err) {
      toast.error(err.message || 'Failed to capture lead')
    } finally {
      setSubmitting(false)
    }
  }

  function exportCSV() {
    if (!isPro) {
      toast.error('Data export is a Pro feature. Upgrade to Pro to export leads.')
      return
    }
    if (!leads.length) return toast.error('No leads to export')
    const headers = 'Name,Email,Source,Lead Magnet,Created At\n'
    const rows = leads.map(l => `"${l.name || ''}","${l.email}","${l.source || 'Storefront'}","${l.leadMagnetTitle || 'Lead Magnet'}","${l.createdAt}"`).join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'creatorstore-leads.csv'
    a.click()
    toast.success('Leads CSV exported successfully')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 text-[#1F1F1F]">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-[24px] bg-[#FFFFFF] border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E3] bg-[#F2F1EF] px-3.5 py-1 text-xs font-bold text-[#1F1F1F] mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Leads &amp; Lead Magnets
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1F] tracking-tight">
            Leads ({total})
          </h1>
          <p className="text-xs sm:text-sm text-[#6F6F6B] font-medium mt-1">
            Capture and manage contacts collected through your lead magnets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={exportCSV}
            disabled={leads.length === 0}
            className="px-4 py-2 rounded-full bg-[#FFFFFF] border border-[#E5E5E3] hover:bg-[#F5F5F3] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-[#1F1F1F] transition-colors flex items-center gap-1.5 cursor-pointer shadow-none"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCaptureModal(true)}
            className="px-5 py-2 rounded-full bg-[#1F1F1F] text-[#FFFFFF] text-xs font-bold hover:bg-[#000000] active:bg-[#111111] transition-colors flex items-center gap-1.5 shadow-none cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-[18px] bg-[#FFFFFF] border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#999995]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads by name or email..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-[#FBFBFB] border border-[#E5E5E3] rounded-full text-[#1F1F1F] placeholder:text-[#999995] focus:outline-none focus:border-[#1F1F1F] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999995] hover:text-[#1F1F1F]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={fetchLeads}
          title="Refresh leads"
          className="p-2 rounded-full bg-[#FFFFFF] border border-[#E5E5E3] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#1F1F1F]' : ''}`} />
        </button>
      </div>

      {/* LEADS TABLE OR EMPTY STATE */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-16 bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] animate-pulse" />
          <div className="h-16 bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] animate-pulse" />
          <div className="h-16 bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] animate-pulse" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-[#FFFFFF] rounded-[24px] p-12 border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)] text-center space-y-4">
          <Users className="h-10 w-10 text-[#999995] mx-auto" />
          <div>
            <h3 className="text-base font-bold text-[#1F1F1F]">
              No leads captured yet
            </h3>
            <p className="text-xs text-[#6F6F6B] max-w-md mx-auto mt-1">
              Start collecting contacts by creating a free lead magnet for your storefront.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/dashboard/products/new"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#1F1F1F] text-[#FFFFFF] text-xs font-bold hover:bg-[#000000] active:bg-[#111111] transition-colors shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Lead Magnet</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E5E5E3] bg-[#FBFBFB] text-[#6F6F6B] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-6">Subscriber</th>
                <th className="py-3.5 px-6">Source &amp; Lead Magnet</th>
                <th className="py-3.5 px-6">Tags</th>
                <th className="py-3.5 px-6 text-right">Captured Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E3] font-medium text-[#1F1F1F]">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-[#F5F5F3] transition-colors">
                  <td className="py-4 px-6">
                    <div className="font-bold text-[#1F1F1F]">{lead.name || 'Anonymous'}</div>
                    <div className="text-[11px] text-[#6F6F6B]">{lead.email}</div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="font-semibold text-[#1F1F1F] block">{lead.leadMagnetTitle || 'Free Lead Magnet'}</span>
                    <span className="text-[10px] text-[#6F6F6B] block">{lead.source || 'Storefront'}</span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex flex-wrap gap-1">
                      {(lead.tags || ['Lead']).map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F2F1EF] text-[#1F1F1F] border border-[#E5E5E3]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right text-[#6F6F6B] font-mono text-[11px]">
                    {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD LEAD MODAL */}
      {showCaptureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5E3] rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E3] bg-[#FFFFFF]">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#1F1F1F]" />
                <h3 className="text-base font-bold text-[#1F1F1F]">
                  Add Lead Contact
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCaptureModal(false)}
                className="p-1.5 rounded-full text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddLead} className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#1F1F1F]">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  placeholder="e.g. Alex Smith"
                  className="w-full text-xs bg-[#FFFFFF] border border-[#E5E5E3] rounded-[14px] px-3.5 py-2.5 text-[#1F1F1F] placeholder:text-[#999995] focus:outline-none focus:border-[#1F1F1F] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#1F1F1F]">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  placeholder="alex.smith@example.com"
                  className="w-full text-xs bg-[#FFFFFF] border border-[#E5E5E3] rounded-[14px] px-3.5 py-2.5 text-[#1F1F1F] placeholder:text-[#999995] focus:outline-none focus:border-[#1F1F1F] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#1F1F1F]">
                  Lead Magnet Resource
                </label>
                <input
                  type="text"
                  value={newLead.leadMagnetTitle}
                  onChange={(e) => setNewLead({ ...newLead, leadMagnetTitle: e.target.value })}
                  placeholder="e.g. 10-Step Creator Roadmap"
                  className="w-full text-xs bg-[#FFFFFF] border border-[#E5E5E3] rounded-[14px] px-3.5 py-2.5 text-[#1F1F1F] placeholder:text-[#999995] focus:outline-none focus:border-[#1F1F1F] transition-colors"
                />
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-[#E5E5E3] gap-2">
                <button
                  type="button"
                  onClick={() => setShowCaptureModal(false)}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-full bg-[#FFFFFF] border border-[#E5E5E3] text-[#1F1F1F] text-xs font-bold hover:bg-[#F5F5F3] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-full bg-[#1F1F1F] text-[#FFFFFF] text-xs font-bold hover:bg-[#000000] active:bg-[#111111] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving Lead...</span>
                    </>
                  ) : (
                    <span>Save Lead</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
