-- ════════════════════════════════════════════════════════════════════════
-- فاز ۵ — پرداخت زرین‌پال + اتصال تلگرام + دعوت کانال
-- ADDITIVE · idempotent · append-only (همان الگوی فازهای قبل).
-- به جدول‌ها/ستون‌های موجود دست نمی‌زند. چند بار اجرا شدنش امن است.
--
-- مسیرهای نوشتن حساس همگی از توابع SECURITY DEFINER عبور می‌کنند تا
-- audit و قواعد گذارِ وضعیت قابل دور زدن نباشند:
--   • create_payment()             → authenticated (کاربر برای خودش)
--   • verify_payment()/fail_payment→ service_role (فقط سرورِ مورد اعتماد پس از verify زرین‌پال)
--   • generate_telegram_link_code()→ authenticated
--   • redeem_link_code()           → service_role (وبهوک تلگرام)
-- پیش‌نیاز: supabase_schema.sql (is_admin) و supabase_portfolio_versioning.sql
--           (portfolio_versions, audit_log, deny_mutation) اجرا شده باشند.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. جدول‌ها ───────────────────────────────────────────────────────────

-- پرداخت‌ها: هر تلاش یک ردیف. append-only — هرگز حذف نمی‌شود و ردیفِ
-- نهایی‌شده بازنویسی نمی‌شود؛ تنها گذارِ مجاز pending → paid|failed است.
-- user_id به‌صورت uuid ساده (بدون FK cascade) تا تاریخچهٔ مالی حتی پس از
-- حذف کاربر حفظ شود.
CREATE TABLE IF NOT EXISTS public.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  amount      integer NOT NULL,                    -- مبلغ به تومان (مرجعِ معتبر سمت سرور)
  authority   text UNIQUE,                          -- شناسهٔ تراکنش زرین‌پال
  ref_id      text,                                 -- کد رهگیری پس از verify
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','paid','failed')),
  invite_link text,                                 -- لینک دعوت تک‌نفرهٔ کانال (پس از پرداخت موفق)
  created_at  timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payments_user     ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(status, created_at DESC);

-- اتصال حساب تلگرام به کاربر سایت (یک حساب تلگرام ↔ یک کاربر).
CREATE TABLE IF NOT EXISTS public.telegram_links (
  user_id          uuid PRIMARY KEY,
  telegram_user_id bigint NOT NULL,
  linked_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_links_tg
  ON public.telegram_links(telegram_user_id);

-- کدهای یک‌بارمصرفِ اتصال (۶رقمی، انقضای ۱۰ دقیقه).
CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL,
  user_id    uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_codes_code
  ON public.telegram_link_codes(code) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_link_codes_user
  ON public.telegram_link_codes(user_id, created_at DESC);

-- ── 2. نگهبانِ append-only برای payments ────────────────────────────────
-- حذف هرگز مجاز نیست. به‌روزرسانی فقط برای نهایی‌سازیِ یک ردیفِ pending و
-- بدون دست‌کاریِ فیلدهای پایه (کاربر/مبلغ/authority/زمان ایجاد).
CREATE OR REPLACE FUNCTION public.payments_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'حذف پرداخت مجاز نیست (این جدول append-only است).';
  END IF;
  -- TG_OP = 'UPDATE'
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'پرداختِ نهایی‌شده قابل تغییر نیست.';
  END IF;
  IF NEW.status NOT IN ('paid','failed') THEN
    RAISE EXCEPTION 'گذارِ وضعیتِ پرداخت نامعتبر است.';
  END IF;
  IF NEW.user_id  <> OLD.user_id
     OR NEW.amount <> OLD.amount
     OR NEW.authority IS DISTINCT FROM OLD.authority
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'فیلدهای پایهٔ پرداخت تغییرناپذیرند.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_no_delete ON public.payments;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_guard();

DROP TRIGGER IF EXISTS payments_guard_update ON public.payments;
CREATE TRIGGER payments_guard_update BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_guard();

-- ── 3. RLS — خواندنی برای صاحبِ ردیف/ادمین؛ نوشتن فقط از طریق توابع ──────
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('payments','telegram_links','telegram_link_codes')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- کاربر ردیف خودش را می‌خواند؛ ادمین همه را.
CREATE POLICY "payments_self_read" ON public.payments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "tg_links_self_read" ON public.telegram_links
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "tg_codes_self_read" ON public.telegram_link_codes
  FOR SELECT USING (auth.uid() = user_id);

-- هیچ سیاست INSERT/UPDATE/DELETE — پس تنها توابع SECURITY DEFINER و
-- service_role می‌توانند بنویسند؛ کلاینت‌ها مستقیماً نمی‌توانند.

-- ── 4. توابعِ پرداخت ────────────────────────────────────────────────────

-- ساخت ردیف pending پس از گرفتن authority از زرین‌پال. کاربر برای خودش.
CREATE OR REPLACE FUNCTION public.create_payment(
  p_amount    integer,
  p_authority text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ نامعتبر.';
  END IF;

  INSERT INTO public.payments (user_id, amount, authority, status)
  VALUES (auth.uid(), p_amount, p_authority, 'pending')
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'payment.request', 'payment', auth.uid(),
          jsonb_build_object('amount', p_amount, 'authority', p_authority));

  RETURN v_id;
END $$;

-- تأییدِ نهاییِ پرداخت — فقط سرورِ مورد اعتماد پس از verify واقعیِ زرین‌پال.
-- amount را با ردیفِ pending خودمان تطبیق می‌دهد (به پارامترهای برگشتی
-- اعتماد نمی‌کنیم). idempotent: اگر قبلاً paid شده، همان user_id را برمی‌گرداند.
CREATE OR REPLACE FUNCTION public.verify_payment(
  p_authority   text,
  p_ref_id      text,
  p_amount      integer,
  p_invite_link text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_user   uuid;
  v_amount integer;
  v_status text;
BEGIN
  SELECT id, user_id, amount, status
    INTO v_id, v_user, v_amount, v_status
    FROM public.payments WHERE authority = p_authority FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'پرداختی با این authority یافت نشد.';
  END IF;
  IF v_status = 'paid' THEN
    RETURN v_user;                         -- قبلاً تأیید شده (idempotent)
  END IF;
  IF v_amount <> p_amount THEN
    RAISE EXCEPTION 'عدم تطبیق مبلغ پرداخت.';
  END IF;

  UPDATE public.payments
     SET status = 'paid', ref_id = p_ref_id,
         verified_at = now(), invite_link = p_invite_link
   WHERE id = v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (v_user, 'payment.verify', 'payment', v_user,
          jsonb_build_object('amount', v_amount, 'authority', p_authority, 'ref_id', p_ref_id));

  RETURN v_user;
END $$;

-- علامت‌گذاری پرداختِ ناموفق (verify زرین‌پال شکست خورد).
CREATE OR REPLACE FUNCTION public.fail_payment(p_authority text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_status text;
BEGIN
  SELECT user_id, status INTO v_user, v_status
    FROM public.payments WHERE authority = p_authority FOR UPDATE;
  IF v_user IS NULL OR v_status <> 'pending' THEN
    RETURN;
  END IF;

  UPDATE public.payments SET status = 'failed' WHERE authority = p_authority;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (v_user, 'payment.failed', 'payment', v_user,
          jsonb_build_object('authority', p_authority));
END $$;

-- ── 5. توابعِ اتصال تلگرام ──────────────────────────────────────────────

-- ساخت کد ۶رقمیِ یک‌بارمصرف با انقضای ۱۰ دقیقه؛ کدهای فعالِ قبلی همین کاربر
-- را باطل می‌کند تا همیشه فقط یک کد معتبر داشته باشد.
CREATE OR REPLACE FUNCTION public.generate_telegram_link_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.';
  END IF;

  -- باطل‌سازیِ کدهای فعالِ قبلی
  UPDATE public.telegram_link_codes
     SET expires_at = now()
   WHERE user_id = auth.uid() AND used_at IS NULL AND expires_at > now();

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  INSERT INTO public.telegram_link_codes (code, user_id, expires_at)
  VALUES (v_code, auth.uid(), now() + interval '10 minutes');

  RETURN v_code;
END $$;

-- مصرف کد و ثبت اتصال — فقط وبهوکِ تلگرام (service_role). در صورت موفقیت
-- user_id سایت را برمی‌گرداند، وگرنه NULL.
CREATE OR REPLACE FUNCTION public.redeem_link_code(
  p_code   text,
  p_tg_user_id bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_code_id uuid; v_user uuid;
BEGIN
  SELECT id, user_id INTO v_code_id, v_user
    FROM public.telegram_link_codes
   WHERE code = p_code AND used_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF v_code_id IS NULL THEN
    RETURN NULL;                           -- نامعتبر یا منقضی
  END IF;

  UPDATE public.telegram_link_codes SET used_at = now() WHERE id = v_code_id;

  INSERT INTO public.telegram_links (user_id, telegram_user_id, linked_at)
  VALUES (v_user, p_tg_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET telegram_user_id = EXCLUDED.telegram_user_id, linked_at = now();

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (v_user, 'telegram.link', 'telegram', v_user,
          jsonb_build_object('telegram_user_id', p_tg_user_id));

  RETURN v_user;
END $$;

-- ── 6. Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_payment(integer, text)              FROM public;
REVOKE ALL ON FUNCTION public.verify_payment(text, text, integer, text)  FROM public;
REVOKE ALL ON FUNCTION public.fail_payment(text)                         FROM public;
REVOKE ALL ON FUNCTION public.generate_telegram_link_code()              FROM public;
REVOKE ALL ON FUNCTION public.redeem_link_code(text, bigint)             FROM public;

-- کاربرِ واردشده: فقط ساخت پرداخت و کد اتصال برای خودش
GRANT EXECUTE ON FUNCTION public.create_payment(integer, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_telegram_link_code()           TO authenticated;

-- سرورِ مورد اعتماد (service_role): نهایی‌سازیِ پرداخت و مصرفِ کد
GRANT EXECUTE ON FUNCTION public.verify_payment(text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment(text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_link_code(text, bigint)            TO service_role;
