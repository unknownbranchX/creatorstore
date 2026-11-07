'use client'

import { useState, useMemo } from 'react'
import {
  Mail, Star, Send, HelpCircle, CheckCircle2,
  Loader2, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { getContrastColor } from '@/lib/colorContrast'

function getAccessibleTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string') return '#FFFFFF'
  const c = hexColor.replace('#', '')
  if (c.length !== 6 && c.length !== 8) return '#FFFFFF'
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 135 ? '#111827' : '#FFFFFF'
}

export default function StorefrontFormCard({ section = {}, tokens = {}, editor = false, username = '' }) {
  const props = section.props || {}
  const settings = props.settings || {}
  const formType = (props.formType || 'contact').toLowerCase()

  const title = props.title || (
    formType === 'contact' ? 'Get in Touch'
    : formType === 'feedback' ? 'Share Your Feedback'
    : formType === 'newsletter' ? 'Join My Newsletter'
    : 'Ask Me Anything'
  )
  const subtitle = props.subtitle || props.description || (
    formType === 'contact' ? 'Have a question or proposal? Send me a direct message.'
    : formType === 'feedback' ? 'Help me improve by rating your experience.'
    : formType === 'newsletter' ? 'Get weekly updates and exclusive resources.'
    : 'Drop your questions below and I will answer soon.'
  )
  const buttonText = props.buttonText || (
    formType === 'contact' ? 'Send Message'
    : formType === 'feedback' ? 'Submit Feedback'
    : formType === 'newsletter' ? 'Subscribe'
    : 'Submit Question'
  )
  const successMessage = props.successMessage || 'Thank you! Your submission has been received.'

  const { colors = {}, buttons = {}, typography = {} } = tokens
  const bgHex = colors.background || colors.bg || '#0A0A0A'
  const surfaceTheme = useMemo(() => getContrastColor(bgHex, tokens), [bgHex, tokens])

  // Form input state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [consent, setConsent] = useState(false)

  // Status & response state
  const [submitted, setSubmitted] = useState(false)
  const [submittedMessage, setSubmittedMessage] = useState(successMessage)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Subtype icon
  const Icon = formType === 'newsletter'
    ? Send
    : formType === 'feedback'
      ? Star
      : formType === 'qa'
        ? HelpCircle
        : Mail

  // CTA Button color & accessible text color
  const primaryButtonColor = buttons.color || colors.buttonColor || colors.primaryColor || '#194DF5'
  const buttonTextColor = getAccessibleTextColor(primaryButtonColor)
  const borderRadius = buttons.radius || tokens.radius || '16px'

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMessage('')

    // Client-side validation
    if (formType === 'newsletter' && settings.requireConsent !== false && !consent) {
      setErrorMessage('Please accept the marketing consent to subscribe.')
      return
    }

    if (formType === 'feedback' && (!rating || rating < 1 || rating > 5)) {
      setErrorMessage('Please select a star rating between 1 and 5.')
      return
    }

    setLoading(true)

    try {
      const payload = {
        formId: props.formId || undefined,
        sectionId: section.id || undefined,
        username: username || undefined,
        formType,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        rating: formType === 'feedback' ? rating : undefined,
        consent: formType === 'newsletter' ? consent : undefined,
        answers: {
          phone: phone.trim() || undefined,
        },
      }

      const res = await fetch('/api/public/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.error) {
        throw new Error(data.error || data.message || 'Submission failed. Please check your information and try again.')
      }

      setSubmitted(true)
      const confirmedMsg = data.successMessage || successMessage
      setSubmittedMessage(confirmedMsg)
      toast.success(confirmedMsg)
    } catch (err) {
      console.error('[StorefrontFormCard] submission error:', err)
      setErrorMessage(err.message || 'Something went wrong. Please try again.')
      toast.error(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setName('')
    setEmail('')
    setPhone('')
    setMessage('')
    setRating(5)
    setConsent(false)
    setErrorMessage('')
    setSubmitted(false)
  }

  return (
    <div className="w-full my-1">
      <div
        className="p-6 sm:p-7 transition-all duration-300 relative overflow-hidden storefront-tile-chassis"
        style={{
          backgroundColor: surfaceTheme.cardBg,
          borderRadius: 'var(--storefront-tile-radius, 22px)',
          border: `1px solid ${surfaceTheme.cardBorder}`,
          boxShadow: surfaceTheme.cardShadow,
        }}
      >
        {submitted ? (
          <div className="py-8 text-center space-y-3.5 animate-in fade-in duration-300">
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h4 className="text-xl font-bold tracking-tight" style={{ color: surfaceTheme.heading }}>
              {submittedMessage}
            </h4>
            <p className="text-xs max-w-xs mx-auto leading-relaxed" style={{ color: surfaceTheme.muted }}>
              {formType === 'newsletter'
                ? 'Thank you for subscribing! Keep an eye on your inbox for our latest updates.'
                : `Your response has been delivered directly to @${username || 'the creator'}.`}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 text-xs font-semibold underline transition-opacity hover:opacity-80 cursor-pointer"
              style={{ color: primaryButtonColor }}
            >
              Submit another response
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Form Header */}
            <div className="flex items-start gap-3.5 pb-2" style={{ borderBottom: `1px solid ${surfaceTheme.divider}` }}>
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform"
                style={{
                  backgroundColor: surfaceTheme.iconBg,
                  color: surfaceTheme.iconColor,
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-base font-bold tracking-tight leading-snug" style={{ color: surfaceTheme.heading }}>
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: surfaceTheme.muted }}>
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{errorMessage}</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3 pt-1">
              {/* Star Rating for Feedback Form */}
              {formType === 'feedback' && (
                <div className="space-y-1.5 text-center py-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: surfaceTheme.label }}>
                    Your Rating (1 to 5 Stars) *
                  </span>
                  <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={rating === star}
                        aria-label={`${star} star`}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                      >
                        <Star
                          className={`h-7 w-7 transition-colors ${
                            star <= (hoverRating || rating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-zinc-500/40'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Name field */}
              {((formType === 'contact') ||
                (formType === 'feedback' && settings.includeName !== false) ||
                (formType === 'newsletter' && settings.includeName !== false) ||
                (formType === 'qa')) && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: surfaceTheme.label }}>
                    {formType === 'qa'
                      ? (settings.allowAnonymous !== false ? 'Name / Handle (Optional)' : 'Name / Handle *')
                      : formType === 'contact'
                        ? (settings.requireName !== false ? 'Your Name *' : 'Your Name (Optional)')
                        : 'Your Name (Optional)'}
                  </label>
                  <input
                    type="text"
                    required={
                      (formType === 'contact' && settings.requireName !== false) ||
                      (formType === 'qa' && settings.allowAnonymous === false)
                    }
                    placeholder={formType === 'qa' ? '@username or Anonymous' : 'Jane Doe'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium outline-none transition-all placeholder:opacity-50 focus:ring-1"
                    style={{
                      backgroundColor: surfaceTheme.inputBg,
                      color: surfaceTheme.inputText,
                      border: `1px solid ${surfaceTheme.inputBorder}`,
                    }}
                  />
                </div>
              )}

              {/* Email field */}
              {((formType === 'contact') ||
                (formType === 'newsletter') ||
                (formType === 'feedback' && settings.includeEmail !== false) ||
                (formType === 'qa' && settings.includeEmail !== false)) && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: surfaceTheme.label }}>
                    Email Address {formType === 'qa' || formType === 'feedback' ? '(Optional)' : '*'}
                  </label>
                  <input
                    type="email"
                    required={formType === 'contact' || formType === 'newsletter'}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium outline-none transition-all placeholder:opacity-50 focus:ring-1"
                    style={{
                      backgroundColor: surfaceTheme.inputBg,
                      color: surfaceTheme.inputText,
                      border: `1px solid ${surfaceTheme.inputBorder}`,
                    }}
                  />
                </div>
              )}

              {/* Phone field (optional for contact) */}
              {formType === 'contact' && settings.includePhone && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: surfaceTheme.label }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium outline-none transition-all placeholder:opacity-50 focus:ring-1"
                    style={{
                      backgroundColor: surfaceTheme.inputBg,
                      color: surfaceTheme.inputText,
                      border: `1px solid ${surfaceTheme.inputBorder}`,
                    }}
                  />
                </div>
              )}

              {/* Message / Question field */}
              {(formType === 'contact' || formType === 'feedback' || formType === 'qa') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: surfaceTheme.label }}>
                    {formType === 'qa'
                      ? 'Your Question *'
                      : formType === 'feedback'
                        ? (settings.requireComment !== false ? 'Feedback Comments *' : 'Feedback Comments (Optional)')
                        : 'Message *'}
                  </label>
                  <textarea
                    required={
                      formType === 'contact' ||
                      formType === 'qa' ||
                      (formType === 'feedback' && settings.requireComment !== false)
                    }
                    rows={3}
                    placeholder={
                      formType === 'qa'
                        ? 'Type your question here...'
                        : formType === 'feedback'
                          ? 'What did you like or how can I improve?'
                          : 'How can I help you today?'
                    }
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium outline-none transition-all resize-none placeholder:opacity-50 focus:ring-1"
                    style={{
                      backgroundColor: surfaceTheme.inputBg,
                      color: surfaceTheme.inputText,
                      border: `1px solid ${surfaceTheme.inputBorder}`,
                    }}
                  />
                </div>
              )}

              {/* Consent checkbox for newsletter */}
              {formType === 'newsletter' && settings.requireConsent !== false && (
                <div className="flex items-start gap-2 pt-1">
                  <input
                    id={`consent-${section.id || 'nl'}`}
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    required
                    className="mt-0.5 rounded cursor-pointer accent-primary"
                  />
                  <label
                    htmlFor={`consent-${section.id || 'nl'}`}
                    className="text-[11px] leading-snug cursor-pointer select-none"
                    style={{ color: surfaceTheme.muted }}
                  >
                    {settings.consentText || 'I agree to receive email newsletters and can unsubscribe at any time.'}
                  </label>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-5 font-bold text-xs rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:opacity-95 hover:scale-[1.005] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: primaryButtonColor,
                  color: buttonTextColor,
                  borderRadius,
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span>{buttonText}</span>
                    <Icon className="h-4 w-4 stroke-[2.2]" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
