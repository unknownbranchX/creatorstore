import { publicService } from '@/lib/services'
import { normalizeSlug } from '@/lib/slug'
import PublicStore from '@/components/storefront/PublicStore'
import { StoreNotFound, StoreUnpublished, StoreInactive, StoreLookupError } from '@/components/storefront/StorefrontStatus'
import { cache } from 'react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const getStorefront = cache(async (slug, pageSlug) => {
  return publicService.resolveStorefront(slug, { pageSlug })
})

export async function generateMetadata({ params }) {
  const { username } = await params
  const slug = normalizeSlug(username)
  const result = await getStorefront(slug, null)
  if (result.status === 'ok') {
    const data = result.data
    const name = data.profile?.name || slug
    const title = `${name} — CreatorStore`
    const description = data.profile?.bio || `Shop digital products from ${name}.`
    return {
      title,
      description,
      openGraph: { title, description, images: data.profile?.avatarUrl ? [data.profile.avatarUrl] : [], type: 'profile' },
      twitter: { card: 'summary', title, description },
      alternates: { canonical: `/${slug}` },
    }
  }
  if (result.status === 'unpublished') {
    if (result.reason === 'trial_expired' || result.reason === 'unsubscribed') {
      return { title: 'Storefront unavailable — CreatorStore', robots: { index: false, follow: false } }
    }
    return { title: "Storefront isn't live yet — CreatorStore", robots: { index: false, follow: false } }
  }
  if (result.status === 'error' || result.status === 'inactive') {
    return { title: 'Storefront unavailable — CreatorStore', robots: { index: false, follow: false } }
  }
  return { title: 'Store Not Found — CreatorStore' }
}

export default async function StorefrontPage({ params, searchParams }) {
  const { username } = await params
  const slug = normalizeSlug(username)
  const resolvedSearchParams = await searchParams
  const pageSlug = resolvedSearchParams?.page || null
  const result = await getStorefront(slug, pageSlug)

  if (result.status === 'error') return <StoreLookupError />
  if (result.status === 'inactive' || (result.status === 'unpublished' && (result.reason === 'trial_expired' || result.reason === 'unsubscribed'))) {
    return <StoreInactive username={result.slug || slug} />
  }
  if (result.status === 'unpublished') return <StoreUnpublished username={result.slug || slug} />
  if (result.status !== 'ok') return <StoreNotFound username={slug || username} />

  return <PublicStore data={result.data} currentPageSlug={pageSlug} />
}

