'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { api } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Bot, Plus, Loader2, Instagram, CheckCircle2, PauseCircle, PlayCircle,
  Edit, Trash2, ArrowRight, MessageSquare, Sparkles, AlertTriangle, ExternalLink,
  MoreHorizontal, Link as LinkIcon, Zap, Send, Eye, MousePointerClick, ShoppingBag, Clock
} from 'lucide-react'

import { useDashboardHeader } from '@/components/dashboard/HeaderContext'
import CreateAutomationModal from '@/components/automations/CreateAutomationModal'
import ConnectInstagramModal from '@/components/automations/ConnectInstagramModal'
import QueueActivityTab from '@/components/automations/QueueActivityTab'

export default function AutomationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [checkingConnection, setCheckingConnection] = useState(false)
  const [automations, setAutomations] = useState([])
  const [igAccount, setIgAccount] = useState({ connected: false })
  const [actionLoading, setActionLoading] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('ACTIVE') // 'ACTIVE' | 'ARCHIVED' | 'ALL'

  const { setHeaderConfig } = useDashboardHeader()

  async function handleStartCreate() {
    if (checkingConnection) return
    setCheckingConnection(true)
    try {
      const statusRes = await api.get('/integrations/instagram/status').catch(() => ({ connected: false }))
      setIgAccount(statusRes || { connected: false })
      if (statusRes?.connected) {
        setCreateOpen(true)
      } else {
        setConnectModalOpen(true)
      }
    } catch (err) {
      console.error('Failed to verify Instagram connection:', err)
      setConnectModalOpen(true)
    } finally {
      setCheckingConnection(false)
    }
  }

  useEffect(() => {
    setHeaderConfig({
      title: 'Automations',
      actions: (
        <Button
          onClick={handleStartCreate}
          disabled={checkingConnection}
          className="bg-[#1F1F1F] text-white font-bold text-xs h-10 px-5 rounded-full hover:bg-[#000000] active:bg-[#111111] flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
        >
          {checkingConnection ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Plus className="h-4 w-4 stroke-[3]" />
          )}
          Create Automation
        </Button>
      )
    })
  }, [setHeaderConfig, checkingConnection])

  useEffect(() => {
    fetchData()

    if (searchParams?.get('connected') === '1') {
      toast.success('Instagram account connected successfully!')
      api.get('/integrations/instagram/status')
        .then((res) => {
          setIgAccount(res || { connected: false })
          if (res?.connected && searchParams.get('openCreate') === '1') {
            setCreateOpen(true)
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  async function fetchData() {
    setLoading(true)
    try {
      const [autosRes, igRes] = await Promise.all([
        api.get('/automations').catch(() => []),
        api.get('/integrations/instagram/status').catch(() => ({ connected: false }))
      ])
      setAutomations(Array.isArray(autosRes) ? autosRes : [])
      setIgAccount(igRes || { connected: false })
    } catch (err) {
      console.error('Failed to load automations data:', err)
      toast.error('Failed to load automations')
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'

    // If activating, verify backend connection status first
    if (newStatus === 'ACTIVE') {
      if (checkingConnection) return
      setCheckingConnection(true)
      try {
        const statusRes = await api.get('/integrations/instagram/status').catch(() => ({ connected: false }))
        setIgAccount(statusRes || { connected: false })
        if (!statusRes?.connected) {
          setCheckingConnection(false)
          setConnectModalOpen(true)
          return
        }
      } catch {
        setCheckingConnection(false)
        setConnectModalOpen(true)
        return
      } finally {
        setCheckingConnection(false)
      }
    }

    setActionLoading(id)
    try {
      const updated = await api.patch(`/automations/${id}`, { statusOnly: true, status: newStatus })
      setAutomations((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: updated.status || newStatus } : item))
      )
      toast.success(`Automation ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`)
    } catch (err) {
      if (err.code === 'INSTAGRAM_NOT_CONNECTED' || err.status === 403) {
        setConnectModalOpen(true)
      } else {
        toast.error(err.message || 'Failed to update automation status')
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return
    }

    setActionLoading(id)
    try {
      await api.delete(`/automations/${id}`)
      setAutomations((prev) => prev.filter((item) => item.id !== id))
      toast.success('Automation deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete automation')
    } finally {
      setActionLoading(null)
    }
  }

  const activeCount = automations.filter(a => a.status === 'ACTIVE').length
  const pausedCount = automations.filter(a => a.status === 'PAUSED' || a.status === 'ARCHIVED').length

  const filteredAutomations = automations.filter(a => {
    if (activeTab === 'ACTIVE') return a.status === 'ACTIVE'
    if (activeTab === 'ARCHIVED') return a.status === 'PAUSED' || a.status === 'ARCHIVED'
    return true
  })

  return (
    <div className="max-w-5xl space-y-6 text-[#1F1F1F]">
      
      {/* SUBTITLE BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FFFFFF] p-4 sm:p-5 rounded-[20px] border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-[#1F1F1F] flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#1F1F1F]" /> Instagram Auto-Reply
            </span>
            {igAccount?.connected && (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-[#F2F1EF] text-[#16A34A] border border-[#E5E5E3]">
                <Instagram className="h-3.5 w-3.5" />
                @{igAccount?.username || 'connected'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6F6F6B] font-normal mt-1">
            Automatically send product links and DMs whenever someone comments on your Instagram posts or reels.
          </p>
        </div>
      </div>

      {/* Instagram Account Connection Warning Banner */}
      {!loading && !igAccount.connected && (
        <div className="bg-[#FFFBEB] border border-[#D97706]/30 p-5 rounded-[20px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-[#D97706] shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-[#92400E]">Instagram Account Not Connected</h4>
              <p className="text-xs text-[#B45309] font-medium">
                Connect your Instagram account to start sending comment Auto-DMs.
              </p>
            </div>
          </div>
          <Link href="/dashboard/settings/connected-accounts">
            <Button className="bg-[#1F1F1F] text-white font-bold hover:bg-[#000000] text-xs shrink-0 rounded-full shadow-sm">
              Connect Instagram Now
            </Button>
          </Link>
        </div>
      )}

      {/* Mobile Page Header & Quick Add Action */}
      <div className="flex items-center justify-between gap-3 sm:hidden pb-1">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#1F1F1F] tracking-tight">Automations</h1>
          <p className="text-xs text-[#6F6F6B] truncate">Instagram AutoDM & comment campaigns</p>
        </div>
        <Button
          onClick={handleStartCreate}
          disabled={checkingConnection}
          className="font-bold text-xs h-9 px-3.5 rounded-full text-[#FFFFFF] bg-[#1F1F1F] hover:bg-[#000000] flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm disabled:opacity-70"
        >
          {checkingConnection ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5 stroke-[3]" />
          )}
          Add
        </Button>
      </div>

      {/* Filter Tabs & Limit Pill Row */}
      <div className="flex items-center justify-between border-b border-[#E5E5E3] pb-3 pt-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'ACTIVE'
                ? 'bg-[#1F1F1F] text-[#FFFFFF]'
                : 'bg-[#FFFFFF] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] border border-[#E5E5E3]'
            }`}
          >
            Active
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-[#F2F1EF] text-[#6F6F6B]'
            }`}>
              {activeCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ARCHIVED')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'ARCHIVED'
                ? 'bg-[#1F1F1F] text-[#FFFFFF]'
                : 'bg-[#FFFFFF] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] border border-[#E5E5E3]'
            }`}
          >
            Paused / Archived
            {pausedCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'ARCHIVED' ? 'bg-white/20 text-white' : 'bg-[#F2F1EF] text-[#6F6F6B]'
              }`}>
                {pausedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-[#1F1F1F] text-[#FFFFFF]'
                : 'bg-[#FFFFFF] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] border border-[#E5E5E3]'
            }`}
          >
            All ({automations.length})
          </button>

          <button
            onClick={() => setActiveTab('QUEUE')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'QUEUE'
                ? 'bg-[#1F1F1F] text-[#FFFFFF]'
                : 'bg-[#FFFFFF] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] border border-[#E5E5E3]'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Queue Activity
          </button>
        </div>

        {/* Free / Limit Usage Status Badge */}
        <div className="hidden sm:flex items-center gap-2 bg-[#FFFFFF] border border-[#E5E5E3] px-3 py-1 rounded-full text-xs font-medium text-[#6F6F6B] shadow-xs">
          <Zap className="h-3.5 w-3.5 text-[#1F1F1F]" />
          <span>Active: <strong className="text-[#1F1F1F]">{activeCount}</strong> / 10</span>
        </div>
      </div>

      {/* Queue Activity Tab View */}
      {activeTab === 'QUEUE' ? (
        <QueueActivityTab />
      ) : loading ? (
        <div className="flex h-64 items-center justify-center bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <Loader2 className="h-8 w-8 animate-spin text-[#1F1F1F]" />
        </div>
      ) : filteredAutomations.length === 0 ? (
        /* Empty State */
        <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] p-12 text-center space-y-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="mx-auto h-16 w-16 rounded-full bg-[#F2F1EF] border border-[#E5E5E3] flex items-center justify-center text-[#1F1F1F]">
            <Bot className="h-8 w-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-xl font-bold text-[#1F1F1F]">
              {activeTab === 'ARCHIVED' ? 'No Paused Auto-Replies' : 'No Auto-Replies Created Yet'}
            </h3>
            <p className="text-sm text-[#6F6F6B]">
              Set up an Instagram auto-reply campaign to turn comment keywords into instant product purchases.
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={handleStartCreate}
              disabled={checkingConnection}
              className="bg-[#1F1F1F] text-white font-bold hover:bg-[#000000] active:bg-[#111111] px-6 rounded-full cursor-pointer shadow-sm disabled:opacity-75"
            >
              {checkingConnection ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Plus className="h-5 w-5 mr-2 stroke-[3]" />
              )}
              Create New Auto-Reply
            </Button>
          </div>
        </div>
      ) : (
        /* Auto-Reply Campaign Cards */
        <div className="space-y-4">
          {filteredAutomations.map((auto) => {
            const isActive = auto.status === 'ACTIVE'
            const isBusy = actionLoading === auto.id
            const metrics = auto.metrics || { comments: 0, dmsSent: 0, dmFailures: 0, clicks: 0, checkouts: 0, purchases: 0, revenue: 0 }
            
            // Construct preview message text
            const previewText = auto.message || auto.openingMessage || auto.commentReply || "Hey, thanks for reaching out! ❤️ Check out this link 👇"
            
            // Extract keyword trigger text
            const keywordsList = Array.isArray(auto.keywords) && auto.keywords.length > 0 
              ? auto.keywords.join(', ') 
              : auto.triggerValue || 'GUIDE'

            // Image URL preview or thumbnail fallback
            const mediaThumbnail = auto.mediaUrl || auto.product?.images?.[0] || null

            return (
              <div
                key={auto.id}
                className="bg-[#FFFFFF] rounded-[20px] sm:rounded-[24px] border border-[#E5E5E3] p-4 sm:p-6 hover:border-[#1F1F1F] transition-all shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col justify-between space-y-4 min-w-0"
              >
                {/* Top Section: Media Thumbnail + Message + Chips */}
                <div className="flex flex-col sm:flex-row items-start gap-3.5 sm:gap-4 min-w-0">
                  {/* Thumbnail / Image */}
                  <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-xl sm:rounded-2xl overflow-hidden bg-[#F2F1EF] border border-[#E5E5E3] shrink-0 flex items-center justify-center relative">
                    {mediaThumbnail ? (
                      <img
                        src={mediaThumbnail}
                        alt={auto.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="p-2 text-center flex flex-col items-center justify-center">
                        <Instagram className="h-6 w-6 sm:h-8 sm:w-8 text-[#1F1F1F]" />
                        <span className="text-[8px] sm:text-[9px] font-bold text-[#6F6F6B] uppercase mt-0.5">Post</span>
                      </div>
                    )}
                    {isActive ? (
                      <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-[#16A34A] border border-white animate-pulse" />
                    ) : (
                      <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-[#999995] border border-white" />
                    )}
                  </div>

                  {/* Message Content & Tag Chips */}
                  <div className="flex-1 space-y-2.5 sm:space-y-3 min-w-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-lg font-bold text-[#1F1F1F] tracking-tight truncate max-w-full">
                          {auto.name}
                        </h3>
                        {!isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F2F1EF] text-[#6F6F6B] border border-[#E5E5E3]">
                            Paused
                          </span>
                        )}
                      </div>
                      
                      {/* Message Preview Text */}
                      <p className="text-xs sm:text-sm font-normal text-[#6F6F6B] line-clamp-2 leading-relaxed">
                        {previewText}
                      </p>
                    </div>

                    {/* Chips Row (Link & Trigger) */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {/* Link Tag Chip */}
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#FBFBFB] text-[#1F1F1F] border border-[#E5E5E3] max-w-full">
                        <LinkIcon className="h-3.5 w-3.5 text-[#1F1F1F] shrink-0" />
                        <span className="truncate max-w-[140px] sm:max-w-[180px]">
                          {auto.product?.title || auto.customUrl || 'Product Link'}
                        </span>
                      </div>

                      {/* Trigger Tag Chip */}
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#FBFBFB] text-[#1F1F1F] border border-[#E5E5E3] max-w-full">
                        <Zap className="h-3.5 w-3.5 text-[#D97706] shrink-0" />
                        <span className="text-[#6F6F6B]">Trigger</span>
                        <span className="text-[11px] font-mono font-bold bg-[#FFFFFF] text-[#1F1F1F] border border-[#E5E5E3] px-1.5 py-0.5 rounded uppercase truncate max-w-[100px]">
                          {keywordsList}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Metrics & Actions Menu */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 pt-3 border-t border-[#E5E5E3]">
                  {/* Metrics Pills (Sends, Views, Clicks, Revenue) */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs text-[#6F6F6B]">
                    <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#FBFBFB] border border-[#E5E5E3] font-semibold text-[#1F1F1F] text-[11px] sm:text-xs">
                      <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#16A34A] shrink-0" />
                      <strong>{metrics.dmsSent || metrics.comments || 0}</strong> Sends
                    </span>

                    <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#FBFBFB] border border-[#E5E5E3] font-semibold text-[#1F1F1F] text-[11px] sm:text-xs">
                      <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#1F1F1F] shrink-0" />
                      <strong>{metrics.clicks || 0}</strong> Views
                    </span>

                    <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#FBFBFB] border border-[#E5E5E3] font-semibold text-[#1F1F1F] text-[11px] sm:text-xs">
                      <MousePointerClick className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#D97706] shrink-0" />
                      <strong>{metrics.clicks || 0}</strong> Clicks
                    </span>

                    {metrics.purchases > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#F2F1EF] border border-[#E5E5E3] font-semibold text-[#1F1F1F] text-[11px] sm:text-xs">
                        <ShoppingBag className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#1F1F1F] shrink-0" />
                        <strong>{metrics.purchases}</strong> Sales
                      </span>
                    )}
                  </div>

                  {/* Actions Dropdown Menu */}
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-9 w-9 p-0 rounded-full border border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F]">
                          <MoreHorizontal className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-[#FFFFFF] border border-[#E5E5E3] text-[#1F1F1F] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                        <DropdownMenuItem
                          onClick={() => toggleStatus(auto.id, auto.status)}
                          disabled={isBusy}
                          className="cursor-pointer focus:bg-[#F5F5F3] focus:text-[#1F1F1F]"
                        >
                          {isActive ? (
                            <>
                              <PauseCircle className="h-4 w-4 mr-2 text-[#D97706]" /> Pause Auto-reply
                            </>
                          ) : (
                            <>
                              <PlayCircle className="h-4 w-4 mr-2 text-[#16A34A]" /> Activate Auto-reply
                            </>
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => router.push(`/dashboard/automations/${auto.id}`)}
                          className="cursor-pointer focus:bg-[#F5F5F3] focus:text-[#1F1F1F]"
                        >
                          <Edit className="h-4 w-4 mr-2 text-[#1F1F1F]" /> Edit Auto-reply
                        </DropdownMenuItem>

                        <DropdownMenuSeparator className="bg-[#E5E5E3]" />

                        <DropdownMenuItem
                          onClick={() => handleDelete(auto.id, auto.name)}
                          disabled={isBusy}
                          className="cursor-pointer text-[#DC2626] focus:bg-[#DC2626]/10 focus:text-[#DC2626]"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete Auto-reply
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      )}

      <CreateAutomationModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchData}
      />

      <ConnectInstagramModal
        open={connectModalOpen}
        onOpenChange={setConnectModalOpen}
        returnUrl="/dashboard/automations?openCreate=1"
      />

    </div>
  )
}
