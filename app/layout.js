import localFont from 'next/font/local'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'
import { getAppUrl } from '@/config/site'

const manrope = localFont({
  src: '../public/fonts/manrope-latin.woff2',
  variable: '--font-manrope',
  display: 'swap',
})

const orbitron = localFont({
  src: '../public/fonts/orbitron-latin.woff2',
  variable: '--font-orbitron',
  display: 'swap',
})

const brandFont = localFont({
  src: '../public/fonts/plus-jakarta-sans-latin.woff2',
  variable: '--font-brand',
  display: 'swap',
})

const playfair = localFont({
  src: '../public/fonts/playfair-display-latin.woff2',
  variable: '--font-playfair',
  display: 'swap',
})

export const metadata = {
  metadataBase: new URL(getAppUrl()),
  title: 'CreatorStore',
  description: 'Create your creator storefront, sell digital products, online courses, and 1:1 coaching, share one link, and turn Instagram engagement into sales.',
  openGraph: {
    title: 'CreatorStore — Turn Your Audience Into Customers',
    description: 'Create your creator storefront, sell digital products, online courses, and 1:1 coaching, share one link, and turn Instagram engagement into sales.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CreatorStore — Turn Your Audience Into Customers',
    description: 'Create your creator storefront, sell digital products, online courses, and 1:1 coaching, share one link, and turn Instagram engagement into sales.',
  },
  icons: {
    icon: [
      { url: '/brand/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: [
      { url: '/brand/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

import { theme, generateCssVariables } from '@/config/theme'

export default function RootLayout({ children }) {
  const themeCss = generateCssVariables(theme)
  const gtmId = (process.env.NEXT_PUBLIC_GTM_ID || '').trim()
  const isAnalyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false' && Boolean(gtmId)

  return (
    <html lang="en" className={`${manrope.variable} ${orbitron.variable} ${brandFont.variable} ${playfair.variable} bg-black`} suppressHydrationWarning>
      <head>
        <style id="theme-css-vars" dangerouslySetInnerHTML={{ __html: themeCss }} />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className={`${manrope.className} bg-black text-white antialiased`}>
        {isAnalyticsEnabled && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
