'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Calendar, Clock, Video, CheckCircle2, Loader2, Globe, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'

export default function CoachingBookingWidget({ productId, onSlotSelected, selectedSlot }) {
  const [config, setConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(true)

  // Selected date (YYYY-MM-DD)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  
  // Available slots for selectedDate
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [timezone, setTimezone] = useState('Asia/Kolkata')

  // Answers to intake questions
  const [answers, setAnswers] = useState({})

  // Fetch coaching config
  useEffect(() => {
    let mounted = true
    setLoadingConfig(true)
    api.get(`/coaching/public/${productId}`)
      .then((res) => {
        if (!mounted) return
        if (res.config) {
          setConfig(res.config)
          setTimezone(res.config.timezone || 'Asia/Kolkata')
        }
        setLoadingConfig(false)
      })
      .catch(() => {
        if (mounted) setLoadingConfig(false)
      })
    return () => { mounted = false }
  }, [productId])

  // Fetch available slots when date changes
  useEffect(() => {
    if (!productId || !selectedDate) return
    let mounted = true
    setLoadingSlots(true)
    api.get(`/coaching/slots?productId=${productId}&date=${selectedDate}`)
      .then((res) => {
        if (!mounted) return
        setSlots(res.slots || [])
        if (res.timezone) setTimezone(res.timezone)
        setLoadingSlots(false)
      })
      .catch(() => {
        if (mounted) {
          setSlots([])
          setLoadingSlots(false)
        }
      })
    return () => { mounted = false }
  }, [productId, selectedDate])

  // Date navigation helpers (next 14 days)
  const dateOptions = []
  const baseDate = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(baseDate)
    d.setDate(baseDate.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const iso = `${yyyy}-${mm}-${dd}`
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    dateOptions.push({ iso, label, dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }) })
  }

  function handleSelectSlot(slot) {
    // Validate required questions
    if (config?.questions?.length) {
      for (const q of config.questions) {
        if (q.required && (!answers[q.id] || !String(answers[q.id]).trim())) {
          toast.error(`Please answer required question: "${q.question}"`)
          return
        }
      }
    }

    const formattedAnswers = (config?.questions || []).map((q) => ({
      questionId: q.id,
      questionText: q.question,
      answer: answers[q.id] || '',
    }))

    onSlotSelected?.({
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: slot.durationMinutes,
      formattedTime: slot.formattedTime,
      date: selectedDate,
      answers: formattedAnswers,
    })
    toast.success('Time slot selected! Complete checkout below.')
  }

  if (loadingConfig) {
    return (
      <div className="p-8 bg-white rounded-3xl border border-white/10 text-center space-y-3 select-none flex flex-col items-center justify-center">
        <CreatorStoreLoader size="md" className="mx-auto" />
        <p className="text-xs text-[rgba(244,242,236,0.68)] font-medium">Loading session availability...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-white/10 shadow-md space-y-6">
      
      {/* Widget Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-[#F4F2EC]">Select Date & Time Slot</h3>
            <p className="text-xs text-[rgba(244,242,236,0.68)] font-medium">{config?.durationMinutes || 60}-minute 1:1 session</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-bold text-[rgba(244,242,236,0.68)] bg-[#12141c] px-3 py-1.5 rounded-full border border-white/10">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <span>{timezone}</span>
        </div>
      </div>

      {/* 1. DATE PICKER HORIZONTAL SCROLL BAR */}
      <div className="space-y-2">
        <Label className="text-xs font-extrabold text-[#F4F2EC]">1. Select Date</Label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {dateOptions.map((d) => {
            const isSelected = selectedDate === d.iso
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setSelectedDate(d.iso)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all shrink-0 min-w-[80px] ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-black shadow-xs ring-2 ring-primary/20'
                    : 'border-white/10 bg-white text-[#F4F2EC] hover:bg-[#12141c] font-bold text-xs'
                }`}
              >
                <span className="text-[10px] uppercase font-black opacity-60">{d.dayOfWeek}</span>
                <span className="text-xs font-extrabold mt-0.5">{d.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. TIME SLOTS SELECTOR */}
      <div className="space-y-3">
        <Label className="text-xs font-extrabold text-[#F4F2EC]">2. Select Start Time</Label>

        {loadingSlots ? (
          <div className="py-8 text-center text-xs text-[rgba(244,242,236,0.5)] font-medium space-y-2 flex flex-col items-center justify-center select-none">
            <CreatorStoreLoader size="sm" className="mx-auto" />
            <span>Finding available time slots...</span>
          </div>
        ) : slots.length === 0 ? (
          <div className="p-6 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-center space-y-1">
            <AlertCircle className="h-5 w-5 text-amber-600 mx-auto" />
            <p className="text-xs font-bold text-amber-900">No available time slots on this date</p>
            <p className="text-[11px] text-amber-700 font-medium">Please select another date above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {slots.map((slot, idx) => {
              const isSelected = selectedSlot?.startTime === slot.startTime
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSlot(slot)}
                  className={`py-3 px-3 rounded-xl border text-xs text-center transition-all ${
                    isSelected
                      ? 'border-primary bg-primary text-[#000000] font-black shadow-md scale-[1.02]'
                      : 'border-white/10 bg-white text-[#F4F2EC] hover:border-primary hover:bg-primary/10 font-bold'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 mx-auto mb-1 opacity-70 inline-block mr-1" />
                  {slot.formattedTime}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 3. INTAKE QUESTIONS FORM */}
      {config?.questions?.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-white/10">
          <Label className="text-xs font-extrabold text-[#F4F2EC]">3. Answer Creator Questions</Label>
          <div className="space-y-3">
            {config.questions.map((q) => (
              <div key={q.id} className="space-y-1.5 text-left">
                <label className="text-xs font-bold text-[#F4F2EC] block">
                  {q.question} {q.required && <span className="text-red-500">*</span>}
                </label>

                {q.type === 'LONG_TEXT' ? (
                  <Textarea
                    rows={2}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Type your response..."
                    className="rounded-xl border-white/10 text-xs font-medium"
                  />
                ) : (
                  <Input
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Your answer..."
                    className="h-10 rounded-xl border-white/10 text-xs font-medium"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SELECTION SUMMARY BADGE */}
      {selectedSlot && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <span>Selected Slot: {selectedSlot.date} at {selectedSlot.formattedTime}</span>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">Ready</span>
        </div>
      )}

    </div>
  )
}
