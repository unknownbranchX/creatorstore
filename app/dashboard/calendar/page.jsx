'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/clientApi'
import { toast } from 'sonner'
import {
  getWeekDates,
  formatInTimezone,
  getDatePartsInTimezone,
  isSameDayInTz,
  getStatusConfig,
} from '@/lib/calendarUtils'
import CalendarWeekView from '@/components/calendar/CalendarWeekView'
import CalendarMonthView from '@/components/calendar/CalendarMonthView'
import BookingDetailsModal from '@/components/calendar/BookingDetailsModal'
import RescheduleModal from '@/components/calendar/RescheduleModal'
import CancelBookingModal from '@/components/calendar/CancelBookingModal'
import AvailabilitySettingsModal from '@/components/calendar/AvailabilitySettingsModal'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Plus,
  Search, Filter, Loader2, AlertCircle, RefreshCw, Sparkles, CheckCircle2,
  SlidersHorizontal, X, ExternalLink
} from 'lucide-react'

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

export default function CalendarPage() {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState('week') // 'week' | 'month'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [timezone, setTimezone] = useState('Asia/Kolkata')

  // Data
  const [bookings, setBookings] = useState([])
  const [availability, setAvailability] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedProductId, setSelectedProductId] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false)

  // Selected Day in Month View for Day Inspection Drawer
  const [selectedMonthDay, setSelectedMonthDay] = useState(null)
  const [selectedMonthDayBookings, setSelectedMonthDayBookings] = useState([])

  // Calculate Week and Month ranges
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate])

  const dateRangeBounds = useMemo(() => {
    if (viewMode === 'week') {
      const start = new Date(weekDates[0])
      start.setHours(0, 0, 0, 0)
      const end = new Date(weekDates[6])
      end.setHours(23, 59, 59, 999)
      return { startIso: start.toISOString(), endIso: end.toISOString() }
    } else {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const start = new Date(year, month - 1, 20) // include padding
      const end = new Date(year, month + 2, 10)
      return { startIso: start.toISOString(), endIso: end.toISOString() }
    }
  }, [viewMode, weekDates, currentDate])

  // Load calendar bookings and availability from backend
  const loadCalendarData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        start: dateRangeBounds.startIso,
        end: dateRangeBounds.endIso,
      })
      if (statusFilter !== 'ALL') params.append('status', statusFilter)
      if (selectedProductId !== 'ALL') params.append('productId', selectedProductId)

      const [bookingsRes, availRes] = await Promise.all([
        api.get(`/calendar/bookings?${params.toString()}`),
        api.get('/calendar/availability').catch(() => null),
      ])

      setBookings(bookingsRes?.bookings || [])
      if (bookingsRes?.timezone) {
        setTimezone(bookingsRes.timezone)
      } else if (availRes?.timezone) {
        setTimezone(availRes.timezone)
      }

      if (availRes) {
        setAvailability(availRes.availability || [])
        setProducts(availRes.products || [])
      }
    } catch (err) {
      console.error('Failed to load calendar data:', err)
      setError(err.message || 'Unable to load your calendar.')
    } finally {
      setLoading(false)
    }
  }, [dateRangeBounds, statusFilter, selectedProductId])

  useEffect(() => {
    loadCalendarData()
  }, [loadCalendarData])

  // Navigation handlers
  function handleToday() {
    setCurrentDate(new Date())
    const todayIndex = (new Date().getDay() + 6) % 7 // Monday = 0
    setSelectedDayIndex(todayIndex)
  }

  function handlePrev() {
    if (viewMode === 'week') {
      const next = new Date(currentDate)
      next.setDate(next.getDate() - 7)
      setCurrentDate(next)
    } else {
      const next = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
      setCurrentDate(next)
    }
  }

  function handleNext() {
    if (viewMode === 'week') {
      const next = new Date(currentDate)
      next.setDate(next.getDate() + 7)
      setCurrentDate(next)
    } else {
      const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
      setCurrentDate(next)
    }
  }

  // Filtered Bookings for live search
  const filteredBookings = useMemo(() => {
    let list = bookings
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((b) => {
        const title = (b.productTitle || b.product?.title || '').toLowerCase()
        const custName = (b.customerName || '').toLowerCase()
        const custEmail = (b.customerEmail || '').toLowerCase()
        return title.includes(q) || custName.includes(q) || custEmail.includes(q)
      })
    }
    return list
  }, [bookings, searchQuery])

  // Click on a booking block
  function handleSelectBooking(booking) {
    setSelectedBooking(booking)
    setIsDetailsOpen(true)
  }

  // Header Title Range String
  const headerTitle = useMemo(() => {
    if (viewMode === 'week') {
      const first = weekDates[0]
      const last = weekDates[6]
      const firstMonth = formatInTimezone(first, timezone, { month: 'short' })
      const lastMonth = formatInTimezone(last, timezone, { month: 'short' })
      const firstYear = formatInTimezone(first, timezone, { year: 'numeric' })
      const lastYear = formatInTimezone(last, timezone, { year: 'numeric' })

      if (firstMonth === lastMonth && firstYear === lastYear) {
        return `${firstMonth} ${first.getDate()} – ${last.getDate()}, ${firstYear}`
      }
      return `${firstMonth} ${first.getDate()} – ${lastMonth} ${last.getDate()}, ${lastYear}`
    } else {
      return formatInTimezone(currentDate, timezone, { month: 'long', year: 'numeric' })
    }
  }, [viewMode, weekDates, currentDate, timezone])

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-full space-y-4">
      
      {/* TOP HEADER & CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 bg-[#FFFFFF] border border-[#E5E5E3] p-4 rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        
        {/* Title and Subtitle */}
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#1F1F1F] tracking-tight">
              Calendar
            </h1>
            <span className="text-[11px] font-mono text-[#6F6F6B] bg-[#F2F1EF] border border-[#E5E5E3] px-2 py-0.5 rounded-[6px]">
              {timezone}
            </span>
          </div>
          <p className="text-xs text-[#6F6F6B] mt-0.5">
            Manage your sessions, bookings, and availability.
          </p>
        </div>

        {/* Date Controls & Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          
          {/* Navigation [Today] [<] [>] */}
          <div className="flex items-center bg-[#FBFBFB] border border-[#E5E5E3] rounded-[10px] p-1 shadow-xs">
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 rounded-[7px] text-xs font-bold text-[#1F1F1F] hover:bg-[#F5F5F3] transition-colors cursor-pointer"
            >
              Today
            </button>
            <div className="h-4 w-[1px] bg-[#E5E5E3] mx-1" />
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous week or month"
              className="p-1.5 rounded-[7px] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next week or month"
              className="p-1.5 rounded-[7px] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Current Date Display */}
          <div className="text-xs font-bold text-[#1F1F1F] min-w-[140px] text-center hidden sm:block">
            {headerTitle}
          </div>

          {/* View Switcher: [Week] [Month] */}
          <div className="flex items-center bg-[#FBFBFB] border border-[#E5E5E3] rounded-[10px] p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-[7px] text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-[#1F1F1F] text-[#FFFFFF] shadow-xs'
                  : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-[7px] text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-[#1F1F1F] text-[#FFFFFF] shadow-xs'
                  : 'text-[#6F6F6B] hover:text-[#1F1F1F]'
              }`}
            >
              Month
            </button>
          </div>

          {/* Primary Action: [+ Add Availability] */}
          <button
            type="button"
            onClick={() => setIsAvailabilityOpen(true)}
            className="px-4 py-2 rounded-[10px] bg-[#1F1F1F] text-[#FFFFFF] text-xs font-bold hover:bg-[#000000] active:bg-[#111111] transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Availability</span>
          </button>
        </div>

      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-[#FFFFFF] border border-[#E5E5E3] p-3 rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-0.5 sm:pb-0">
          {STATUS_FILTERS.map((f) => {
            const isSelected = statusFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer min-h-[32px] ${
                  isSelected
                    ? 'bg-[#1F1F1F] text-[#FFFFFF] border-[#1F1F1F] shadow-xs'
                    : 'bg-[#FFFFFF] text-[#6F6F6B] hover:text-[#1F1F1F] border-[#E5E5E3] hover:bg-[#F5F5F3]'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Product Filter & Live Search */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          
          {/* Product Filter Dropdown */}
          {products.length > 0 && (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="text-xs bg-[#FFFFFF] border border-[#E5E5E3] rounded-[8px] px-3 py-1.5 text-[#1F1F1F] focus:outline-none focus:border-[#1F1F1F] max-w-[140px] sm:max-w-[160px] truncate min-h-[34px]"
            >
              <option value="ALL">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          {/* Search Input */}
          <div className="relative flex-1 sm:w-56 min-w-0 flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-[#999995] pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer or session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-[#FFFFFF] border border-[#E5E5E3] rounded-[8px] pl-8 pr-3 py-1.5 text-[#1F1F1F] placeholder:text-[#999995] focus:outline-none focus:border-[#1F1F1F] transition-colors min-h-[34px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#999995] hover:text-[#1F1F1F]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={loadCalendarData}
            title="Refresh calendar"
            className="p-2 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-[8px] bg-[#FFFFFF] border border-[#E5E5E3] text-[#6F6F6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F3] transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#1F1F1F]' : ''}`} />
          </button>
        </div>

      </div>

      {/* CALENDAR BODY / VIEW CANVAS */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        
        {/* ERROR STATE */}
        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#FFFFFF] border border-[#E5E5E3] rounded-[20px] text-center space-y-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <AlertCircle className="h-8 w-8 text-[#DC2626]" />
            <div>
              <h3 className="text-sm font-bold text-[#1F1F1F]">
                Unable to load your calendar.
              </h3>
              <p className="text-xs text-[#6F6F6B] mt-1">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={loadCalendarData}
              className="px-4 py-2 rounded-[8px] bg-[#1F1F1F] text-[#FFFFFF] text-xs font-bold hover:bg-[#000000] transition-colors cursor-pointer"
            >
              Try Again
            </button>
          </div>
        ) : loading && bookings.length === 0 ? (
          /* LOADING SKELETON */
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[#FFFFFF] border border-[#E5E5E3] rounded-[20px] text-center space-y-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)] select-none">
            <CreatorStoreLoader size="lg" message="Loading calendar sessions..." />
            <span className="text-xs font-semibold text-[#6F6F6B]">
              Loading calendar sessions...
            </span>
          </div>
        ) : (
          /* MAIN CALENDAR VIEWS */
          <div className="flex-1 min-h-0 flex flex-col">
            {viewMode === 'week' ? (
              <CalendarWeekView
                weekDates={weekDates}
                bookings={filteredBookings}
                availability={availability}
                timezone={timezone}
                onSelectBooking={handleSelectBooking}
                selectedBookingId={selectedBooking?.id}
                selectedDayIndex={selectedDayIndex}
                onSelectDayIndex={setSelectedDayIndex}
              />
            ) : (
              <CalendarMonthView
                year={currentDate.getFullYear()}
                monthIndex={currentDate.getMonth()}
                bookings={filteredBookings}
                timezone={timezone}
                onSelectBooking={handleSelectBooking}
                selectedBookingId={selectedBooking?.id}
                selectedDate={selectedMonthDay}
                onSelectDate={(date, dayBookings) => {
                  setSelectedMonthDay(date)
                  setSelectedMonthDayBookings(dayBookings)
                }}
              />
            )}
          </div>
        )}

      </div>

      {/* MONTH VIEW DAY INSPECTION DRAWER */}
      {viewMode === 'month' && selectedMonthDay && (
        <div className="shrink-0 bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E5E5E3]">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-[#1F1F1F]" />
              <h3 className="text-xs font-bold text-[#1F1F1F]">
                Sessions for {formatInTimezone(selectedMonthDay, timezone, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
              </h3>
              <span className="text-[10px] font-bold text-[#6F6F6B] bg-[#F2F1EF] border border-[#E5E5E3] px-2 py-0.5 rounded-full">
                {selectedMonthDayBookings.length} total
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedMonthDay(null)}
              className="p-1 text-[#6F6F6B] hover:text-[#1F1F1F]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {selectedMonthDayBookings.length === 0 ? (
            <div className="py-3 text-xs text-[#6F6F6B]">
              No sessions scheduled for this date.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto no-scrollbar">
              {selectedMonthDayBookings.map((b) => {
                const statusConfig = getStatusConfig(b.status)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBooking(b)}
                    className="p-2.5 rounded-[12px] bg-[#FBFBFB] border border-[#E5E5E3] hover:border-[#1F1F1F] text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[#1F1F1F] truncate">
                        {b.productTitle || b.product?.title || '1:1 Session'}
                      </span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-[4px] border shrink-0 ${statusConfig.badgeClass}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-[#6F6F6B] mt-1 truncate">
                      {b.customerName || b.customerEmail}
                    </div>
                    <div className="text-[10px] font-mono text-[#999995] mt-0.5">
                      {formatInTimezone(b.startTime, timezone, { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      <BookingDetailsModal
        booking={selectedBooking}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        timezone={timezone}
        onOpenReschedule={(b) => {
          setSelectedBooking(b)
          setIsDetailsOpen(false)
          setIsRescheduleOpen(true)
        }}
        onOpenCancel={(b) => {
          setSelectedBooking(b)
          setIsDetailsOpen(false)
          setIsCancelOpen(true)
        }}
      />

      <RescheduleModal
        booking={selectedBooking}
        isOpen={isRescheduleOpen}
        onClose={() => setIsRescheduleOpen(false)}
        onRescheduled={loadCalendarData}
        timezone={timezone}
      />

      <CancelBookingModal
        booking={selectedBooking}
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        onCancelled={loadCalendarData}
        timezone={timezone}
      />

      <AvailabilitySettingsModal
        isOpen={isAvailabilityOpen}
        onClose={() => setIsAvailabilityOpen(false)}
        onSaved={loadCalendarData}
      />

    </div>
  )
}
