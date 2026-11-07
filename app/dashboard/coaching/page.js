'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, formatMoney } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Video, Calendar as CalendarIcon, Clock, User, CheckCircle2, XCircle,
  Plus, ExternalLink, RefreshCw, Eye, AlertCircle, ChevronLeft, ChevronRight,
  Mail, Phone, CalendarDays, ArrowRight, ShieldCheck, Tag, Loader2, X
} from 'lucide-react'
import { toast } from 'sonner'
import CoachingBookingWizardModal from '@/components/coaching/CoachingBookingWizardModal'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]

export default function CreatorCoachingDashboard() {
  return (
    <Suspense fallback={
      <div className="p-12 flex flex-col items-center justify-center min-h-[50vh] select-none">
        <CreatorStoreLoader size="lg" message="Loading coaching sessions..." />
        <span className="text-xs font-semibold text-[#6F6F6B] mt-3">Loading coaching sessions...</span>
      </div>
    }>
      <CoachingDashboardContent />
    </Suspense>
  )
}

function CoachingDashboardContent() {
  const searchParams = useSearchParams()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('upcoming')
  const [selectedBooking, setSelectedBooking] = useState(null)
  
  // Wizard Modal state
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)

  // Reschedule / Cancel modal states
  const [cancelModalBooking, setCancelModalBooking] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [rescheduleModalBooking, setRescheduleModalBooking] = useState(null)
  const [newRescheduleDate, setNewRescheduleDate] = useState('')
  const [newRescheduleTime, setNewRescheduleTime] = useState('10:00')

  useEffect(() => {
    loadBookings()
    const editId = searchParams?.get('edit') || searchParams?.get('id')
    const createIntent = searchParams?.get('create')
    if (editId) {
      setEditingProductId(editId)
      setWizardOpen(true)
    } else if (createIntent === '1' || createIntent === 'true') {
      setEditingProductId(null)
      setWizardOpen(true)
    }
  }, [searchParams])

  function loadBookings() {
    setLoading(true)
    api.get('/coaching/creator/bookings')
      .then((res) => {
        setBookings(res.bookings || [])
        setLoading(false)
      })
      .catch(() => {
        setBookings([])
        setLoading(false)
      })
  }

  // Filter bookings based on activeTab
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const filteredBookings = bookings.filter((b) => {
    const bDateStr = new Date(b.startTime).toISOString().slice(0, 10)
    const isToday = bDateStr === todayStr
    const isPast = new Date(b.endTime).getTime() < now.getTime()

    if (activeTab === 'today') {
      return isToday && b.status !== 'CANCELLED'
    }
    if (activeTab === 'upcoming') {
      return (b.status === 'CONFIRMED' || b.status === 'PENDING' || b.status === 'RESCHEDULED') && !isPast
    }
    if (activeTab === 'completed') {
      return b.status === 'COMPLETED' || (isPast && b.status === 'CONFIRMED')
    }
    if (activeTab === 'cancelled') {
      return b.status === 'CANCELLED'
    }
    return true // 'all'
  })

  async function handleCancelBooking() {
    if (!cancelModalBooking) return
    setActionLoading(true)
    try {
      await api.post(`/coaching/bookings/${cancelModalBooking.id}/cancel`, {
        reason: cancelReason.trim()
      })
      toast.success('Booking cancelled successfully')
      setCancelModalBooking(null)
      setCancelReason('')
      loadBookings()
    } catch (err) {
      toast.error(err.message || 'Failed to cancel booking')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRescheduleBooking() {
    if (!rescheduleModalBooking || !newRescheduleDate || !newRescheduleTime) {
      toast.error('Please select a date and time')
      return
    }
    setActionLoading(true)
    try {
      const durationMin = 30
      const startIso = `${newRescheduleDate}T${newRescheduleTime}:00.000Z`
      const startDate = new Date(startIso)
      const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)

      await api.post(`/coaching/bookings/${rescheduleModalBooking.id}/reschedule`, {
        newStartTime: startDate.toISOString(),
        newEndTime: endDate.toISOString(),
      })
      toast.success('Booking rescheduled successfully')
      setRescheduleModalBooking(null)
      loadBookings()
    } catch (err) {
      toast.error(err.message || 'Failed to reschedule booking')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-[#1F1F1F]">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E5E3] pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1F1F1F] tracking-tight">Coaching & Bookings</h1>
          <p className="text-xs sm:text-sm text-[#6F6F6B] mt-1">Manage scheduled 1:1 sessions, join meetings, and handle client bookings.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setEditingProductId(null)
              setWizardOpen(true)
            }}
            className="bg-[#1F1F1F] hover:bg-[#000000] text-white font-bold text-xs rounded-full px-5 h-10 shadow-xs gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" /> Add Coaching Product
          </Button>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-[#E5E5E3]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const count = bookings.filter((b) => {
            const bDateStr = new Date(b.startTime).toISOString().slice(0, 10)
            const isToday = bDateStr === todayStr
            const isPast = new Date(b.endTime).getTime() < now.getTime()
            if (tab.id === 'today') return isToday && b.status !== 'CANCELLED'
            if (tab.id === 'upcoming') return (b.status === 'CONFIRMED' || b.status === 'PENDING' || b.status === 'RESCHEDULED') && !isPast
            if (tab.id === 'completed') return b.status === 'COMPLETED' || (isPast && b.status === 'CONFIRMED')
            if (tab.id === 'cancelled') return b.status === 'CANCELLED'
            return true
          }).length

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#1F1F1F] text-white shadow-xs'
                  : 'text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3]'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isActive ? 'bg-white/20 text-white' : 'bg-[#F2F1EF] text-[#6F6F6B]'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* BOOKINGS LIST */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl bg-[#F2F1EF]" />
            ))}
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E5E3] bg-[#FFFFFF] p-12 text-center space-y-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="h-12 w-12 rounded-full bg-[#F5F5F3] border border-[#E5E5E3] flex items-center justify-center mx-auto text-[#6F6F6B]">
              <Video className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-[#1F1F1F]">
              {activeTab === 'upcoming' ? 'No upcoming bookings' : `No ${activeTab} sessions`}
            </h3>
            <p className="text-xs text-[#6F6F6B] max-w-sm mx-auto">
              {activeTab === 'upcoming'
                ? "You don't have any upcoming sessions yet. Share your store link with your audience to accept bookings."
                : `There are currently no sessions in the ${activeTab} status.`}
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingProductId(null)
                  setWizardOpen(true)
                }}
                className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] text-xs font-semibold cursor-pointer"
              >
                Create Coaching Product
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3.5">
            {filteredBookings.map((b) => {
              const bTz = b.timezone || 'Asia/Kolkata'
              const startDate = new Date(b.startTime)
              const endDate = new Date(b.endTime)
              const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: bTz })
              const timeStr = `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: bTz })} – ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: bTz })}`

              const isConfirmed = b.status === 'CONFIRMED'
              const isCancelled = b.status === 'CANCELLED'
              const isPending = b.status === 'PENDING'

              return (
                <div
                  key={b.id}
                  className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#E5E5E3] flex flex-wrap items-center justify-between gap-4 hover:border-[#1F1F1F] shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-12 w-12 rounded-xl bg-[#F2F1EF] border border-[#E5E5E3] text-[#1F1F1F] flex items-center justify-center font-bold shrink-0">
                      <Video className="h-5 w-5" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          isConfirmed
                            ? 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/20'
                            : isCancelled
                            ? 'bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20'
                            : 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/20'
                        }`}>
                          {b.status}
                        </span>

                        <span className="text-[10px] font-semibold text-[#6F6F6B] bg-[#F5F5F3] px-2 py-0.5 rounded-full border border-[#E5E5E3]">
                          {b.timezone || 'Asia/Kolkata'}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-[#1F1F1F] truncate">
                        {b.customerName || b.customerEmail || 'Customer Session'}
                      </h3>

                      <p className="text-xs text-[#6F6F6B] font-medium flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-[#6F6F6B]" />
                        <span>{dateStr}</span>
                        <span>•</span>
                        <Clock className="h-3.5 w-3.5 text-[#6F6F6B]" />
                        <span>{timeStr}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedBooking(b)}
                      className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] text-xs font-semibold px-3.5 h-8 gap-1 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>

                    {!isCancelled && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRescheduleModalBooking(b)
                            setNewRescheduleDate(b.startTime ? new Date(b.startTime).toISOString().slice(0, 10) : '')
                          }}
                          className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] text-xs font-semibold px-3.5 h-8 cursor-pointer"
                        >
                          Reschedule
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCancelModalBooking(b)}
                          className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] text-[#DC2626] hover:bg-[#DC2626]/10 hover:border-[#DC2626]/30 text-xs font-semibold px-3.5 h-8 cursor-pointer"
                        >
                          Cancel
                        </Button>
                      </>
                    )}

                    {b.meetingUrl && !isCancelled && (
                      <a href={b.meetingUrl} target="_blank" rel="noreferrer">
                        <Button
                          size="sm"
                          className="rounded-full bg-[#1F1F1F] hover:bg-[#000000] text-white font-bold text-xs px-4 h-8 gap-1.5 shadow-xs"
                        >
                          <Video className="h-3.5 w-3.5" /> Join
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SESSION DETAILS MODAL */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E5E3] max-w-lg w-full p-6 space-y-5 shadow-[0_20px_60px_rgba(0,0,0,0.12)] relative text-[#1F1F1F]">
            <button
              onClick={() => setSelectedBooking(null)}
              className="absolute top-5 right-5 text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] rounded-full p-1.5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border inline-block ${
                selectedBooking.status === 'CONFIRMED'
                  ? 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/20'
                  : selectedBooking.status === 'CANCELLED'
                  ? 'bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20'
                  : 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/20'
              }`}>
                {selectedBooking.status}
              </span>
              <h2 className="text-lg font-bold text-[#1F1F1F]">Booking Details</h2>
              <p className="text-xs text-[#6F6F6B]">Client: {selectedBooking.customerName || 'Customer'}</p>
            </div>

            <div className="bg-[#FBFBFB] p-4 rounded-xl border border-[#E5E5E3] space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#6F6F6B]">Date & Time:</span>
                <span className="font-semibold text-[#1F1F1F]">
                  {`${new Date(selectedBooking.startTime).toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                    timeZone: selectedBooking.timezone || 'Asia/Kolkata'
                  })} (${selectedBooking.timezone || 'Asia/Kolkata'})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6F6F6B]">Customer Email:</span>
                <span className="font-semibold text-[#1F1F1F]">{selectedBooking.customerEmail}</span>
              </div>
              {selectedBooking.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-[#6F6F6B]">Customer Phone:</span>
                  <span className="font-semibold text-[#1F1F1F]">{selectedBooking.customerPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#6F6F6B]">Meeting Provider:</span>
                <span className="font-semibold text-[#1F1F1F]">{selectedBooking.meetingType || 'GOOGLE_MEET'}</span>
              </div>
              {selectedBooking.meetingUrl && (
                <div className="flex justify-between items-center">
                  <span className="text-[#6F6F6B]">Meeting Link:</span>
                  <a href={selectedBooking.meetingUrl} target="_blank" rel="noreferrer" className="text-[#1F1F1F] underline hover:no-underline font-semibold truncate max-w-[220px]">
                    {selectedBooking.meetingUrl}
                  </a>
                </div>
              )}
            </div>

            {/* Answers */}
            {selectedBooking.answers && selectedBooking.answers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6F6F6B]">Customer Intake Answers</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedBooking.answers.map((ans, i) => (
                    <div key={i} className="bg-[#FBFBFB] p-3 rounded-xl border border-[#E5E5E3] text-xs space-y-1">
                      <div className="font-semibold text-[#1F1F1F]">{ans.questionText || `Question ${i + 1}`}</div>
                      <div className="text-[#6F6F6B]">{ans.answer || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E5E3]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedBooking(null)}
                className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] text-xs font-semibold px-4"
              >
                Close
              </Button>
              {selectedBooking.meetingUrl && selectedBooking.status !== 'CANCELLED' && (
                <a href={selectedBooking.meetingUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" className="rounded-full bg-[#1F1F1F] hover:bg-[#000000] text-white text-xs font-bold px-4 gap-1.5 shadow-xs">
                    <Video className="h-3.5 w-3.5" /> Join Session
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E5E3] max-w-md w-full p-6 space-y-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)] text-[#1F1F1F]">
            <h3 className="text-base font-bold text-[#1F1F1F]">Cancel Booking Session</h3>
            <p className="text-xs text-[#6F6F6B]">
              Are you sure you want to cancel this booking with {cancelModalBooking.customerName || cancelModalBooking.customerEmail}? A notification and refund will be processed if applicable.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#1F1F1F]">Cancellation Reason (Optional)</Label>
              <Textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Creator unavailable due to emergency"
                className="rounded-xl bg-[#FFFFFF] border-[#E5E5E3] text-xs text-[#1F1F1F] resize-none focus:border-[#1F1F1F]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E5E3]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelModalBooking(null)}
                disabled={actionLoading}
                className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] text-xs font-semibold"
              >
                Keep Booking
              </Button>
              <Button
                size="sm"
                onClick={handleCancelBooking}
                disabled={actionLoading}
                className="rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold px-4"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {rescheduleModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E5E3] max-w-md w-full p-6 space-y-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)] text-[#1F1F1F]">
            <h3 className="text-base font-bold text-[#1F1F1F]">Reschedule Session</h3>
            <p className="text-xs text-[#6F6F6B]">
              Select a new date and start time for {rescheduleModalBooking.customerName || rescheduleModalBooking.customerEmail}.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1F1F1F]">New Date</Label>
                <Input
                  type="date"
                  value={newRescheduleDate}
                  onChange={(e) => setNewRescheduleDate(e.target.value)}
                  className="h-10 rounded-xl bg-[#FFFFFF] border-[#E5E5E3] text-xs text-[#1F1F1F] focus:border-[#1F1F1F]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1F1F1F]">New Time</Label>
                <Input
                  type="time"
                  value={newRescheduleTime}
                  onChange={(e) => setNewRescheduleTime(e.target.value)}
                  className="h-10 rounded-xl bg-[#FFFFFF] border-[#E5E5E3] text-xs text-[#1F1F1F] focus:border-[#1F1F1F]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E5E3]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRescheduleModalBooking(null)}
                disabled={actionLoading}
                className="rounded-full border-[#E5E5E3] bg-[#FFFFFF] hover:bg-[#F5F5F3] text-[#1F1F1F] text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRescheduleBooking}
                disabled={actionLoading}
                className="rounded-full bg-[#1F1F1F] hover:bg-[#000000] text-white text-xs font-bold px-4"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Reschedule'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* COACHING CREATION & SETUP MODAL WIZARD */}
      <CoachingBookingWizardModal
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false)
          setEditingProductId(null)
        }}
        onSuccess={() => {
          loadBookings()
        }}
        editProductId={editingProductId}
      />

    </div>
  )
}
