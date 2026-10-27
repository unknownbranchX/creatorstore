/**
 * CreatorStore Central Entitlement & Pricing Configuration
 *
 * Access Model:
 * - Free Account (Unsubscribed): Explore and preview the dashboard for free.
 * - Paid Plan required to create, publish, sell, collect payments, and activate Instagram AutoDM.
 *
 * Two Paid Plans:
 * 1. CREATOR — Configurable via CREATOR_PLAN_PRICE_INR in .env (default: ₹1/mo)
 * 2. PRO — Configurable via PRO_PLAN_PRICE_INR in .env (default: ₹499/mo)
 */

export const PLAN_IDS = {
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  CREATOR: 'CREATOR',
  PRO: 'PRO',
}

export const ANNUAL_DISCOUNT_PERCENT = 20

export const CREATOR_FEATURES = [
  'Single bio link storefront',
  'Unlimited digital products & sales',
  'Instant checkout & digital delivery',
  '0% CreatorStore platform transaction fees',
  'Built-in UPI, card & PayPal payment support',
  'Basic analytics',
  'Unlimited Instagram Auto-DMs',
  'Custom storefront designs',
  'Mailing list integration',
  'Up to 3 pages on your storefront',
]

export const PRO_FEATURES = [
  'Advanced analytics',
  'Data export',
  'Remove CreatorStore branding',
  'Unlimited pages on your storefront',
]

export const SUPPORTED_CURRENCIES = {
  INR: {
    code: 'INR',
    symbol: '₹',
    label: '₹ INR',
    name: 'Indian Rupee',
    isBillingCurrency: true,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    label: '$ USD',
    name: 'US Dollar',
    isBillingCurrency: true,
    displayPrices: {
      CREATOR: {
        monthly: 6,
        annual: 58, // 20% off $72 ($57.6 -> $58)
      },
      PRO: {
        monthly: 12,
        annual: 115, // 20% off $144 ($115.2 -> $115)
      },
    },
    billingDisclaimer: 'International checkout is processed in USD securely via Dodo Payments with global card, Apple Pay, and Google Pay support.',
  },
}

export { BILLING_REGIONS, normalizeRegion, resolveBillingConfig } from './billing/config.js'

/**
 * Resolves subscription pricing configuration from environment variables, target currency, and billing interval.
 * Canonical INR Prices:
 * - CREATOR Monthly: ₹499/mo | Annual: ₹4,790/year (20% off ₹5,988)
 * - PRO Monthly: ₹999/mo | Annual: ₹9,590/year (20% off ₹11,988)
 */
export function getSubscriptionPricing(currency = 'USD', interval = 'monthly') {
  const normCurrency = String(currency || 'USD').toUpperCase().trim()
  const normInterval = String(interval || 'monthly').toLowerCase().trim() === 'annual' || String(interval || '').toLowerCase().trim() === 'yearly'
    ? 'annual'
    : 'monthly'

  const rawCreatorMonthly = (typeof process !== 'undefined' && process.env)
    ? (process.env.CREATOR_PLAN_PRICE ??
       process.env.CREATOR_PLAN_PRICE_INR ??
       process.env.STARTER_PRICE_INR ??
       process.env.CREATOR_PRICE_INR ??
       process.env.NEXT_PUBLIC_CREATOR_PLAN_PRICE_INR ??
       process.env.NEXT_PUBLIC_STARTER_PRICE_INR ??
       '499')
    : '499'

  const rawProMonthly = (typeof process !== 'undefined' && process.env)
    ? (process.env.PRO_PLAN_PRICE ??
       process.env.PRO_PLAN_PRICE_INR ??
       process.env.PRO_PRICE_INR ??
       process.env.NEXT_PUBLIC_PRO_PLAN_PRICE_INR ??
       '999')
    : '999'

  const creatorMonthlyNum = Number(rawCreatorMonthly)
  const proMonthlyNum = Number(rawProMonthly)

  const creatorMonthlyPriceInr = (!isNaN(creatorMonthlyNum) && creatorMonthlyNum > 0) ? creatorMonthlyNum : 499
  const proMonthlyPriceInr = (!isNaN(proMonthlyNum) && proMonthlyNum > 0) ? proMonthlyNum : 999

  // Canonical Annual Calculations (20% off baseline 12 months)
  const creatorAnnualOriginalInr = creatorMonthlyPriceInr * 12 // ₹5,988
  const creatorAnnualPriceInr = 4790 // Canonical ₹4,790/year
  const proAnnualOriginalInr = proMonthlyPriceInr * 12 // ₹11,988
  const proAnnualPriceInr = 9590 // Canonical ₹9,590/year

  const razorpayCreatorMonthlyPlanId = (typeof process !== 'undefined' && process.env)
    ? (process.env.RAZORPAY_CREATOR_PLAN_ID || process.env.RAZORPAY_STARTER_PLAN_ID || 'plan_TpJZAJytKRsviK')
    : 'plan_TpJZAJytKRsviK'

  const razorpayCreatorAnnualPlanId = (typeof process !== 'undefined' && process.env)
    ? (process.env.RAZORPAY_CREATOR_ANNUAL_PLAN_ID || null)
    : null

  const razorpayProMonthlyPlanId = (typeof process !== 'undefined' && process.env)
    ? (process.env.RAZORPAY_PRO_PLAN_ID || 'plan_TpJmVECUaYFWXf')
    : 'plan_TpJmVECUaYFWXf'

  const razorpayProAnnualPlanId = (typeof process !== 'undefined' && process.env)
    ? (process.env.RAZORPAY_PRO_ANNUAL_PLAN_ID || null)
    : null

  const dodoCreatorInrMonthlyProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_CREATOR_INR_MONTHLY_ID || 'p_creator_inr_monthly')
    : 'p_creator_inr_monthly'
  const dodoCreatorInrAnnualProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_CREATOR_INR_ANNUAL_ID || 'p_creator_inr_annual')
    : 'p_creator_inr_annual'
  const dodoProInrMonthlyProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_PRO_INR_MONTHLY_ID || 'p_pro_inr_monthly')
    : 'p_pro_inr_monthly'
  const dodoProInrAnnualProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_PRO_INR_ANNUAL_ID || 'p_pro_inr_annual')
    : 'p_pro_inr_annual'

  const dodoCreatorUsdMonthlyProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_CREATOR_MONTHLY_ID || 'p_creator_usd_monthly')
    : 'p_creator_usd_monthly'
  const dodoCreatorUsdAnnualProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_CREATOR_ANNUAL_ID || 'p_creator_usd_annual')
    : 'p_creator_usd_annual'
  const dodoProUsdMonthlyProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_PRO_MONTHLY_ID || 'p_pro_usd_monthly')
    : 'p_pro_usd_monthly'
  const dodoProUsdAnnualProductId = (typeof process !== 'undefined' && process.env)
    ? (process.env.DODO_PRODUCT_PRO_ANNUAL_ID || 'p_pro_usd_annual')
    : 'p_pro_usd_annual'

  if (normCurrency === 'USD') {
    const usdCreatorMonthly = SUPPORTED_CURRENCIES.USD.displayPrices.CREATOR.monthly
    const usdCreatorAnnual = SUPPORTED_CURRENCIES.USD.displayPrices.CREATOR.annual
    const usdProMonthly = SUPPORTED_CURRENCIES.USD.displayPrices.PRO.monthly
    const usdProAnnual = SUPPORTED_CURRENCIES.USD.displayPrices.PRO.annual

    const isAnnual = normInterval === 'annual'
    const creatorDisplayPrice = isAnnual ? usdCreatorAnnual : usdCreatorMonthly
    const creatorPriceInr = isAnnual ? creatorAnnualPriceInr : creatorMonthlyPriceInr
    const proDisplayPrice = isAnnual ? usdProAnnual : usdProMonthly
    const proPriceInr = isAnnual ? proAnnualPriceInr : proMonthlyPriceInr

    return {
      currency: 'USD',
      currencySymbol: '$',
      isBillingCurrency: true,
      billingCurrency: 'USD',
      billingInterval: normInterval,
      billingDisclaimer: SUPPORTED_CURRENCIES.USD.billingDisclaimer,
      discountPercent: ANNUAL_DISCOUNT_PERCENT,
      CREATOR: {
        planId: 'CREATOR',
        name: 'Creator',
        currency: 'USD',
        currencySymbol: '$',
        interval: normInterval,
        isAnnual,
        price: creatorDisplayPrice,
        priceInr: creatorPriceInr,
        priceFormatted: isAnnual ? `$${usdCreatorAnnual}` : `$${usdCreatorMonthly}`,
        periodLabel: isAnnual ? '/year' : '/mo',
        billingPriceFormatted: isAnnual ? `₹${creatorAnnualPriceInr.toLocaleString('en-IN')}` : `₹${creatorMonthlyPriceInr.toLocaleString('en-IN')}`,
        amountInrPaise: Math.round(creatorPriceInr * 100),
        planIdRazorpay: isAnnual ? razorpayCreatorAnnualPlanId : razorpayCreatorMonthlyPlanId,
        dodoProductId: isAnnual ? dodoCreatorUsdAnnualProductId : dodoCreatorUsdMonthlyProductId,
        monthly: {
          price: usdCreatorMonthly,
          priceInr: creatorMonthlyPriceInr,
          priceFormatted: `$${usdCreatorMonthly}`,
          periodLabel: '/mo',
          amountInrPaise: Math.round(creatorMonthlyPriceInr * 100),
          planIdRazorpay: razorpayCreatorMonthlyPlanId,
          dodoProductId: dodoCreatorUsdMonthlyProductId,
        },
        annual: {
          price: usdCreatorAnnual,
          priceInr: creatorAnnualPriceInr,
          originalPrice: usdCreatorMonthly * 12,
          originalPriceFormatted: `$${usdCreatorMonthly * 12}`,
          originalPriceInr: creatorAnnualOriginalInr,
          originalPriceInrFormatted: `₹${creatorAnnualOriginalInr.toLocaleString('en-IN')}`,
          discountPercent: ANNUAL_DISCOUNT_PERCENT,
          priceFormatted: `$${usdCreatorAnnual}`,
          periodLabel: '/year',
          amountInrPaise: Math.round(creatorAnnualPriceInr * 100),
          planIdRazorpay: razorpayCreatorAnnualPlanId,
          dodoProductId: dodoCreatorUsdAnnualProductId,
        },
      },
      PRO: {
        planId: 'PRO',
        name: 'Pro',
        currency: 'USD',
        currencySymbol: '$',
        interval: normInterval,
        isAnnual,
        price: proDisplayPrice,
        priceInr: proPriceInr,
        priceFormatted: isAnnual ? `$${usdProAnnual}` : `$${usdProMonthly}`,
        periodLabel: isAnnual ? '/year' : '/mo',
        billingPriceFormatted: isAnnual ? `₹${proAnnualPriceInr.toLocaleString('en-IN')}` : `₹${proMonthlyPriceInr.toLocaleString('en-IN')}`,
        amountInrPaise: Math.round(proPriceInr * 100),
        planIdRazorpay: isAnnual ? razorpayProAnnualPlanId : razorpayProMonthlyPlanId,
        dodoProductId: isAnnual ? dodoProUsdAnnualProductId : dodoProUsdMonthlyProductId,
        monthly: {
          price: usdProMonthly,
          priceInr: proMonthlyPriceInr,
          priceFormatted: `$${usdProMonthly}`,
          periodLabel: '/mo',
          amountInrPaise: Math.round(proMonthlyPriceInr * 100),
          planIdRazorpay: razorpayProMonthlyPlanId,
          dodoProductId: dodoProUsdMonthlyProductId,
        },
        annual: {
          price: usdProAnnual,
          priceInr: proAnnualPriceInr,
          originalPrice: usdProMonthly * 12,
          originalPriceFormatted: `$${usdProMonthly * 12}`,
          originalPriceInr: proAnnualOriginalInr,
          originalPriceInrFormatted: `₹${proAnnualOriginalInr.toLocaleString('en-IN')}`,
          discountPercent: ANNUAL_DISCOUNT_PERCENT,
          priceFormatted: `$${usdProAnnual}`,
          periodLabel: '/year',
          amountInrPaise: Math.round(proAnnualPriceInr * 100),
          planIdRazorpay: razorpayProAnnualPlanId,
          dodoProductId: dodoProUsdAnnualProductId,
        },
      },
    }
  }

  const isAnnual = normInterval === 'annual'
  const creatorActivePriceInr = isAnnual ? creatorAnnualPriceInr : creatorMonthlyPriceInr
  const proActivePriceInr = isAnnual ? proAnnualPriceInr : proMonthlyPriceInr

  return {
    currency: 'INR',
    currencySymbol: '₹',
    isBillingCurrency: true,
    billingCurrency: 'INR',
    billingInterval: normInterval,
    billingDisclaimer: null,
    discountPercent: ANNUAL_DISCOUNT_PERCENT,
    CREATOR: {
      planId: 'CREATOR',
      name: 'Creator',
      currency: 'INR',
      currencySymbol: '₹',
      interval: normInterval,
      isAnnual,
      price: creatorActivePriceInr,
      priceInr: creatorActivePriceInr,
      amountInrPaise: Math.round(creatorActivePriceInr * 100),
      priceFormatted: isAnnual ? `₹${creatorAnnualPriceInr.toLocaleString('en-IN')}` : `₹${creatorMonthlyPriceInr.toLocaleString('en-IN')}`,
      periodLabel: isAnnual ? '/year' : '/mo',
      billingPriceFormatted: isAnnual ? `₹${creatorAnnualPriceInr.toLocaleString('en-IN')}` : `₹${creatorMonthlyPriceInr.toLocaleString('en-IN')}`,
      planIdRazorpay: isAnnual ? razorpayCreatorAnnualPlanId : razorpayCreatorMonthlyPlanId,
      dodoProductId: isAnnual ? dodoCreatorInrAnnualProductId : dodoCreatorInrMonthlyProductId,
      monthly: {
        price: creatorMonthlyPriceInr,
        priceInr: creatorMonthlyPriceInr,
        amountInrPaise: Math.round(creatorMonthlyPriceInr * 100),
        priceFormatted: `₹${creatorMonthlyPriceInr.toLocaleString('en-IN')}`,
        periodLabel: '/mo',
        planIdRazorpay: razorpayCreatorMonthlyPlanId,
        dodoProductId: dodoCreatorInrMonthlyProductId,
      },
      annual: {
        price: creatorAnnualPriceInr,
        priceInr: creatorAnnualPriceInr,
        originalPrice: creatorAnnualOriginalInr,
        originalPriceFormatted: `₹${creatorAnnualOriginalInr.toLocaleString('en-IN')}`,
        originalPriceInr: creatorAnnualOriginalInr,
        originalPriceInrFormatted: `₹${creatorAnnualOriginalInr.toLocaleString('en-IN')}`,
        discountPercent: ANNUAL_DISCOUNT_PERCENT,
        amountInrPaise: Math.round(creatorAnnualPriceInr * 100),
        priceFormatted: `₹${creatorAnnualPriceInr.toLocaleString('en-IN')}`,
        periodLabel: '/year',
        planIdRazorpay: razorpayCreatorAnnualPlanId,
        dodoProductId: dodoCreatorInrAnnualProductId,
      },
    },
    PRO: {
      planId: 'PRO',
      name: 'Pro',
      currency: 'INR',
      currencySymbol: '₹',
      interval: normInterval,
      isAnnual,
      price: proActivePriceInr,
      priceInr: proActivePriceInr,
      amountInrPaise: Math.round(proActivePriceInr * 100),
      priceFormatted: isAnnual ? `₹${proAnnualPriceInr.toLocaleString('en-IN')}` : `₹${proMonthlyPriceInr.toLocaleString('en-IN')}`,
      periodLabel: isAnnual ? '/year' : '/mo',
      billingPriceFormatted: isAnnual ? `₹${proAnnualPriceInr.toLocaleString('en-IN')}` : `₹${proMonthlyPriceInr.toLocaleString('en-IN')}`,
      planIdRazorpay: isAnnual ? razorpayProAnnualPlanId : razorpayProMonthlyPlanId,
      dodoProductId: isAnnual ? dodoProInrAnnualProductId : dodoProInrMonthlyProductId,
      monthly: {
        price: proMonthlyPriceInr,
        priceInr: proMonthlyPriceInr,
        amountInrPaise: Math.round(proMonthlyPriceInr * 100),
        priceFormatted: `₹${proMonthlyPriceInr.toLocaleString('en-IN')}`,
        periodLabel: '/mo',
        planIdRazorpay: razorpayProMonthlyPlanId,
        dodoProductId: dodoProInrMonthlyProductId,
      },
      annual: {
        price: proAnnualPriceInr,
        priceInr: proAnnualPriceInr,
        originalPrice: proAnnualOriginalInr,
        originalPriceFormatted: `₹${proAnnualOriginalInr.toLocaleString('en-IN')}`,
        originalPriceInr: proAnnualOriginalInr,
        originalPriceInrFormatted: `₹${proAnnualOriginalInr.toLocaleString('en-IN')}`,
        discountPercent: ANNUAL_DISCOUNT_PERCENT,
        amountInrPaise: Math.round(proAnnualPriceInr * 100),
        priceFormatted: `₹${proAnnualPriceInr.toLocaleString('en-IN')}`,
        periodLabel: '/year',
        planIdRazorpay: razorpayProAnnualPlanId,
        dodoProductId: dodoProInrAnnualProductId,
      },
    },
  }
}

/**
 * Validates the environment variables on application startup.
 * Throws a clear error if prices are missing, NaN, or non-positive.
 */
export function validatePricingConfig() {
  const pricing = getSubscriptionPricing()
  if (!pricing.CREATOR.priceInr || pricing.CREATOR.priceInr <= 0) {
    throw new Error('Invalid CREATOR_PLAN_PRICE_INR: must be a positive number greater than 0')
  }
  if (!pricing.PRO.priceInr || pricing.PRO.priceInr <= 0) {
    throw new Error('Invalid PRO_PLAN_PRICE_INR: must be a positive number greater than 0')
  }
  return true
}

export const SUBSCRIPTION_PRICING = new Proxy({}, {
  get(target, prop) {
    const dynamicPricing = getSubscriptionPricing()
    return dynamicPricing[prop]
  },
})

export const PLAN_FEATURES = {
  UNSUBSCRIBED: {
    id: 'UNSUBSCRIBED',
    name: 'Free Account',
    price: 0,
    currency: 'USD',
    priceFormatted: '$0',
    billingPeriod: 'month',
    headline: 'Explore Mode',
    description: 'Explore the dashboard, builder, and tools for free. Subscribe to launch your store.',
    ctaText: 'Upgrade to Launch',
    badge: null,
    isPaid: false,
    entitlements: {
      canPublish: false,
      canSell: false,
      canReceivePayments: false,
      canActivateAutoDm: false,
      storefront: false,
      unlimitedLinks: false,
      links: false,
      digitalProducts: false,
      products: false,
      coaching: false,
      bookings: false,
      coaching_bookings: false,
      courses: false,
      online_courses: false,
      productCheckout: false,
      digitalDelivery: false,
      collections: false,
      productVariants: 'none',
      productVariantsLimit: 0,
      basicAnalytics: false,
      creatorAnalytics: 'preview',
      advancedAnalytics: false,
      instagramAutoDm: 'preview',
      automations: false,
      autoDmCampaignsLimit: 0,
      customStorefrontDesigns: false,
      mailingListIntegration: false,
      instantCheckout: false,
      leadCollection: false,
      leadExport: false,
      dataExport: false,
      leadMagnets: false,
      maxStorefrontPages: 0,
      multiplePages: 0,
      storePagesLimit: 0,
      store_pages: false,
      store_sections: false,
      couponCodes: false,
      coupons: false,
      emailBroadcasts: false,
      customerManagement: 'preview',
      salesAnalytics: 'preview',
      audienceInsights: false,
      conversionAnalytics: false,
      customBranding: false,
      removeBranding: false,
      prioritySupport: false,
      platformFeePercent: 0,
    },
    displayFeatures: [
      'Full dashboard & editor preview',
      'Explore analytics & AutoDM interface',
      'Design your storefront layout',
      'Upgrade to launch & sell',
    ],
  },
  CREATOR: {
    id: 'CREATOR',
    name: 'Creator',
    currency: 'USD',
    billingPeriod: 'month',
    headline: 'Launch your store.',
    description: 'Everything you need to turn your audience into your first customers.',
    supportingText: 'Best for creators ready to start selling.',
    badge: null,
    isPaid: true,
    entitlements: {
      canPublish: true,
      canSell: true,
      canReceivePayments: true,
      canActivateAutoDm: true,
      storefront: true,
      unlimitedLinks: true,
      links: true,
      digitalProducts: true,
      products: true,
      coaching: true,
      bookings: true,
      coaching_bookings: true,
      courses: true,
      online_courses: true,
      productCheckout: true,
      instantCheckout: true,
      digitalDelivery: true,
      collections: true,
      productVariants: 'limited',
      productVariantsLimit: 5,
      basicAnalytics: true,
      creatorAnalytics: 'basic',
      advancedAnalytics: false,
      instagramAutoDm: 'standard',
      automations: true,
      autoDmCampaignsLimit: Infinity,
      customStorefrontDesigns: true,
      mailingListIntegration: true,
      leadCollection: true,
      leadExport: false,
      dataExport: false,
      leadMagnets: true,
      maxStorefrontPages: 3,
      multiplePages: 3,
      storePagesLimit: 3,
      store_pages: true,
      store_sections: true,
      couponCodes: true,
      coupons: true,
      emailBroadcasts: true,
      customerManagement: 'basic',
      salesAnalytics: 'basic',
      audienceInsights: false,
      conversionAnalytics: false,
      customBranding: false,
      removeBranding: false,
      prioritySupport: false,
      platformFeePercent: 0,
    },
    displayFeatures: [
      'Single bio link storefront',
      'Unlimited digital products & sales',
      'Instant checkout & digital delivery',
      '0% CreatorStore platform transaction fees',
      'Built-in UPI, card & PayPal payment support',
      'Basic analytics',
      'Unlimited Instagram Auto-DMs',
      'Custom storefront designs',
      'Mailing list integration',
      'Up to 3 pages on your storefront',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    currency: 'USD',
    billingPeriod: 'month',
    headline: 'Scale your business.',
    description: 'Advanced automation, analytics, branding, and growth tools for creators who are ready to grow.',
    supportingText: 'Best for creators who want to automate, analyze, and grow.',
    badge: 'BEST FOR GROWING CREATORS',
    recommended: true,
    isPaid: true,
    entitlements: {
      canPublish: true,
      canSell: true,
      canReceivePayments: true,
      canActivateAutoDm: true,
      storefront: true,
      unlimitedLinks: true,
      links: true,
      digitalProducts: true,
      products: true,
      coaching: true,
      bookings: true,
      coaching_bookings: true,
      courses: true,
      online_courses: true,
      productCheckout: true,
      instantCheckout: true,
      digitalDelivery: true,
      collections: true,
      productVariants: 'unlimited',
      productVariantsLimit: Infinity,
      basicAnalytics: true,
      creatorAnalytics: 'advanced',
      advancedAnalytics: true,
      instagramAutoDm: 'advanced',
      automations: true,
      autoDmCampaignsLimit: Infinity,
      customStorefrontDesigns: true,
      mailingListIntegration: true,
      leadCollection: true,
      leadExport: true,
      dataExport: true,
      leadMagnets: true,
      maxStorefrontPages: Infinity,
      multiplePages: Infinity,
      storePagesLimit: Infinity,
      store_pages: true,
      store_sections: true,
      couponCodes: true,
      coupons: true,
      emailBroadcasts: true,
      customerManagement: 'advanced',
      salesAnalytics: 'advanced',
      audienceInsights: true,
      conversionAnalytics: true,
      customBranding: true,
      removeBranding: true,
      prioritySupport: true,
      platformFeePercent: 0,
    },
    displayFeatures: [
      'Everything in Creator, plus:',
      'Advanced analytics',
      'Data export',
      'Remove CreatorStore branding',
      'Unlimited pages on your storefront',
    ],
  },
}

/**
 * Normalizes subscription plan names.
 * Unsubscribed / inactive users get UNSUBSCRIBED.
 * Active subscriptions get CREATOR or PRO.
 */
export function normalizePlanId(planInput, status = 'ACTIVE') {
  if (status !== 'ACTIVE' && status !== 'TRIALING') {
    return PLAN_IDS.UNSUBSCRIBED
  }

  if (!planInput) return PLAN_IDS.UNSUBSCRIBED
  const str = String(planInput).trim().toUpperCase()

  if (str === 'FREE' || str === 'UNSUBSCRIBED' || str === 'STARTER' || str === 'NONE') {
    return PLAN_IDS.UNSUBSCRIBED
  }

  if (str === 'PRO' || str === 'MAX' || str === 'CREATOR_PRO' || str === 'YEARLY' || str === 'MONTHLY') {
    return PLAN_IDS.PRO
  }
  if (str === 'CREATOR' || str === 'CREATOR_MONTHLY') {
    return PLAN_IDS.CREATOR
  }

  return PLAN_IDS.UNSUBSCRIBED
}

/**
 * Returns full plan definition with entitlements and dynamic prices from environment variables
 */
export function getPlanConfig(planInput, status = 'ACTIVE', interval = 'monthly', currency = 'USD') {
  const planId = normalizePlanId(planInput, status)
  const base = PLAN_FEATURES[planId] || PLAN_FEATURES.UNSUBSCRIBED
  const normCurrency = String(currency || 'USD').toUpperCase().trim()
  const pricing = getSubscriptionPricing(normCurrency, interval)
  const isAnnual = String(interval).toLowerCase().trim() === 'annual' || String(interval).toLowerCase().trim() === 'yearly'
  const periodSuffix = isAnnual ? '/year' : '/mo'

  if (planId === PLAN_IDS.CREATOR) {
    const p = pricing.CREATOR
    return {
      ...base,
      price: p.price,
      currency: p.currency,
      interval: isAnnual ? 'annual' : 'monthly',
      priceFormatted: p.priceFormatted,
      periodLabel: periodSuffix,
      headline: `Start Selling for ${p.priceFormatted}${periodSuffix}`,
      ctaText: `Start with Creator — ${p.priceFormatted}${periodSuffix}`,
    }
  }

  if (planId === PLAN_IDS.PRO) {
    const p = pricing.PRO
    return {
      ...base,
      price: p.price,
      currency: p.currency,
      interval: isAnnual ? 'annual' : 'monthly',
      priceFormatted: p.priceFormatted,
      periodLabel: periodSuffix,
      headline: `Scale your business for ${p.priceFormatted}${periodSuffix}`,
      ctaText: `Go Pro — ${p.priceFormatted}${periodSuffix}`,
    }
  }

  return base
}

/**
 * Checks whether a given plan has access to a boolean feature entitlement
 */
export function hasEntitlement(planInput, featureKey, status = 'ACTIVE') {
  const plan = getPlanConfig(planInput, status)
  if (featureKey === 'store_sections') {
    return Boolean(plan.entitlements.store_sections || plan.entitlements.storefront || plan.entitlements.unlimitedLinks)
  }
  if (featureKey === 'store_pages' || featureKey === 'storefront_pages') {
    return Boolean(plan.entitlements.store_pages || (plan.entitlements.storePagesLimit && plan.entitlements.storePagesLimit > 0) || (plan.entitlements.multiplePages && plan.entitlements.multiplePages > 0))
  }
  if (featureKey === 'products' || featureKey === 'digital_products' || featureKey === 'digitalProducts') {
    return Boolean(plan.entitlements.products || plan.entitlements.digitalProducts || plan.entitlements.canSell)
  }
  if (featureKey === 'coaching' || featureKey === 'bookings' || featureKey === 'coaching_bookings') {
    return Boolean(plan.entitlements.coaching || plan.entitlements.bookings || plan.entitlements.coaching_bookings || plan.entitlements.digitalProducts || plan.entitlements.canSell)
  }
  if (featureKey === 'courses' || featureKey === 'online_courses') {
    return Boolean(plan.entitlements.courses || plan.entitlements.online_courses || plan.entitlements.digitalProducts || plan.entitlements.canSell)
  }
  if (featureKey === 'links') {
    return Boolean(plan.entitlements.links || plan.entitlements.unlimitedLinks)
  }
  if (featureKey === 'coupons' || featureKey === 'coupons_discounts') {
    return Boolean(plan.entitlements.coupons || plan.entitlements.couponCodes)
  }
  if (featureKey === 'automations' || featureKey === 'instagram_autodm') {
    return Boolean(plan.entitlements.automations || plan.entitlements.canActivateAutoDm || (plan.entitlements.instagramAutoDm && plan.entitlements.instagramAutoDm !== 'preview'))
  }
  if (featureKey === 'basicAnalytics' || featureKey === 'basic_analytics') {
    return Boolean(plan.entitlements.basicAnalytics || (plan.entitlements.creatorAnalytics && plan.entitlements.creatorAnalytics !== 'preview'))
  }
  if (featureKey === 'advancedAnalytics' || featureKey === 'advanced_analytics') {
    return Boolean(plan.entitlements.advancedAnalytics)
  }
  if (featureKey === 'customStorefrontDesigns' || featureKey === 'custom_storefront_designs') {
    return Boolean(plan.entitlements.customStorefrontDesigns || plan.entitlements.storefront)
  }
  if (featureKey === 'mailingListIntegration' || featureKey === 'mailing_list_integration') {
    return Boolean(plan.entitlements.mailingListIntegration || plan.entitlements.emailBroadcasts)
  }
  if (featureKey === 'instantCheckout' || featureKey === 'instant_checkout' || featureKey === 'digitalDelivery' || featureKey === 'digital_delivery') {
    return Boolean(plan.entitlements.instantCheckout || plan.entitlements.digitalDelivery || plan.entitlements.productCheckout)
  }
  if (featureKey === 'dataExport' || featureKey === 'data_export' || featureKey === 'lead_export') {
    return Boolean(plan.entitlements.dataExport || plan.entitlements.leadExport)
  }
  if (featureKey === 'remove_branding' || featureKey === 'removeBranding') {
    return Boolean(plan.entitlements.removeBranding)
  }
  const val = plan.entitlements[featureKey]
  if (typeof val === 'boolean') return val
  if (val === 'advanced' || val === 'unlimited' || val === 'standard') return true
  return Boolean(val)
}

/**
 * Returns numeric or discrete limit for an entitlement
 */
export function getEntitlementLimit(planInput, limitKey, status = 'ACTIVE') {
  const plan = getPlanConfig(planInput, status)
  return plan.entitlements[limitKey] ?? 0
}

export function resolveCreatorPlan(subscription) {
  if (!subscription) return PLAN_IDS.UNSUBSCRIBED
  const status = subscription.status || subscription.rawStatus || 'INACTIVE'
  const plan = subscription.planId || subscription.plan || 'UNSUBSCRIBED'

  // Dynamic trial expiration check if trialEndsAt is present
  if (status === 'TRIALING' || subscription.trialStatus === 'ACTIVE') {
    const now = new Date()
    if (subscription.trialEndsAt && new Date(subscription.trialEndsAt) <= now) {
      return PLAN_IDS.UNSUBSCRIBED
    }
    return PLAN_IDS.PRO
  }

  return normalizePlanId(plan, status)
}

export const COMPARISON_TABLE_ROWS = [
  { key: 'storefront_pages', name: 'Storefront Pages', feature: 'Storefront Pages', creator: 'Up to 3 Pages', starter: 'Up to 3 Pages', pro: 'Unlimited Pages' },
  { key: 'digital_products', name: 'Digital Products & Downloads', feature: 'Digital Products & Downloads', creator: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { key: 'online_courses', name: 'Online Courses & Video LMS', feature: 'Online Courses & Video LMS', creator: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { key: 'coaching_bookings', name: '1:1 Coaching & Bookings', feature: '1:1 Coaching & Bookings', creator: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { key: 'memberships_communities', name: 'Memberships & Communities', feature: 'Memberships & Communities', creator: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { key: 'instagram_autodm', name: 'Instagram AutoDM & Automations', feature: 'Instagram AutoDM & Automations', creator: true, starter: true, pro: true },
  { key: 'lead_magnets', name: 'Leads & Lead Magnets', feature: 'Leads & Lead Magnets', creator: true, starter: true, pro: true },
  { key: 'coupons_discounts', name: 'Coupons & Discounts', feature: 'Coupons & Discounts', creator: true, starter: true, pro: true },
  { key: 'email_broadcasts', name: 'Email Broadcasts', feature: 'Email Broadcasts', creator: true, starter: true, pro: true },
  { key: 'data_export', name: 'Data Export (CSV)', feature: 'Data Export (CSV)', creator: false, starter: false, pro: true },
  { key: 'remove_branding', name: 'Remove CreatorStore Branding', feature: 'Remove CreatorStore Branding', creator: false, starter: false, pro: true },
  { key: 'platform_fee', name: 'Platform Transaction Fee', feature: 'Platform Transaction Fee', creator: '0%', starter: '0%', pro: '0%' },
  { key: 'payment_methods', name: 'UPI, Card & PayPal Payment Support', feature: 'UPI, Card & PayPal Payment Support', creator: true, starter: true, pro: true },
  { key: 'analytics', name: 'Traffic & Conversion Analytics', feature: 'Traffic & Conversion Analytics', creator: 'Basic', starter: 'Basic', pro: 'Advanced' },
  { key: 'priority_support', name: 'Priority 24/7 Support', feature: 'Priority 24/7 Support', creator: false, starter: false, pro: true },
]

