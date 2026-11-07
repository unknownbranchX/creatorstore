'use client'

import { useRef } from 'react'
import { Image as ImageIcon, Pencil, User, Upload } from 'lucide-react'
import ColorField from './ColorField'
import ProBadge from './ProBadge'
import AltTitleFontToggle from './AltTitleFontToggle'
import TitleBioFields from './TitleBioFields'
import PanelHeader from './PanelHeader'

export default function HeaderPanel({
  theme,
  storeSlug,
  avatarUrl,
  onChange,
  onBack,
  onSave,
  onCancel,
  hasUnsavedChanges = false,
  isSaving = false,
  onUpgrade,
  onAvatarUpload,
  onLogoUpload,
  uploadingAvatar,
  onSuggestThemeMatch,
}) {
  const avatarInputRef = useRef(null)
  const logoInputRef = useRef(null)
  const layout = theme.headerLayout === 'immersive' ? 'immersive' : theme.headerLayout === 'hero' ? 'hero' : 'classic'
  const defaultTitle = storeSlug ? `@${storeSlug}` : '@username'
  const titleValue = theme.headerTitle !== undefined ? theme.headerTitle : defaultTitle
  const bioValue = theme.headerBio || ''
  const titleStyle = theme.titleStyle === 'logo' ? 'logo' : 'text'

  return (
    <div className="bg-white border border-[#E5E5E3] rounded-[24px] p-5 sm:p-6 shadow-xs space-y-6">
      <PanelHeader
        title="Header Customization"
        onBack={onBack}
        onSave={onSave}
        onCancel={onCancel}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
      />

      <div className="space-y-2">
        <span className="text-label text-content-primary font-medium">Choose Header</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <LayoutCard
            selected={layout === 'classic'}
            label="Classic"
            description="Traditional avatar & clean profile layout"
            onClick={() => onChange({ headerLayout: 'classic' })}
          >
            <div className="h-full w-full bg-white flex flex-col items-center justify-center gap-1.5 p-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-[#C4C4C4]" />
              )}
              <span className="h-1 w-10 rounded-chip bg-[#D4D4D4]" />
            </div>
          </LayoutCard>

          <LayoutCard
            selected={layout === 'hero'}
            label="Hero"
            description="Profile card with integrated cover banner"
            onClick={() => onChange({ headerLayout: 'hero' })}
          >
            <div className="h-full w-full relative bg-surface-raised">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-[#39414D] to-[#1A1A1A]" />
              )}
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/70 to-transparent" />
            </div>
          </LayoutCard>

          <LayoutCard
            selected={layout === 'immersive'}
            label="Immersive Hero"
            description="Use your profile image as a full-page visual hero."
            onClick={() => {
              onChange({ headerLayout: 'immersive' })
              if (avatarUrl) {
                onSuggestThemeMatch?.(avatarUrl)
              }
            }}
          >
            <div className="h-full w-full relative bg-surface-raised overflow-hidden flex flex-col justify-between">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-[#343D4B] via-[#1E232D] to-[#111317] flex items-center justify-center">
                  <User className="h-7 w-7 text-white/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10 pointer-events-none" />
              
              <div className="relative z-10 p-1 flex justify-between items-center">
                <span className="h-2 w-2 rounded-full bg-white/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
              </div>

              <div className="relative z-10 px-1.5 pb-1 flex flex-col items-center text-center gap-1">
                <span className="h-1.5 w-12 rounded-full bg-white shadow-xs" />
                <span className="h-1 w-14 rounded-full bg-white/60" />
                <div className="flex items-center gap-1 pt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                </div>
                {/* Content peeking below */}
                <div className="w-full h-2 rounded-t-xs bg-white/25 border-t border-x border-white/30 mt-0.5 flex items-center justify-center">
                  <span className="h-0.5 w-6 rounded-full bg-white/50" />
                </div>
              </div>
            </div>
          </LayoutCard>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-label text-content-primary">Profile image</span>
        <div className="relative h-16 w-16">
          <div className="h-16 w-16 rounded-full overflow-hidden border border-edge bg-surface-raised flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-7 w-7 text-content-muted" />
            )}
          </div>
          <button
            type="button"
            title="Change profile image"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-full bg-surface-overlay border border-edge flex items-center justify-center text-content-primary cursor-pointer"
          >
            {uploadingAvatar ? (
              <span className="h-3 w-3 rounded-full border-2 border-edge border-t-brand animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={onAvatarUpload} className="hidden" />
        </div>
      </div>

      <TitleBioFields
        title={titleValue}
        bio={bioValue}
        onTitleChange={(v) => onChange({ headerTitle: v })}
        onBioChange={(v) => onChange({ headerBio: v })}
      />

      <div className="space-y-2">
        <span className="text-label text-content-primary">Title style</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ titleStyle: 'text' })}
            className={`flex flex-col items-center gap-2 p-3 rounded-control border cursor-pointer ${
              titleStyle === 'text' ? 'border-edge-focus ring-1 ring-edge-focus' : 'border-edge hover:border-edge-strong'
            }`}
          >
            <span className="text-2xl font-semibold leading-none text-content-primary">Aa</span>
            <span className="text-micro text-content-primary">Text</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onUpgrade?.()
              onChange({ titleStyle: 'logo' })
            }}
            className={`relative flex flex-col items-center gap-2 p-3 rounded-control border cursor-pointer ${
              titleStyle === 'logo' ? 'border-edge-focus ring-1 ring-edge-focus' : 'border-edge hover:border-edge-strong'
            }`}
          >
            <ProBadge as="span" className="absolute top-1.5 right-1.5" />
            <ImageIcon className="h-6 w-6 text-content-primary" />
            <span className="text-micro text-content-primary">Logo</span>
          </button>
        </div>
        {titleStyle === 'logo' && (
          <div className="pt-1">
            {theme.headerLogoUrl ? (
              <div className="flex items-center gap-3">
                <img src={theme.headerLogoUrl} alt="" className="h-10 max-w-[140px] object-contain" />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="text-label text-brand cursor-pointer"
                >
                  Replace
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-10 rounded-control border border-dashed border-edge text-label text-content-muted cursor-pointer">
                <Upload className="h-4 w-4" /> Upload logo
                <input ref={logoInputRef} type="file" accept="image/*" onChange={onLogoUpload} className="hidden" />
              </label>
            )}
            {theme.headerLogoUrl && (
              <input ref={logoInputRef} type="file" accept="image/*" onChange={onLogoUpload} className="hidden" />
            )}
          </div>
        )}
      </div>

      <div className="border-t border-edge-subtle">
        <AltTitleFontToggle
          checked={!!theme.altTitleFont}
          onChange={(val) => onChange({ altTitleFont: val })}
          onUpgrade={onUpgrade}
        />
      </div>

      <ColorField
        label="Title color"
        value={theme.titleColor || theme.textColor}
        fallback="#FFFFFF"
        onChange={(v) => onChange({ titleColor: v })}
      />
    </div>
  )
}

function LayoutCard({ selected, label, description, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col gap-1.5 text-left cursor-pointer group">
      <div
        className={`aspect-[4/3] w-full overflow-hidden rounded-control border transition-all ${
          selected ? 'border-edge-focus ring-2 ring-edge-focus' : 'border-edge hover:border-edge-strong'
        }`}
      >
        {children}
      </div>
      <div className="flex flex-col">
        <span className="text-label text-content-primary font-medium leading-tight">{label}</span>
        {description && (
          <span className="text-[11px] text-content-muted leading-tight mt-0.5">{description}</span>
        )}
      </div>
    </button>
  )
}
