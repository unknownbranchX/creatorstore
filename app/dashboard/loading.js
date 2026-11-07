import CreatorStoreLoader from '@/components/ui/CreatorStoreLoader'

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-8 select-none">
      <CreatorStoreLoader
        size="lg"
        badge
        badgeBg="#000000"
        ariaLabel="Loading dashboard..."
      />
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#6F6F6B]">
        Loading dashboard...
      </p>
    </div>
  )
}
