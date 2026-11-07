-- ==============================================================================
-- MIGRATION: 20261028235000_enable_supabase_rls_and_policies
-- DESCRIPTION: Enable Row Level Security (RLS) across all tables in public schema
--              and implement least-privilege policies for anon and authenticated roles.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enable Row Level Security (RLS) on all public tables
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS _prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS store_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creator_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS checkout_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS course_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auto_dm_queue_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auto_dm_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coaching_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coaching_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payout_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payout_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscription_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Drop any legacy/conflicting policies if they exist
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Core Identity & User Policies
-- ------------------------------------------------------------------------------
-- Users can only read their own record; no anonymous read; no client insert/delete
CREATE POLICY "users_select_self" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_update_self" ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Creator Profiles: Public can view completed profiles; creator can edit own
CREATE POLICY "creator_profiles_select_public" ON creator_profiles
  FOR SELECT TO public
  USING (onboarding_complete = true OR creator_id = auth.uid());

CREATE POLICY "creator_profiles_insert_own" ON creator_profiles
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "creator_profiles_update_own" ON creator_profiles
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 4. Storefront & Catalog Policies
-- ------------------------------------------------------------------------------
-- Stores: Public read published stores; creator manages own store
CREATE POLICY "stores_select_public" ON stores
  FOR SELECT TO public
  USING (published = true OR creator_id = auth.uid());

CREATE POLICY "stores_insert_own" ON stores
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "stores_update_own" ON stores
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "stores_delete_own" ON stores
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- Store Sections: Public read visible sections; creator manages own
CREATE POLICY "store_sections_select_public" ON store_sections
  FOR SELECT TO public
  USING (hidden = false OR creator_id = auth.uid());

CREATE POLICY "store_sections_insert_own" ON store_sections
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "store_sections_update_own" ON store_sections
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "store_sections_delete_own" ON store_sections
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- Products: Public read published products; creator manages own
CREATE POLICY "products_select_published" ON products
  FOR SELECT TO public
  USING ((status = 'PUBLISHED' AND store_published = true) OR creator_id = auth.uid());

CREATE POLICY "products_insert_own" ON products
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "products_update_own" ON products
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "products_delete_own" ON products
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- Bundle Items: Public read for published bundle; creator manages own
CREATE POLICY "bundle_items_select" ON bundle_items
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = bundle_items.bundle_id 
      AND (p.status = 'PUBLISHED' OR p.creator_id = auth.uid())
  ));

CREATE POLICY "bundle_items_manage_own" ON bundle_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = bundle_items.bundle_id 
      AND p.creator_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = bundle_items.bundle_id 
      AND p.creator_id = auth.uid()
  ));

-- Checkout Fields: Public read fields for published products; creator manages own
CREATE POLICY "checkout_fields_select" ON checkout_fields
  FOR SELECT TO public
  USING (creator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = checkout_fields.product_id 
      AND p.status = 'PUBLISHED'
  ));

CREATE POLICY "checkout_fields_manage_own" ON checkout_fields
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Coupons: Public read active coupons; creator manages own
CREATE POLICY "coupons_select" ON coupons
  FOR SELECT TO public
  USING (status = 'ACTIVE' OR creator_id = auth.uid());

CREATE POLICY "coupons_manage_own" ON coupons
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 5. Course & Learning Policies
-- ------------------------------------------------------------------------------
-- Courses: Public read published courses; creator manages own
CREATE POLICY "courses_select" ON courses
  FOR SELECT TO public
  USING (published = true OR creator_id = auth.uid());

CREATE POLICY "courses_manage_own" ON courses
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Course Modules: Public read for published courses; creator manages own
CREATE POLICY "course_modules_select" ON course_modules
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM courses c 
    WHERE c.id = course_modules.course_id 
      AND (c.published = true OR c.creator_id = auth.uid())
  ));

CREATE POLICY "course_modules_manage_own" ON course_modules
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Course Lessons: Free previews are public; full lessons require creator ownership
CREATE POLICY "course_lessons_select" ON course_lessons
  FOR SELECT TO public
  USING (
    (free_preview = true AND EXISTS (
      SELECT 1 FROM courses c 
      WHERE c.id = course_lessons.course_id 
        AND c.published = true
    )) 
    OR creator_id = auth.uid()
  );

CREATE POLICY "course_lessons_manage_own" ON course_lessons
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Course Progress: Student can view and update own progress; course creator can view
CREATE POLICY "course_progress_select_own" ON course_progress
  FOR SELECT TO authenticated
  USING (
    customer_id = (auth.jwt() ->> 'sub')::uuid 
    OR EXISTS (
      SELECT 1 FROM courses c 
      WHERE c.id = course_progress.course_id 
        AND c.creator_id = auth.uid()
    )
  );

CREATE POLICY "course_progress_update_own" ON course_progress
  FOR ALL TO authenticated
  USING (customer_id = (auth.jwt() ->> 'sub')::uuid)
  WITH CHECK (customer_id = (auth.jwt() ->> 'sub')::uuid);

-- Course Certificates: Public verification of issued certificates
CREATE POLICY "course_certificates_select" ON course_certificates
  FOR SELECT TO public
  USING (
    certificate_id IS NOT NULL 
    OR customer_id = (auth.jwt() ->> 'sub')::uuid 
    OR EXISTS (
      SELECT 1 FROM courses c 
      WHERE c.id = course_certificates.course_id 
        AND c.creator_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 6. Coaching & Consultations
-- ------------------------------------------------------------------------------
-- Coaching Configs: Public read for published products; creator manages own
CREATE POLICY "coaching_configs_select" ON coaching_configs
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = coaching_configs.product_id 
      AND (p.status = 'PUBLISHED' OR p.creator_id = auth.uid())
  ));

CREATE POLICY "coaching_configs_manage_own" ON coaching_configs
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Coaching Bookings: Creator and booked customer can view; no client modification
CREATE POLICY "coaching_bookings_select" ON coaching_bookings
  FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid() 
    OR customer_email = (auth.jwt() ->> 'email')
  );

-- ------------------------------------------------------------------------------
-- 7. Orders, Entitlements & Customer Privacy (ZERO Anonymous Access)
-- ------------------------------------------------------------------------------
-- Customers: Only the owning creator can view customer lists
CREATE POLICY "customers_select_own_creator" ON customers
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Orders: Creator and purchasing customer can view; no client insertion/update
CREATE POLICY "orders_select_own" ON orders
  FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid() 
    OR customer_email = (auth.jwt() ->> 'email')
  );

-- Entitlements: Customer can view own entitlement; product creator can view
CREATE POLICY "entitlements_select_own" ON entitlements
  FOR SELECT TO authenticated
  USING (
    customer_email = (auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM products p 
      WHERE p.id = entitlements.product_id 
        AND p.creator_id = auth.uid()
    )
  );

-- Product Access Tokens: Completely private; no client access (server-side only)
-- (No policies created -> default deny for anon and authenticated)

-- ------------------------------------------------------------------------------
-- 8. Subscriptions & Financial Data
-- ------------------------------------------------------------------------------
-- Creator Subscriptions: Creator can view own subscription state; no client update
CREATE POLICY "creator_subscriptions_select_own" ON creator_subscriptions
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Subscription Invoices: Creator can view own invoices
CREATE POLICY "subscription_invoices_select_own" ON subscription_invoices
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Subscription Audit Logs: Creator can view own logs
CREATE POLICY "subscription_audit_logs_select_own" ON subscription_audit_logs
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Payout Profiles: Creator can view, insert, and update their own banking details
CREATE POLICY "payout_profiles_select_own" ON payout_profiles
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "payout_profiles_insert_own" ON payout_profiles
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "payout_profiles_update_own" ON payout_profiles
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Payout Audit Logs: Creator can view own verification logs
CREATE POLICY "payout_audit_logs_select_own" ON payout_audit_logs
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 9. Instagram & Automations
-- ------------------------------------------------------------------------------
-- Instagram Accounts: Creator can view own account metadata
CREATE POLICY "instagram_accounts_select_own" ON instagram_accounts
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Automations: Creator manages own automation rules
CREATE POLICY "automations_manage_own" ON automations
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Automation Events: Creator can view analytics events
CREATE POLICY "automation_events_select_own" ON automation_events
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Auto-DM Queue & Rate Limits: Creator can view own queue; execution is server-only
CREATE POLICY "auto_dm_queue_jobs_select_own" ON auto_dm_queue_jobs
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "auto_dm_rate_limits_select_own" ON auto_dm_rate_limits
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 10. Forms, Leads & Notifications
-- ------------------------------------------------------------------------------
-- Forms: Public can view active forms; creator manages own
CREATE POLICY "forms_select" ON forms
  FOR SELECT TO public
  USING (status = 'ACTIVE' OR creator_id = auth.uid());

CREATE POLICY "forms_manage_own" ON forms
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Form Submissions: Public can submit to active form; creator views and manages
CREATE POLICY "form_submissions_select_own" ON form_submissions
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "form_submissions_insert_public" ON form_submissions
  FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM forms f 
    WHERE f.id = form_submissions.form_id 
      AND f.status = 'ACTIVE'
  ));

CREATE POLICY "form_submissions_manage_own" ON form_submissions
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Newsletter Subscribers: Public can subscribe; creator views and manages
CREATE POLICY "newsletter_subscribers_select_own" ON newsletter_subscribers
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "newsletter_subscribers_insert_public" ON newsletter_subscribers
  FOR INSERT TO public
  WITH CHECK (creator_id IS NOT NULL);

CREATE POLICY "newsletter_subscribers_manage_own" ON newsletter_subscribers
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Notifications: User views and marks read their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Support Tickets: Creator submits and views their own tickets
CREATE POLICY "support_tickets_select_own" ON support_tickets
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "support_tickets_insert_own" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 11. Backend & Server Role Permissions (Zero Impact on Prisma & Webhooks)
-- ------------------------------------------------------------------------------
-- Revoke default wide-open privileges from anon and authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Grant SELECT on public catalog/storefront resources
GRANT SELECT ON TABLE 
  creator_profiles, 
  stores, 
  store_sections, 
  products, 
  bundle_items, 
  checkout_fields, 
  coupons, 
  courses, 
  course_modules, 
  course_lessons, 
  course_certificates, 
  coaching_configs, 
  forms 
TO anon, authenticated;

-- Grant INSERT on public lead-capture forms & newsletter subscriptions
GRANT INSERT ON TABLE 
  form_submissions, 
  newsletter_subscribers 
TO anon, authenticated;

-- Grant authenticated creators permissions to manage their resources
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
  creator_profiles, 
  stores, 
  store_sections, 
  products, 
  bundle_items, 
  checkout_fields, 
  coupons, 
  courses, 
  course_modules, 
  course_lessons, 
  coaching_configs, 
  payout_profiles, 
  automations, 
  forms, 
  form_submissions, 
  newsletter_subscribers 
TO authenticated;

-- Grant authenticated users SELECT on personal tenant data
GRANT SELECT ON TABLE 
  users, 
  customers, 
  orders, 
  entitlements, 
  course_progress, 
  creator_subscriptions, 
  subscription_invoices, 
  subscription_audit_logs, 
  payout_audit_logs, 
  instagram_accounts, 
  automation_events, 
  auto_dm_queue_jobs, 
  auto_dm_rate_limits, 
  coaching_bookings, 
  notifications, 
  support_tickets 
TO authenticated;

-- Grant authenticated users UPDATE on self-owned rows
GRANT UPDATE ON TABLE 
  users, 
  notifications, 
  course_progress 
TO authenticated;

-- Grant authenticated users INSERT on support tickets
GRANT INSERT ON TABLE 
  support_tickets 
TO authenticated;

-- Ensure service_role and postgres retain full privileges
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role, postgres;
