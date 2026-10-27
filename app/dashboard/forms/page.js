'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { BaseModal } from '@/components/ui/base-modal'
import { SelectableCardGrid, SelectableCard } from '@/components/ui/selectable-card'
import AddFormConfig, { FORM_TYPES } from '@/components/dashboard/AddFormConfig'
import { useDashboardHeader } from '@/components/dashboard/HeaderContext'
import {
  Mail, Star, Send, HelpCircle, Plus, Search, Filter,
  CheckCircle2, MessageSquareText, Shield, Trash2,
  ExternalLink, Download, Clock, ArrowRight, Eye, EyeOff,
  Check, UserCheck, AlertCircle, RefreshCw, X, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/AuthContext'

export default function FormsPage() {
  const { setHeaderConfig } = useDashboardHeader()
  const { subscription } = useAuth()
  const isPro = subscription?.planId === 'PRO' || subscription?.plan === 'PRO' || Boolean(subscription?.entitlements?.dataExport || subscription?.entitlements?.leadExport)

  // Primary navigation tabs: 'inbox' | 'forms' | 'subscribers'
  const [activeTab, setActiveTab] = useState('inbox')

  // Data states
  const [stats, setStats] = useState({ totalForms: 0, totalSubmissions: 0, unreadSubmissions: 0, totalSubscribers: 0 })
  const [forms, setForms] = useState(null)
  const [submissions, setSubmissions] = useState(null)
  const [subscribers, setSubscribers] = useState(null)

  // Filters & Pagination for Inbox
  const [filterFormType, setFilterFormType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'unread' | 'read'
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Subscribers search & pagination
  const [subscribersSearch, setSubscribersSearch] = useState('')
  const [subscribersPage, setSubscribersPage] = useState(1)
  const [subscribersTotalPages, setSubscribersTotalPages] = useState(1)

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedCreateType, setSelectedCreateType] = useState('contact')
  const [createStep, setCreateStep] = useState('select') // 'select' | 'configure'
  
  const [editingForm, setEditingForm] = useState(null)
  const [detailSubmission, setDetailSubmission] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Header Config
  useEffect(() => {
    setHeaderConfig({
      title: 'Forms & Responses',
      actions: (
        <Button
          onClick={() => {
            setSelectedCreateType('contact')
            setCreateStep('select')
            setCreateModalOpen(true)
          }}
          className="rounded-full bg-[#1F1F1F] text-white hover:bg-black font-semibold text-xs px-4 h-9 inline-flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Form
        </Button>
      ),
    })
  }, [setHeaderConfig])

  // Load Overview Stats
  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/forms/stats')
      if (res?.stats) setStats(res.stats)
    } catch (err) {
      console.warn('Failed to load form stats:', err)
    }
  }, [])

  // Load Forms List
  const loadForms = useCallback(async () => {
    try {
      const res = await api.get('/forms')
      setForms(res?.forms || [])
    } catch (err) {
      console.error('Failed to load forms:', err)
      setForms([])
      toast.error('Failed to load forms')
    }
  }, [])

  // Load Submissions
  const loadSubmissions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      })
      if (filterFormType !== 'all') params.set('formType', filterFormType)
      if (filterStatus === 'unread') params.set('isRead', 'false')
      if (filterStatus === 'read') params.set('isRead', 'true')
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await api.get(`/forms/submissions?${params.toString()}`)
      setSubmissions(res?.items || [])
      setTotalPages(res?.totalPages || 1)
      if (res?.unreadCount !== undefined) {
        setStats((prev) => ({ ...prev, unreadSubmissions: res.unreadCount }))
      }
    } catch (err) {
      console.error('Failed to load submissions:', err)
      setSubmissions([])
    }
  }, [page, filterFormType, filterStatus, searchQuery])

  // Load Subscribers
  const loadSubscribers = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(subscribersPage),
        limit: '20',
      })
      if (subscribersSearch.trim()) params.set('search', subscribersSearch.trim())

      const res = await api.get(`/forms/subscribers?${params.toString()}`)
      setSubscribers(res?.items || [])
      setSubscribersTotalPages(res?.totalPages || 1)
    } catch (err) {
      console.error('Failed to load subscribers:', err)
      setSubscribers([])
    }
  }, [subscribersPage, subscribersSearch])

  // Trigger Data Fetching
  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    if (activeTab === 'forms') {
      loadForms()
    } else if (activeTab === 'inbox') {
      loadSubmissions()
    } else if (activeTab === 'subscribers') {
      loadSubscribers()
    }
  }, [activeTab, loadForms, loadSubmissions, loadSubscribers])

  // Mark single submission read/unread
  async function toggleReadStatus(sub) {
    try {
      const newRead = !sub.isRead
      await api.patch(`/forms/submissions/${sub.id}`, { isRead: newRead })
      setSubmissions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, isRead: newRead } : s))
      )
      loadStats()
      toast.success(newRead ? 'Marked as read' : 'Marked as unread')
    } catch (err) {
      toast.error('Failed to update status')
    }
  }

  // Mark all submissions read
  async function markAllRead() {
    try {
      await api.post('/forms/submissions/mark-all-read', {})
      setSubmissions((prev) => (prev ? prev.map((s) => ({ ...s, isRead: true })) : []))
      loadStats()
      toast.success('All submissions marked as read')
    } catch (err) {
      toast.error('Failed to mark all as read')
    }
  }

  // Delete submission
  async function deleteSubmission(id) {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) return
    try {
      await api.delete(`/forms/submissions/${id}`)
      setSubmissions((prev) => prev.filter((s) => s.id !== id))
      loadStats()
      toast.success('Submission deleted')
      if (detailSubmission?.id === id) setDetailSubmission(null)
    } catch (err) {
      toast.error('Failed to delete submission')
    }
  }

  // Update submission status (e.g. Q&A approved / active)
  async function updateSubmissionStatus(id, newStatus) {
    try {
      await api.patch(`/forms/submissions/${id}`, { status: newStatus })
      setSubmissions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
      )
      if (detailSubmission?.id === id) {
        setDetailSubmission((prev) => ({ ...prev, status: newStatus }))
      }
      toast.success(`Question status updated to ${newStatus}`)
    } catch (err) {
      toast.error('Failed to update status')
    }
  }

  // Toggle form published / draft
  async function toggleFormStatus(form) {
    const nextStatus = form.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    try {
      const res = await api.patch(`/forms/${form.id}`, { status: nextStatus })
      setForms((prev) =>
        prev.map((f) => (f.id === form.id ? { ...f, status: nextStatus } : f))
      )
      toast.success(nextStatus === 'PUBLISHED' ? 'Form published to storefront!' : 'Form saved as draft')
    } catch (err) {
      toast.error('Failed to change form status')
    }
  }

  // Delete form
  async function deleteForm(form) {
    if (!confirm(`Are you sure you want to delete "${form.title}"? Existing submissions will remain preserved in your archive.`)) return
    try {
      await api.delete(`/forms/${form.id}`)
      setForms((prev) => prev.filter((f) => f.id !== form.id))
      loadStats()
      toast.success('Form deleted')
    } catch (err) {
      toast.error('Failed to delete form')
    }
  }

  // Handle Form Save (Create or Edit)
  async function handleSaveForm(formPayload) {
    setIsSaving(true)
    try {
      if (editingForm) {
        const res = await api.patch(`/forms/${editingForm.id}`, formPayload)
        toast.success('Form updated successfully!')
        setEditingForm(null)
        loadForms()
      } else {
        const res = await api.post('/forms', {
          ...formPayload,
          addToStore: true,
          status: 'PUBLISHED',
        })
        toast.success('New form created and added to your store!')
        setCreateModalOpen(false)
        setCreateStep('select')
        loadForms()
        loadStats()
      }
    } catch (err) {
      console.error('Failed to save form:', err)
      toast.error(err.message || 'Failed to save form')
    } finally {
      setIsSaving(false)
    }
  }

  // Unsubscribe / Resubscribe toggle for newsletter
  async function toggleSubscriberStatus(sub) {
    const nextStatus = sub.status === 'SUBSCRIBED' ? 'UNSUBSCRIBED' : 'SUBSCRIBED'
    try {
      await api.patch(`/forms/subscribers/${sub.id}`, { status: nextStatus })
      setSubscribers((prev) =>
        prev.map((item) => (item.id === sub.id ? { ...item, status: nextStatus } : item))
      )
      loadStats()
      toast.success(nextStatus === 'SUBSCRIBED' ? 'Subscriber reactivated' : 'Subscriber unsubscribed')
    } catch (err) {
      toast.error('Failed to update subscriber status')
    }
  }

  // Export Subscribers to CSV
  function exportSubscribersCSV() {
    if (!isPro) {
      toast.error('Data export is a Pro feature. Upgrade to Pro to export subscribers.')
      return
    }
    if (!subscribers || subscribers.length === 0) {
      toast.error('No subscribers to export')
      return
    }
    const headers = ['Email', 'Name', 'Status', 'Consent Given', 'Subscribed At']
    const rows = subscribers.map((s) => [
      s.email,
      s.name || '',
      s.status,
      s.consentGiven ? 'YES' : 'NO',
      new Date(s.createdAt).toISOString(),
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `creatorstore_subscribers_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Exported subscribers CSV!')
  }

  return (
    <div className="space-y-6 text-[#1F1F1F] min-w-0 pb-16">
      
      {/* 1. Overview Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EAE9E6] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B7280]">
            <span>Total Forms</span>
            <FileText className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-[#111827]">{stats.totalForms}</p>
          <p className="text-[11px] text-[#9CA3AF]">Active on your storefront</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EAE9E6] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B7280]">
            <span>Total Responses</span>
            <MessageSquareText className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-[#111827]">{stats.totalSubmissions}</p>
          <p className="text-[11px] text-[#9CA3AF]">Inquiries, reviews & Q&A</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EAE9E6] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B7280]">
            <span>Unread Responses</span>
            <Mail className="h-4 w-4 text-rose-600" />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-black text-[#111827]">{stats.unreadSubmissions}</p>
            {stats.unreadSubmissions > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                Action required
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#9CA3AF]">Awaiting your review</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EAE9E6] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B7280]">
            <span>Newsletter Subscribers</span>
            <Send className="h-4 w-4 text-pink-600" />
          </div>
          <p className="text-2xl font-black text-[#111827]">{stats.totalSubscribers}</p>
          <p className="text-[11px] text-[#9CA3AF]">Active marketing subscribers</p>
        </div>
      </div>

      {/* 2. Top Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#EAE9E6] pb-3 gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'inbox'
                ? 'bg-[#1F1F1F] text-white shadow-sm'
                : 'bg-white text-[#6B7280] hover:text-[#111827] hover:bg-[#F2F1EF] border border-[#EAE9E6]'
            }`}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            <span>Submissions Inbox</span>
            {stats.unreadSubmissions > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                {stats.unreadSubmissions}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('forms')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'forms'
                ? 'bg-[#1F1F1F] text-white shadow-sm'
                : 'bg-white text-[#6B7280] hover:text-[#111827] hover:bg-[#F2F1EF] border border-[#EAE9E6]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Forms Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subscribers')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'subscribers'
                ? 'bg-[#1F1F1F] text-white shadow-sm'
                : 'bg-white text-[#6B7280] hover:text-[#111827] hover:bg-[#F2F1EF] border border-[#EAE9E6]'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Newsletter Subscribers</span>
          </button>
        </div>

        {activeTab === 'inbox' && stats.unreadSubmissions > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-xs font-medium text-[#4B5563] hover:text-[#111827] underline cursor-pointer shrink-0"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* ---------------- TAB 1: SUBMISSIONS INBOX ---------------- */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          {/* Filters & Search Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#EAE9E6] shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#6B7280] flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Filter:
              </span>
              
              {/* Type Pills */}
              {['all', 'contact', 'feedback', 'newsletter', 'qa'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setFilterFormType(type); setPage(1) }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize ${
                    filterFormType === type
                      ? 'bg-[#1F1F1F] text-white'
                      : 'bg-[#F9F9F8] text-[#4B5563] hover:bg-[#EAE9E6]'
                  }`}
                >
                  {type === 'qa' ? 'Q&A' : type}
                </button>
              ))}

              <span className="text-[#D1D5DB] mx-1">|</span>

              {/* Status Pills */}
              {['all', 'unread', 'read'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => { setFilterStatus(st); setPage(1) }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize ${
                    filterStatus === st
                      ? 'bg-[#1F1F1F] text-white'
                      : 'bg-[#F9F9F8] text-[#4B5563] hover:bg-[#EAE9E6]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="h-3.5 w-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search name, email, message..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                className="pl-8 text-xs h-8 rounded-xl bg-[#F9F9F8] border-[#EAE9E6] text-[#111827] focus:border-[#1F1F1F]"
              />
            </div>
          </div>

          {/* Submissions List */}
          {submissions === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl bg-white" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border-2 border-dashed border-[#EAE9E6] bg-white space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#F3F4F6] text-[#6B7280] flex items-center justify-center mx-auto">
                <MessageSquareText className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-[#111827]">No submissions found</h4>
              <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
                {searchQuery || filterFormType !== 'all' || filterStatus !== 'all'
                  ? 'No responses match your current search and filters. Try clearing filters.'
                  : 'Form submissions from your storefront visitors will appear here automatically.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => {
                const subMeta = FORM_TYPES.find((f) => f.id === sub.formType) || FORM_TYPES[0]
                const TypeIcon = subMeta.icon
                const answers = sub.answers || {}

                return (
                  <div
                    key={sub.id}
                    className={`p-4 sm:p-5 rounded-2xl bg-white border transition-all ${
                      sub.isRead ? 'border-[#EAE9E6]' : 'border-rose-200 shadow-sm bg-rose-50/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Icon badge */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${subMeta.iconBg}`}>
                          <TypeIcon className={`h-4 w-4 ${subMeta.iconColor}`} />
                        </div>

                        {/* Summary details */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[#111827]">
                              {sub.name || sub.email || (sub.formType === 'qa' ? 'Anonymous Question' : 'Visitor')}
                            </span>

                            <Badge className="text-[10px] font-semibold bg-[#F3F4F6] text-[#4B5563] border-none">
                              {sub.formTitle || subMeta.label}
                            </Badge>

                            {!sub.isRead && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                Unread
                              </span>
                            )}

                            {sub.formType === 'qa' && (
                              <Badge className={`text-[10px] font-semibold border-none ${
                                sub.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                              }`}>
                                {sub.status || 'PENDING'}
                              </Badge>
                            )}

                            <span className="text-[11px] text-[#9CA3AF] ml-auto">
                              {new Date(sub.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Email address link */}
                          {sub.email && (
                            <p className="text-xs text-[#4B5563] font-medium">
                              <a href={`mailto:${sub.email}`} className="text-[#2563EB] hover:underline">
                                {sub.email}
                              </a>
                              {answers.phone && <span className="text-[#9CA3AF] ml-2">Phone: {answers.phone}</span>}
                            </p>
                          )}

                          {/* Feedback Star Rating */}
                          {sub.formType === 'feedback' && sub.rating && (
                            <div className="flex items-center gap-1 pt-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`h-4 w-4 ${
                                    s <= sub.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                                  }`}
                                />
                              ))}
                              <span className="text-xs font-bold text-[#111827] ml-1.5">
                                {sub.rating} / 5 Stars
                              </span>
                            </div>
                          )}

                          {/* Message or Question preview */}
                          {sub.message && (
                            <p className="text-xs text-[#374151] pt-1 leading-relaxed bg-[#F9F9F8] p-3 rounded-xl border border-[#EAE9E6]">
                              {sub.message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quick Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleReadStatus(sub)}
                          title={sub.isRead ? 'Mark unread' : 'Mark read'}
                          className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                        >
                          {sub.isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-rose-500" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setDetailSubmission(sub)}
                          title="View full details"
                          className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteSubmission(sub.id)}
                          title="Delete submission"
                          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs font-medium text-[#6B7280]">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-full border-[#EAE9E6] text-xs h-8"
              >
                Previous
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full border-[#EAE9E6] text-xs h-8"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 2: FORMS OVERVIEW ---------------- */}
      {activeTab === 'forms' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Your Active & Draft Forms</h3>
              <p className="text-xs text-[#6B7280]">Forms configured and attached to your CreatorStore storefront.</p>
            </div>
            <Button
              onClick={() => {
                setSelectedCreateType('contact')
                setCreateStep('select')
                setCreateModalOpen(true)
              }}
              size="sm"
              className="rounded-full bg-[#1F1F1F] text-white hover:bg-black font-semibold text-xs h-8 inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Another Form
            </Button>
          </div>

          {forms === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white" />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border-2 border-dashed border-[#EAE9E6] bg-white space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#F3F4F6] text-[#6B7280] flex items-center justify-center mx-auto">
                <FileText className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-[#111827]">No forms created yet</h4>
              <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
                Create a contact form, client feedback form, newsletter signup, or Q&A box for your storefront.
              </p>
              <Button
                onClick={() => {
                  setSelectedCreateType('contact')
                  setCreateStep('select')
                  setCreateModalOpen(true)
                }}
                className="rounded-full bg-[#1F1F1F] text-white hover:bg-black font-semibold text-xs mt-2"
              >
                Create Your First Form
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forms.map((f) => {
                const fMeta = FORM_TYPES.find((item) => item.id === f.formType) || FORM_TYPES[0]
                const FormIcon = fMeta.icon
                const isPublished = f.status === 'PUBLISHED'

                return (
                  <div
                    key={f.id}
                    className="p-5 rounded-2xl bg-white border border-[#EAE9E6] shadow-sm flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${fMeta.iconBg}`}>
                            <FormIcon className={`h-5 w-5 ${fMeta.iconColor}`} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-[#111827]">{f.title}</h4>
                            <p className="text-xs text-[#6B7280]">{fMeta.label}</p>
                          </div>
                        </div>

                        <Badge
                          className={`text-xs font-semibold border-none cursor-pointer ${
                            isPublished
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                          }`}
                          onClick={() => toggleFormStatus(f)}
                          title="Click to toggle status"
                        >
                          {isPublished ? 'Live on Store' : 'Draft / Hidden'}
                        </Badge>
                      </div>

                      {f.description && (
                        <p className="text-xs text-[#4B5563] line-clamp-2 leading-relaxed">
                          {f.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-[#6B7280] pt-1">
                        <span className="font-semibold text-[#111827]">
                          {f.submissionCount || 0} response{f.submissionCount === 1 ? '' : 's'}
                        </span>
                        {f.notificationEmail && (
                          <span className="truncate max-w-[200px]" title={f.notificationEmail}>
                            Alerts: {f.notificationEmail}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#EAE9E6]">
                      <button
                        type="button"
                        onClick={() => toggleFormStatus(f)}
                        className="text-xs font-medium text-[#4B5563] hover:text-[#111827] cursor-pointer"
                      >
                        {isPublished ? 'Unpublish to Draft' : 'Publish to Store'}
                      </button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingForm(f)}
                          className="rounded-full border-[#EAE9E6] text-xs h-7 px-3"
                        >
                          Edit Settings
                        </Button>
                        <button
                          type="button"
                          onClick={() => deleteForm(f)}
                          className="p-1.5 text-[#9CA3AF] hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete form"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 3: NEWSLETTER SUBSCRIBERS ---------------- */}
      {activeTab === 'subscribers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Newsletter Subscribers</h3>
              <p className="text-xs text-[#6B7280]">Audience contacts who signed up via your storefront newsletter form.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportSubscribersCSV}
                className="rounded-full border-[#EAE9E6] text-xs h-8 inline-flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="h-3.5 w-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search subscribers by email..."
              value={subscribersSearch}
              onChange={(e) => { setSubscribersSearch(e.target.value); setSubscribersPage(1) }}
              className="pl-8 text-xs h-8 rounded-xl bg-white border-[#EAE9E6]"
            />
          </div>

          {subscribers === null ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl bg-white" />
              ))}
            </div>
          ) : subscribers.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border-2 border-dashed border-[#EAE9E6] bg-white space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#F3F4F6] text-[#6B7280] flex items-center justify-center mx-auto">
                <Send className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-[#111827]">No subscribers found</h4>
              <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
                Add a Newsletter Signup form block to your store to begin collecting email subscribers with verified consent.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#EAE9E6] overflow-hidden shadow-sm">
              <div className="divide-y divide-[#EAE9E6]">
                {subscribers.map((sub) => (
                  <div key={sub.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#111827] truncate">{sub.email}</p>
                        {sub.name && (
                          <span className="text-xs text-[#6B7280]">({sub.name})</span>
                        )}
                        <Badge className={`text-[10px] font-semibold border-none ${
                          sub.status === 'SUBSCRIBED' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {sub.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[#9CA3AF]">
                        <span>Consent: {sub.consentGiven ? 'Verified Explicit' : 'Standard'}</span>
                        <span>•</span>
                        <span>Joined: {new Date(sub.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSubscriberStatus(sub)}
                      className="text-xs font-medium text-[#4B5563] hover:text-[#111827] underline cursor-pointer shrink-0"
                    >
                      {sub.status === 'SUBSCRIBED' ? 'Unsubscribe' : 'Reactivate'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {subscribersTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs font-medium text-[#6B7280]">
              <Button
                variant="outline"
                size="sm"
                disabled={subscribersPage <= 1}
                onClick={() => setSubscribersPage((p) => p - 1)}
                className="rounded-full border-[#EAE9E6] text-xs h-8"
              >
                Previous
              </Button>
              <span>Page {subscribersPage} of {subscribersTotalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={subscribersPage >= subscribersTotalPages}
                onClick={() => setSubscribersPage((p) => p + 1)}
                className="rounded-full border-[#EAE9E6] text-xs h-8"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- MODAL 1: CREATE FORM ---------------- */}
      <BaseModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        title={createStep === 'select' ? 'Add a Form to Your Store' : 'Configure Form'}
        description={
          createStep === 'select'
            ? 'Choose the type of form you want to create and display on your storefront.'
            : 'Customize prompts, required fields, and notification preferences.'
        }
      >
        {createStep === 'select' ? (
          <div className="space-y-4">
            <SelectableCardGrid>
              {FORM_TYPES.map((typeItem) => {
                const ItemIcon = typeItem.icon
                return (
                  <SelectableCard
                    key={typeItem.id}
                    selected={selectedCreateType === typeItem.id}
                    onSelect={() => setSelectedCreateType(typeItem.id)}
                    icon={<ItemIcon className={`h-5 w-5 ${typeItem.iconColor}`} />}
                    title={typeItem.label}
                    description={typeItem.description}
                  />
                )
              })}
            </SelectableCardGrid>

            <div className="pt-2 flex justify-end">
              <Button
                onClick={() => setCreateStep('configure')}
                className="rounded-full bg-[#1F1F1F] text-white hover:bg-black font-semibold text-xs px-6 h-10"
              >
                Continue to Settings
              </Button>
            </div>
          </div>
        ) : (
          <AddFormConfig
            formType={selectedCreateType}
            onCancel={() => setCreateStep('select')}
            onSubmit={handleSaveForm}
            isSubmitting={isSaving}
          />
        )}
      </BaseModal>

      {/* ---------------- MODAL 2: EDIT FORM ---------------- */}
      <BaseModal
        open={Boolean(editingForm)}
        onOpenChange={(open) => !open && setEditingForm(null)}
        title="Edit Form Configuration"
        description="Update form title, visitor prompts, field settings, or notification address."
      >
        {editingForm && (
          <AddFormConfig
            formType={editingForm.formType}
            initialProps={editingForm}
            isEditing
            onCancel={() => setEditingForm(null)}
            onSubmit={handleSaveForm}
            isSubmitting={isSaving}
          />
        )}
      </BaseModal>

      {/* ---------------- MODAL 3: SUBMISSION DETAILS ---------------- */}
      <BaseModal
        open={Boolean(detailSubmission)}
        onOpenChange={(open) => !open && setDetailSubmission(null)}
        title="Form Response Details"
        description={`Submitted on ${detailSubmission ? new Date(detailSubmission.createdAt).toLocaleString() : ''}`}
      >
        {detailSubmission && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#F9F9F8] border border-[#EAE9E6] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#111827]">Form</span>
                <span>{detailSubmission.formTitle} ({detailSubmission.formType})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#111827]">Sender Name</span>
                <span>{detailSubmission.name || 'Not provided'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#111827]">Sender Email</span>
                <span>
                  {detailSubmission.email ? (
                    <a href={`mailto:${detailSubmission.email}`} className="text-blue-600 hover:underline">
                      {detailSubmission.email}
                    </a>
                  ) : 'Not provided'}
                </span>
              </div>
              {detailSubmission.rating && (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#111827]">Rating</span>
                  <span className="font-bold text-amber-500">{detailSubmission.rating} / 5 Stars</span>
                </div>
              )}
            </div>

            {detailSubmission.message && (
              <div className="space-y-1">
                <label className="font-semibold text-[#111827] block">Message / Question</label>
                <div className="p-3.5 rounded-xl bg-[#F9F9F8] border border-[#EAE9E6] leading-relaxed whitespace-pre-wrap">
                  {detailSubmission.message}
                </div>
              </div>
            )}

            {detailSubmission.formType === 'qa' && (
              <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-950">Q&A Moderation</span>
                  <Badge className="bg-blue-100 text-blue-800 border-none">
                    Status: {detailSubmission.status || 'PENDING'}
                  </Badge>
                </div>
                <p className="text-[11px] text-blue-900 leading-normal">
                  Questions are kept private by default. You can approve this question or reply to the visitor via email.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  {detailSubmission.status !== 'APPROVED' ? (
                    <Button
                      size="sm"
                      onClick={() => updateSubmissionStatus(detailSubmission.id, 'APPROVED')}
                      className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 text-xs h-7 px-3"
                    >
                      Approve Question
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateSubmissionStatus(detailSubmission.id, 'PENDING')}
                      className="rounded-full text-xs h-7 px-3"
                    >
                      Mark Pending
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[#EAE9E6]">
              {detailSubmission.email ? (
                <a
                  href={`mailto:${detailSubmission.email}?subject=Regarding your message on CreatorStore`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1F1F1F] text-white font-semibold text-xs hover:bg-black transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Reply via Email
                </a>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleReadStatus(detailSubmission)}
                  className="rounded-full text-xs h-8"
                >
                  {detailSubmission.isRead ? 'Mark as Unread' : 'Mark as Read'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteSubmission(detailSubmission.id)}
                  className="rounded-full text-red-600 hover:bg-red-50 text-xs h-8"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </BaseModal>
    </div>
  )
}
