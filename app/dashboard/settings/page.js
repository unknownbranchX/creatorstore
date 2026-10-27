'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { api } from '@/lib/clientApi'
import { useDashboard } from '@/components/dashboard/DashboardContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, LogOut, Check, X, Sparkles, User, Link2, Shield, Upload, Camera, Download, FileSpreadsheet, Zap } from 'lucide-react'
import { useDashboardHeader } from '@/components/dashboard/HeaderContext'

const CATEGORIES = ['Education', 'Fitness', 'Business', 'Marketing', 'Coding', 'Music', 'Art', 'Finance', 'Lifestyle', 'Photography', 'Coaching', 'Other']
const SOCIALS = [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['x', 'X'], ['linkedin', 'LinkedIn'], ['website', 'Website']]

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { me, updateProfile: updateDashboardProfile, updateStore: updateDashboardStore, refreshMe } = useDashboard()
  const { setPricingModalOpen } = useDashboardHeader()
  const [profile, setProfile] = useState({ name: '', bio: '', category: '', avatarUrl: '', socialLinks: {} })
  const [username, setUsername] = useState('')
  const [uState, setUState] = useState({ checking: false, available: null, error: null })
  const [saving, setSaving] = useState(false)
  const [exportDataset, setExportDataset] = useState('products')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportUpgradeRequired, setExportUpgradeRequired] = useState(false)

  async function handleExportCsv() {
    setExporting(true)
    setExportUpgradeRequired(false)
    try {
      const q = new URLSearchParams({ dataset: exportDataset })
      if (exportFrom) q.set('from', exportFrom)
      if (exportTo) q.set('to', exportTo)
      const res = await fetch(`/api/export?${q.toString()}`, {
        headers: { Accept: 'text/csv' },
      })
      if (res.status === 403) {
        setExportUpgradeRequired(true)
        toast.error('Data export requires a Pro subscription')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(err.error || 'Export failed')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `creatorstore-${exportDataset}-${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`${exportDataset.toUpperCase()} export downloaded successfully!`)
    } catch (err) {
      toast.error(err.message || 'Failed to export data')
    } finally {
      setExporting(false)
    }
  }
  const fileInputRef = useRef(null)
  const avatarSectionRef = useRef(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [highlightAvatar, setHighlightAvatar] = useState(false)

  useEffect(() => {
    const focus = searchParams?.get('focus')
    const section = searchParams?.get('section')
    if (focus === 'avatar' || section === 'profile' || section === 'avatar') {
      setHighlightAvatar(true)
      if (avatarSectionRef.current) {
        avatarSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      const t = setTimeout(() => {
        setHighlightAvatar(false)
      }, 3500)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPEG, WEBP, GIF)')
      return
    }

    // Immediate local preview
    const reader = new FileReader()
    reader.onload = (evt) => {
      setProfile((prev) => ({ ...prev, avatarUrl: evt.target.result }))
    }
    reader.readAsDataURL(file)

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.upload('/upload', formData)
      if (res.url) {
        setProfile((prev) => ({ ...prev, avatarUrl: res.url }))
        toast.success('Profile image uploaded! Click "Save Profile" below to apply.')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to upload profile image')
    } finally {
      setUploadingImage(false)
    }
  }

  const [storeName, setStoreName] = useState('')

  useEffect(() => {
    if (me?.profile) {
      setProfile({
        name: me.profile.name || '',
        bio: me.profile.bio || '',
        category: me.profile.category || '',
        avatarUrl: me.profile.avatarUrl || '',
        socialLinks: me.profile.socialLinks || {},
      })
    }
    if (me?.store) {
      setStoreName(me.store.storeName || me.profile?.name || '')
      setUsername(me.store.username || me.store.slug || '')
    }
  }, [me])

  useEffect(() => {
    if (!username || username === (me?.store?.username || me?.store?.slug)) { setUState({ checking: false, available: null, error: null }); return }
    setUState((s) => ({ ...s, checking: true }))
    const t = setTimeout(async () => {
      try { const r = await api.get(`/store/username/check?u=${encodeURIComponent(username)}`); setUState({ checking: false, available: r.available, error: r.error }) }
      catch (e) { setUState({ checking: false, available: false, error: e.message }) }
    }, 400)
    return () => clearTimeout(t)
  }, [username, me])

  async function saveProfile() {
    setSaving(true)
    try {
      const currentStoreUsername = me?.store?.username || me?.store?.slug || ''
      const normalizedNewUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim()

      let updatedStore = null
      const effectiveStoreName = (storeName || profile.name || '').trim()
      const storePatch = {}
      if (normalizedNewUsername && normalizedNewUsername !== currentStoreUsername) {
        if (uState.available === false) {
          throw new Error(uState.error || 'The requested username is taken or invalid')
        }
        storePatch.username = normalizedNewUsername
      }
      if (effectiveStoreName && effectiveStoreName !== me?.store?.storeName) {
        storePatch.storeName = effectiveStoreName
      }
      if (profile.bio !== undefined && profile.bio !== me?.store?.bio) {
        storePatch.bio = profile.bio
      }
      if (profile.avatarUrl !== undefined && profile.avatarUrl !== me?.store?.avatarUrl) {
        storePatch.avatarUrl = profile.avatarUrl
      }
      if (Object.keys(storePatch).length > 0) {
        const storeRes = await api.patch('/store', storePatch)
        updatedStore = storeRes.store || storeRes
      }

      const pRes = await api.patch('/creator/profile', {
        name: profile.name,
        bio: profile.bio,
        category: profile.category,
        avatarUrl: profile.avatarUrl,
        socialLinks: profile.socialLinks,
      })

      const updatedProfile = pRes.profile || pRes
      if (updateDashboardProfile) updateDashboardProfile(updatedProfile)
      if (updatedStore && updateDashboardStore) updateDashboardStore(updatedStore)
      if (refreshMe) await refreshMe()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('creatorstore:setup-updated'))
      }

      toast.success('Store & Profile saved successfully!')
    } catch (e) {
      toast.error(e.message || 'Failed to save profile settings')
    } finally {
      setSaving(false)
    }
  }

  async function saveUsername() {
    if (!username || username === (me?.store?.username || me?.store?.slug)) return
    if (uState.available === false) {
      toast.error(uState.error || 'Username not available')
      return
    }
    setSaving(true)
    try {
      const res = await api.patch('/store/username', { username })
      const newStore = res.store || res
      const activeSlug = newStore?.username || newStore?.slug || username
      if (updateDashboardStore) updateDashboardStore({ ...newStore, slug: activeSlug, username: activeSlug })
      if (refreshMe) await refreshMe()
      toast.success('Store URL updated successfully!')
    } catch (e) {
      toast.error(e.message || 'Failed to update store URL')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish() {
    setSaving(true)
    try {
      if (me?.store?.published) {
        await api.post('/store/unpublish')
        updateDashboardStore({ published: false })
        toast.success('Store unpublished (set to Draft)')
      } else {
        const res = await api.post('/store/publish')
        const targetStore = res.store || res
        const activeSlug = targetStore?.slug || targetStore?.username || username
        updateDashboardStore({ published: true, slug: activeSlug, username: activeSlug })
        toast.success('Store published live!')
      }
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function logout() {
    try { await api.post('/auth/logout') } catch { }
    toast.success('Logged out')
    window.location.href = '/login'
  }

  if (!me) return <div className="flex h-[60vh] items-center justify-center bg-transparent"><Loader2 className="h-8 w-8 animate-spin text-[#1F1F1F]" /></div>

  const storeSlug = me?.store?.slug || me?.store?.username || username
  const publicStoreUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${storeSlug}`

  return (
    <div className="max-w-3xl space-y-6 text-[#1F1F1F]">

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-[#E5E5E3] pb-4 overflow-x-auto">
        <span className="px-4 py-2 text-sm font-bold text-[#1F1F1F] border-b-2 border-[#1F1F1F] shrink-0">
          Profile &amp; Store
        </span>
        <Link
          href="/dashboard/settings/payments"
          className="px-4 py-2 text-sm font-semibold text-[#6F6F6B] hover:text-[#1F1F1F] transition-colors shrink-0"
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

      {/* Header */}
      <div className="bg-[#FFFFFF] p-6 sm:p-8 rounded-[24px] border border-[#E5E5E3] shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] bg-[#F2F1EF] px-3 py-1 rounded-full border border-[#E5E5E3] mb-1">
          <Sparkles className="h-3.5 w-3.5" /> Account & Profile
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1F] tracking-tight">Store & Brand Settings</h1>
        <p className="text-xs sm:text-sm text-[#6F6F6B] font-medium">Manage your creator store name, bio, social handles, and public store URL.</p>
      </div>

      <Section title="Store & Brand Identity" icon={User}>
        <div
          ref={avatarSectionRef}
          id="profile-image-section"
          className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-2 p-3 rounded-[20px] transition-all duration-300 ${
            highlightAvatar ? 'ring-2 ring-[#1F1F1F] bg-[#F7F7F6]' : ''
          }`}
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-full bg-[#F2F1EF] border border-[#E5E5E3] shrink-0 cursor-pointer transition-transform hover:scale-105"
            title="Click to select profile image from local files"
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl sm:text-2xl font-black text-[#1F1F1F]">
                {(storeName || profile.name || 'C')[0]}
              </div>
            )}
            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
              <Camera className="h-5 w-5" />
            </div>
            {uploadingImage && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className="flex-1 space-y-2 w-full min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold text-[#1F1F1F]">Profile Image</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="h-8 rounded-full text-xs font-bold gap-1.5 border-[#E5E5E3] bg-[#FFFFFF] text-[#1F1F1F] hover:bg-[#F5F5F3] shrink-0"
              >
                {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploadingImage ? 'Uploading...' : 'Upload File'}
              </Button>
            </div>
            <Input
              value={profile.avatarUrl}
              onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
              placeholder="https://... or select local file"
              className="text-xs rounded-full bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] placeholder-[#999995] focus:border-[#1F1F1F]"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-[#1F1F1F]">Store Name</Label>
            <Input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. Ruhan's Studio"
              className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] font-bold rounded-full placeholder-[#999995] focus:border-[#1F1F1F]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-[#1F1F1F]">Creator Full Name</Label>
            <Input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              placeholder="Full Name"
              className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] font-bold rounded-full placeholder-[#999995] focus:border-[#1F1F1F]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-[#1F1F1F]">Bio &amp; Tagline</Label>
          <Textarea rows={3} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} className="rounded-2xl bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] placeholder-[#999995] focus:border-[#1F1F1F]" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-[#1F1F1F]">Primary Category</Label>
          <select value={profile.category} onChange={(e) => setProfile({ ...profile, category: e.target.value })}
            className="h-11 w-full rounded-full border border-[#E5E5E3] bg-[#FFFFFF] px-4 text-xs font-bold text-[#1F1F1F] outline-none focus:border-[#1F1F1F] shadow-none">
            <option value="" className="bg-[#FFFFFF] text-[#1F1F1F]">Select Category...</option>
            {CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#FFFFFF] text-[#1F1F1F]">{c}</option>)}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          {SOCIALS.map(([k, l]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs font-bold text-[#1F1F1F]">{l}</Label>
              <Input value={profile.socialLinks[k] || ''} onChange={(e) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, [k]: e.target.value } })} placeholder="Handle or URL" className="bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] rounded-full placeholder-[#999995] focus:border-[#1F1F1F]" />
            </div>
          ))}
        </div>

        <div className="pt-2">
          <Button onClick={saveProfile} disabled={saving} className="font-extrabold px-6 py-3 bg-[#1F1F1F] hover:bg-[#000000] active:bg-[#111111] text-white rounded-full transition-all duration-200 cursor-pointer min-h-[44px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin text-white mr-2" /> : null}
            Save Store &amp; Profile Settings
          </Button>
        </div>
      </Section>

      <Section title="Custom Public Store URL" icon={Link2}>
        {/* Status Badge & Open Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-[18px] bg-[#FBFBFB] border border-[#E5E5E3]">
          <div className="min-w-0">
            <span className="text-xs font-bold text-[#6F6F6B]">Public Store URL:</span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <a href={`/${storeSlug}`} target="_blank" rel="noreferrer" className="text-xs sm:text-sm font-extrabold text-[#1F1F1F] hover:underline truncate max-w-[200px] sm:max-w-xs">
                creatorstore.store/{storeSlug}
              </a>
              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border shrink-0 ${me?.store?.published ? 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/25' : 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/25'}`}>
                {me?.store?.published ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1 sm:pt-0">
            {me?.store?.published && (
              <a href={`/${storeSlug}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="font-bold text-xs bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F] hover:bg-[#F5F5F3] rounded-full h-8">
                  Open Store ↗
                </Button>
              </a>
            )}
            <Button size="sm" onClick={togglePublish} disabled={saving} className="font-black text-xs rounded-full h-8 bg-[#1F1F1F] hover:bg-[#000000] active:bg-[#111111] text-white">
              {me?.store?.published ? 'Unpublish Store' : 'Publish Store Live 🚀'}
            </Button>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Label className="text-xs font-bold text-[#1F1F1F]">Edit Store Slug / Handle</Label>
          <div className="flex items-center rounded-full border border-[#E5E5E3] bg-[#FFFFFF] focus-within:border-[#1F1F1F] shadow-none overflow-hidden">
            <span className="pl-3.5 sm:pl-4 text-[11px] sm:text-xs font-bold text-[#6F6F6B] shrink-0">creatorstore.store/</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} className="w-full min-w-0 bg-transparent px-1 py-2.5 text-xs font-bold text-[#1F1F1F] outline-none" />
            <span className="pr-3 sm:pr-4 shrink-0">
              {uState.checking ? <Loader2 className="h-4 w-4 animate-spin text-[#6F6F6B]" /> : uState.available === true ? <Check className="h-4 w-4 text-[#16A34A]" /> : uState.available === false ? <X className="h-4 w-4 text-[#DC2626]" /> : null}
            </span>
          </div>
          {uState.error && <p className="text-xs font-bold text-[#DC2626]">{uState.error}</p>}
        </div>
        <div>
          <Button variant="outline" onClick={saveUsername} disabled={username === storeSlug || !uState.available} className="font-bold text-xs border-[#E5E5E3] bg-[#FFFFFF] text-[#1F1F1F] hover:bg-[#F5F5F3] rounded-full min-h-[38px]">
            Update Store URL
          </Button>
        </div>
      </Section>

      <Section title="Data Export" icon={Download}>
        <div className="space-y-4">
          <p className="text-xs text-[#6F6F6B]">
            Export your CreatorStore business records as CSV files. Includes formula-injection defense and complete ownership isolation.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1F1F1F]">Dataset</Label>
              <select
                value={exportDataset}
                onChange={(e) => setExportDataset(e.target.value)}
                className="h-10 w-full rounded-full border border-[#E5E5E3] bg-[#FFFFFF] px-3.5 text-xs font-bold text-[#1F1F1F] outline-none focus:border-[#1F1F1F]"
              >
                <option value="products">Products</option>
                <option value="orders">Orders</option>
                <option value="sales">Sales &amp; Revenue</option>
                <option value="leads">Customer Leads</option>
                <option value="subscribers">Mailing List Subscribers</option>
                <option value="analytics">Analytics Summary</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1F1F1F]">From Date (Optional)</Label>
              <Input
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
                className="h-10 text-xs rounded-full bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1F1F1F]">To Date (Optional)</Label>
              <Input
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
                className="h-10 text-xs rounded-full bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F]"
              />
            </div>
          </div>

          {exportUpgradeRequired && (
            <div className="p-4 rounded-[18px] bg-[#FFFBEB] border border-[#FDE68A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#D97706] shrink-0" />
                <span className="text-xs font-bold text-[#92400E]">
                  Data Export is exclusive to Pro subscribers.
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => setPricingModalOpen(true)}
                className="bg-[#1F1F1F] text-white hover:bg-black rounded-full text-xs font-bold shrink-0"
              >
                Upgrade to Pro
              </Button>
            </div>
          )}

          <div className="pt-1 flex items-center gap-3">
            <Button
              onClick={handleExportCsv}
              disabled={exporting}
              className="font-extrabold px-5 py-2.5 bg-[#1F1F1F] hover:bg-[#000000] text-white rounded-full transition-all duration-200 cursor-pointer min-h-[40px] text-xs gap-2"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              {exporting ? 'Generating CSV...' : `Export ${exportDataset.toUpperCase()} (CSV)`}
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Account Security" icon={Shield}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#6F6F6B]">Signed in as <span className="font-bold text-[#1F1F1F]">{me?.user?.email}</span></p>
          <Button variant="outline" size="sm" onClick={logout} className="font-bold text-xs text-[#DC2626] border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] rounded-full self-start sm:self-auto min-h-[36px]">
            <LogOut className="mr-1 h-3.5 w-3.5" /> Log Out
          </Button>
        </div>
      </Section>

    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-[24px] border border-[#E5E5E3] bg-[#FFFFFF] p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-4 min-w-0">
      <div className="flex items-center gap-2 border-b border-[#E5E5E3] pb-3">
        {Icon && <Icon className="h-4 w-4 text-[#1F1F1F] shrink-0" />}
        <h2 className="font-extrabold text-base text-[#1F1F1F]">{title}</h2>
      </div>
      {children}
    </div>
  )
}
