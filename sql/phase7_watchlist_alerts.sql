-- ════════════════════════════════════════════════════════════════════════
-- فاز ۷ — رصد بازار v2: واچ‌لیست + هشدار قیمتی + تاریخچهٔ هشدارها
-- ADDITIVE · idempotent · به جدول‌ها/ستون‌های موجود دست نمی‌زند.
--
-- • watchlist_items  : ترجیحِ کاربر — قابل افزودن/حذف؛ سقف ۲۰ نماد (trigger).
-- • price_alerts     : تعریف هشدار — قابل ویرایش/حذف/فعال‌وغیرفعال توسط کاربر.
-- • alert_events     : تاریخچهٔ هشدارهای ارسال‌شده — append-only (deny_mutation).
-- هشدار پس از trigger یک‌بار خودکار غیرفعال می‌شود (one-shot) تا اسپم نشود.
--
-- پیش‌نیاز: supabase_schema.sql (is_admin) و supabase_portfolio_versioning.sql
--           (deny_mutation). تحویلِ DM از زیرساخت تلگرامِ فاز ۵ استفاده می‌کند.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $$;

-- ── 1. جدول‌ها ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid(),    -- از سشن؛ RLS مالکیت را تضمین می‌کند
  symbol     text NOT NULL,                       -- شناسهٔ منبع (مثلاً 'bitcoin')
  market     text NOT NULL CHECK (market IN ('tse','crypto','gold_fx')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, market, symbol)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON public.watchlist_items(user_id);

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid(),  -- از سشن؛ RLS مالکیت را تضمین می‌کند
  symbol       text NOT NULL,
  market       text NOT NULL CHECK (market IN ('tse','crypto','gold_fx')),
  condition    text NOT NULL CHECK (condition IN ('above','below')),
  target_price numeric NOT NULL CHECK (target_price > 0),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_user   ON public.price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON public.price_alerts(active, market) WHERE active;

CREATE TABLE IF NOT EXISTS public.alert_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        uuid NOT NULL,
  user_id         uuid NOT NULL,
  triggered_price numeric NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('telegram','in_app')),
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_user ON public.alert_events(user_id, sent_at DESC);

-- ── 2. سقف ۲۰ نمادِ واچ‌لیست (backstopِ سمت DB علاوه بر چک API) ──────────
CREATE OR REPLACE FUNCTION public.watchlist_cap()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.watchlist_items WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION 'سقف واچ‌لیست ۲۰ نماد است.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS watchlist_cap_trg ON public.watchlist_items;
CREATE TRIGGER watchlist_cap_trg BEFORE INSERT ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.watchlist_cap();

-- alert_events فقط افزایشی
DROP TRIGGER IF EXISTS no_mutation ON public.alert_events;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.alert_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

-- ── 3. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('watchlist_items','price_alerts','alert_events')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- واچ‌لیست: صاحبش کامل CRUD (دادهٔ ترجیحی)
CREATE POLICY "wl_self_all" ON public.watchlist_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- هشدارها: صاحبش کامل CRUD (قابل ویرایش/حذف)
CREATE POLICY "al_self_all" ON public.price_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- تاریخچهٔ هشدارها: صاحبش می‌خواند + ادمین؛ نوشتن فقط از تابعِ service_role
CREATE POLICY "ae_self_read" ON public.alert_events
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- ── 4. شلیکِ اتمیکِ هشدار (یک‌بار) — فقط سرورِ مورد اعتماد ───────────────
-- به‌صورت اتمیک هشدار را غیرفعال می‌کند و رویداد را ثبت می‌کند. اگر قبلاً
-- شلیک شده باشد (رقابتِ چند اینستنس) NULL برمی‌گرداند تا DMِ تکراری نرود.
CREATE OR REPLACE FUNCTION public.claim_alert(
  p_alert_id uuid,
  p_price    numeric,
  p_channel  text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  UPDATE public.price_alerts
     SET active = false
   WHERE id = p_alert_id AND active = true
   RETURNING user_id INTO v_user;

  IF v_user IS NULL THEN
    RETURN NULL;                            -- قبلاً شلیک شده / رقابت را باخت
  END IF;

  INSERT INTO public.alert_events (alert_id, user_id, triggered_price, channel)
  VALUES (p_alert_id, v_user, p_price, p_channel);

  RETURN v_user;
END $$;

REVOKE ALL ON FUNCTION public.claim_alert(uuid, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_alert(uuid, numeric, text) TO service_role;
