-- =============================================================================
-- phase27 — ورودِ اعضای موجود (`D-031`)
--
-- ⚠️ **این فایل هیچ حسابی نمی‌سازد و هیچ دسترسی‌ای اعطا نمی‌کند.**
-- فقط ساختارِ یک واردسازیِ **برگشت‌پذیر** را می‌سازد. تا وقتی فهرستِ واقعی
-- بارگذاری نشده، هر سه جدول خالی می‌مانند.
--
-- ── مسئله ──────────────────────────────────────────────────────────────────
-- ~۶۰۰ تا ۷۰۰ عضوِ واقعی وجود دارد و `auth.users` **۲ ردیف** دارد
-- (اندازه‌گیریِ ۲۰۲۶-۰۹-۰۶). تا این شکاف پر نشود، پنلِ عضو و مسیرِ پرداخت
-- هر دو بی‌مخاطب‌اند.
--
-- ── قاعدهٔ سختِ این فایل ────────────────────────────────────────────────────
-- **حضور در کانالِ تلگرام مدرکِ خرید نیست.** پس «عضویت» از یک فهرستِ صریحِ
-- مجاز می‌آید که مالک بارگذاری می‌کند، نه از عضویتِ کانال. ستونِ `evidence`
-- اجباری است تا هیچ ردیفی بدونِ گفتنِ «این آدم بر چه اساسی حق دارد» وارد نشود.
--
-- ── چرا سه جدول ────────────────────────────────────────────────────────────
--   • `member_import_batches` — هر بارگذاری یک دسته با منبع و زمان و اپراتور.
--     بدونِ آن «این ردیف از کجا آمد» بعداً جواب ندارد.
--   • `member_import_rows`    — ردیف‌های خام + وضعیت. **پیش‌نمایش** یعنی
--     ردیف‌ها وارد می‌شوند ولی هیچ دسترسی‌ای اعطا نمی‌شود تا تأییدِ صریح.
--   • `member_grants`         — سابقهٔ اعطا، با امکانِ لغوِ موردی. append-only
--     در معنایِ واقعی: لغو یعنی `revoked_at`، نه DELETE.
--
-- ── برگشت‌پذیری ────────────────────────────────────────────────────────────
-- هر دسته با `revoke_member_batch(batch_id, reason)` قابلِ برگشت است؛ هیچ
-- ردیفی پاک نمی‌شود، فقط `revoked_at` می‌خورد. یعنی «چه کسی چه زمانی چه چیزی
-- گرفت و چرا پس گرفته شد» همیشه خواندنی می‌ماند.
--
-- پیش‌نیاز: `auth.users`، `public.profiles`، `public.is_admin()`.
-- **مستقل از phase20..phase26** — هیچ‌کدام را لازم ندارد.
-- =============================================================================

-- ── ۱) دسته‌ها ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_import_batches (
  id           bigserial PRIMARY KEY,
  -- از کجا آمد: نامِ فایل یا توضیحِ منبع. اجباری.
  source_label text NOT NULL CHECK (length(btrim(source_label)) >= 3),
  -- چه چیزی را ثابت می‌کند: «ثبت‌نامِ وبینارِ خرداد ۱۴۰۵» و مانندِ آن.
  evidence     text NOT NULL CHECK (length(btrim(evidence)) >= 10),
  imported_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- تا تأیید نشود هیچ اعطایی از این دسته ممکن نیست.
  approved_at  timestamptz,
  approved_by  uuid REFERENCES auth.users(id),
  revoked_at   timestamptz,
  revoke_reason text,
  CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
  CHECK (revoked_at IS NULL OR length(btrim(coalesce(revoke_reason, ''))) >= 10)
);

-- ── ۲) ردیف‌های خام ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_import_rows (
  id         bigserial PRIMARY KEY,
  batch_id   bigint NOT NULL REFERENCES public.member_import_batches(id) ON DELETE RESTRICT,

  -- شناسهٔ تماسِ نرمال‌شده؛ مبنای تطبیق و یکتاسازی.
  -- هرگز خودِ شمارهٔ خام — نرمال‌سازی در مرزِ ورود انجام می‌شود.
  contact_kind  text NOT NULL CHECK (contact_kind IN ('email', 'phone')),
  contact_value text NOT NULL CHECK (length(btrim(contact_value)) >= 5),

  -- دورهٔ حقِ دسترسی، از خودِ فهرست — نه پیش‌فرضِ سیستم.
  access_from date NOT NULL,
  access_until date NOT NULL,

  -- نتیجهٔ تطبیق. `unmatched` یک حالتِ معتبر است، نه خطا.
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'matched', 'unmatched', 'duplicate', 'rejected')),
  matched_user_id uuid REFERENCES auth.users(id),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (access_until > access_from),
  CHECK (status <> 'matched' OR matched_user_id IS NOT NULL),
  -- ردیفی که تطبیق نیافته یا رد شده باید علتش نوشته شده باشد.
  CHECK (status NOT IN ('unmatched', 'rejected') OR length(btrim(coalesce(note, ''))) >= 5)
);

-- یکتاسازی **درونِ هر دسته**: یک فایل نباید یک نفر را دوبار وارد کند.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_row_in_batch
  ON public.member_import_rows (batch_id, contact_kind, contact_value);

CREATE INDEX IF NOT EXISTS idx_member_rows_status
  ON public.member_import_rows (batch_id, status);

-- ── ۳) اعطاها — **دفترِ واردسازی، نه سامانهٔ دسترسیِ موازی** ───────────────
--
-- ⚠️ **تصحیحِ بازبینی.** نسخهٔ اول یک جدولِ اعطای مستقل ساخته بود با
-- `access_from`/`access_until` خودش. آن یک **سامانهٔ دسترسیِ دوم** بود در کنارِ
-- `public.entitlements` که از قبل وجود دارد و همان ستون‌ها را دارد
-- (`user_id, kind, source, starts_at, expires_at, revoked_at, granted_by, note`).
-- دو منبعِ حقیقت برای «این آدم دسترسی دارد یا نه» یعنی روزی که با هم اختلاف
-- پیدا کنند، هیچ‌کس نمی‌داند کدام درست است.
--
-- حالا `member_grants` فقط **دفترِ واردسازی** است: می‌گوید کدام ردیفِ فهرست به
-- کدام ردیفِ `entitlements` تبدیل شد. مرجعِ دسترسی همان `entitlements` می‌ماند.

CREATE TABLE IF NOT EXISTS public.member_grants (
  id         bigserial PRIMARY KEY,
  row_id     bigint NOT NULL REFERENCES public.member_import_rows(id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- **اتصال به دسترسیِ موجود.** بدونِ این، دفتر از مرجع جدا می‌افتد.
  entitlement_id uuid NOT NULL REFERENCES public.entitlements(id) ON DELETE RESTRICT,

  -- زنجیرهٔ تمدید: این اعطا جانشینِ کدام اعطای قبلی است.
  renewed_from_grant_id bigint REFERENCES public.member_grants(id),

  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  CHECK (revoked_at IS NULL OR length(btrim(coalesce(revoke_reason, ''))) >= 10),
  CHECK (renewed_from_grant_id IS NULL OR renewed_from_grant_id <> id)
);

-- یک ردیفِ فهرست حداکثر یک اعطای لغونشده — پردازشِ تکراری اعطای تکراری نمی‌سازد.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_grant_row
  ON public.member_grants (row_id) WHERE revoked_at IS NULL;

-- هر ردیفِ entitlements فقط یک‌بار در دفتر ثبت می‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_grant_entitlement
  ON public.member_grants (entitlement_id);

CREATE INDEX IF NOT EXISTS idx_member_grants_user
  ON public.member_grants (user_id, granted_at DESC);

-- ⚠️ **ایندکسِ حذف‌شده و چرا.** نسخهٔ اول یک ایندکسِ یکتای جزئی روی
-- `member_grants(user_id) WHERE revoked_at IS NULL` داشت تا «اعطای دوباره» را
-- ببندد. آن **غلط بود**: پس از **انقضای طبیعی** `revoked_at` همچنان `NULL`
-- است، پس آن ایندکس تمدیدِ مشروعِ عضوی را که دوره‌اش تمام شده **برای همیشه
-- غیرممکن می‌کرد**. تستِ اولیه این را نگرفت چون فقط مسیرِ «لغو، بعد اعطای
-- تازه» را می‌آزمود و هرگز اجازه نمی‌داد یک دوره طبیعتاً منقضی شود.
--
-- جای آن، «دسترسیِ فعالِ هم‌زمان» جایی کنترل می‌شود که واقعاً معنا دارد:
-- روی `entitlements`، با درنظرگرفتنِ **هم** لغو **و هم** انقضا — تابعِ
-- `grant_member_access` پایین.

/** آیا این کاربر همین حالا دسترسیِ فعال دارد؟ لغو **و** انقضا هر دو حساب می‌شوند. */
CREATE OR REPLACE FUNCTION public.member_has_active_access(p_user_id uuid, p_kind text DEFAULT 'consulting')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
     WHERE e.user_id = p_user_id
       AND e.kind = p_kind
       AND e.revoked_at IS NULL
       AND e.expires_at > now()
  );
$$;

-- ── ۴) اعطا، تمدید، لغو ────────────────────────────────────────────────────
--
-- هر سه فقط از مسیرِ سرویس و فقط با نقشِ ادمین. هیچ‌کدام ردیفی پاک نمی‌کنند.

/**
 * اعطای دسترسی از روی یک ردیفِ فهرست.
 *
 * ایده‌مپوتنت: اگر ردیف از قبل اعطای لغونشده دارد، همان را برمی‌گرداند و
 * `entitlements` تازه نمی‌سازد. پس اجرای دوبارهٔ پردازش دسترسیِ تکراری نمی‌دهد.
 *
 * اگر کاربر همین حالا دسترسیِ فعال دارد (لغونشده **و** منقضی‌نشده)، خطا می‌دهد —
 * تمدید کارِ `renew_member_access` است، نه اعطای دوم.
 */
-- `kind` باید یکی از مقادیرِ مجازِ **جدولِ موجود** باشد
-- (`entitlements_kind_check`: consulting | webinar | manual). این migration آن
-- قید را **باز نمی‌کند** — افزایشی می‌ماند و از واژگانِ موجود استفاده می‌کند.
-- پیش‌فرض `consulting` است، چون محصولِ اعضای فعلی همان راهنماییِ سرمایه‌گذاری
-- پس از وبینار است.
CREATE OR REPLACE FUNCTION public.grant_member_access(p_row_id bigint, p_kind text DEFAULT 'consulting')
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r public.member_import_rows%ROWTYPE;
  b public.member_import_batches%ROWTYPE;
  existing bigint;
  ent uuid;
  gid bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'فقط ادمین می‌تواند دسترسی اعطا کند' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('consulting', 'webinar', 'manual') THEN
    RAISE EXCEPTION 'نوعِ دسترسیِ نامعتبر: % (مجاز: consulting, webinar, manual)', p_kind
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.member_import_rows WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ردیفِ فهرست پیدا نشد' USING ERRCODE = '22023'; END IF;
  IF r.status <> 'matched' THEN
    RAISE EXCEPTION 'فقط ردیفِ تطبیق‌یافته اعطا می‌گیرد (وضعیتِ فعلی: %)', r.status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM public.member_import_batches WHERE id = r.batch_id;
  IF b.approved_at IS NULL THEN
    RAISE EXCEPTION 'دستهٔ % هنوز تأیید نشده — پیش‌نمایش دسترسی نمی‌دهد', r.batch_id USING ERRCODE = '22023';
  END IF;
  IF b.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'دستهٔ % لغو شده است', r.batch_id USING ERRCODE = '22023';
  END IF;

  -- ایده‌مپوتنسی
  SELECT id INTO existing FROM public.member_grants
   WHERE row_id = p_row_id AND revoked_at IS NULL;
  IF FOUND THEN RETURN existing; END IF;

  IF public.member_has_active_access(r.matched_user_id, p_kind) THEN
    RAISE EXCEPTION 'کاربر دسترسیِ فعال دارد — برای تمدید از renew_member_access استفاده کن'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.entitlements (user_id, kind, source, starts_at, expires_at, granted_by, note)
  VALUES (r.matched_user_id, p_kind, 'member_import',
          r.access_from::timestamptz, r.access_until::timestamptz,
          b.imported_by, format('واردسازیِ دستهٔ %s', r.batch_id))
  RETURNING id INTO ent;

  INSERT INTO public.member_grants (row_id, user_id, entitlement_id)
  VALUES (p_row_id, r.matched_user_id, ent)
  RETURNING id INTO gid;

  RETURN gid;
END $$;

/**
 * تمدید.
 *
 * تمدید یعنی **زنجیره**، نه ویرایش: اعطای قبلی لغو می‌شود، ردیفِ `entitlements`
 * تازه ساخته می‌شود، و `renewed_from_grant_id` دو سر را به هم وصل می‌کند. پس
 * «این آدم از کِی تا کِی چه داشت» همیشه خواندنی می‌ماند.
 *
 * تمدید حتماً باید **جلو ببرد**: تاریخِ تازه از تاریخِ فعلی بزرگ‌تر باشد. تمدیدی
 * که دوره را کوتاه کند، تمدید نیست — لغوِ پنهان است.
 */
CREATE OR REPLACE FUNCTION public.renew_member_access(
  p_grant_id bigint, p_new_until timestamptz, p_reason text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  g public.member_grants%ROWTYPE;
  old_ent public.entitlements%ROWTYPE;
  ent uuid;
  gid bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'فقط ادمین می‌تواند تمدید کند' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'علتِ تمدید باید دستِ‌کم ۱۰ نویسه باشد' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO g FROM public.member_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'اعطا پیدا نشد' USING ERRCODE = '22023'; END IF;
  IF g.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'اعطای لغوشده تمدید نمی‌شود' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO old_ent FROM public.entitlements WHERE id = g.entitlement_id FOR UPDATE;
  IF p_new_until <= old_ent.expires_at THEN
    RAISE EXCEPTION 'تمدید باید تاریخِ پایان را جلو ببرد (فعلی: %)', old_ent.expires_at
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.entitlements SET revoked_at = now(),
         note = coalesce(note, '') || format(' · تمدید شد: %s', p_reason)
   WHERE id = g.entitlement_id;
  UPDATE public.member_grants SET revoked_at = now(),
         revoke_reason = format('تمدید: %s', p_reason)
   WHERE id = p_grant_id;

  INSERT INTO public.entitlements (user_id, kind, source, starts_at, expires_at, granted_by, note)
  VALUES (old_ent.user_id, old_ent.kind, 'member_import_renewal',
          old_ent.starts_at, p_new_until, old_ent.granted_by, p_reason)
  RETURNING id INTO ent;

  INSERT INTO public.member_grants (row_id, user_id, entitlement_id, renewed_from_grant_id)
  VALUES (g.row_id, g.user_id, ent, p_grant_id)
  RETURNING id INTO gid;

  RETURN gid;
END $$;

/** لغوِ **موردی** — یک اعطا، نه کلِ دسته. هم دفتر و هم مرجعِ دسترسی. */
CREATE OR REPLACE FUNCTION public.revoke_member_grant(p_grant_id bigint, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE g public.member_grants%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'فقط ادمین می‌تواند لغو کند' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'علتِ لغو باید دستِ‌کم ۱۰ نویسه باشد' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO g FROM public.member_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'اعطا پیدا نشد' USING ERRCODE = '22023'; END IF;
  IF g.revoked_at IS NOT NULL THEN RETURN false; END IF;

  UPDATE public.entitlements SET revoked_at = now() WHERE id = g.entitlement_id;
  UPDATE public.member_grants SET revoked_at = now(), revoke_reason = p_reason WHERE id = p_grant_id;
  RETURN true;
END $$;

/** لغوِ کلِ یک دسته — روی هر اعطای لغونشدهٔ آن، از همان مسیرِ موردی. */
CREATE OR REPLACE FUNCTION public.revoke_member_batch(p_batch_id bigint, p_reason text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE n integer := 0; gid bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'فقط ادمین می‌تواند دسته را لغو کند' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'علتِ لغو باید دستِ‌کم ۱۰ نویسه باشد' USING ERRCODE = '22023';
  END IF;

  FOR gid IN
    SELECT g.id FROM public.member_grants g
     JOIN public.member_import_rows r ON r.id = g.row_id
     WHERE r.batch_id = p_batch_id AND g.revoked_at IS NULL
  LOOP
    PERFORM public.revoke_member_grant(gid, p_reason);
    n := n + 1;
  END LOOP;

  UPDATE public.member_import_batches
     SET revoked_at = now(), revoke_reason = p_reason
   WHERE id = p_batch_id AND revoked_at IS NULL;

  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.grant_member_access(bigint, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_member_access(bigint, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_member_grant(bigint, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_member_batch(bigint, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_has_active_access(uuid, text)     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.grant_member_access(bigint, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_member_access(bigint, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_member_grant(bigint, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_member_batch(bigint, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.member_has_active_access(uuid, text)     TO authenticated, service_role;

-- ── ۵) RLS و گرنت‌ها ────────────────────────────────────────────────────────
--
-- این جدول‌ها **دادهٔ شخصی** دارند (شناسهٔ تماس). سخت‌گیرانه‌ترین حالت:
-- هیچ کاربرِ عادی هیچ ردیفی نمی‌بیند؛ فقط ادمین، و فقط خواندن.

ALTER TABLE public.member_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_import_batches FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.member_import_rows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_import_rows    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.member_grants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_grants         FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_batches_admin_read ON public.member_import_batches;
CREATE POLICY member_batches_admin_read ON public.member_import_batches
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS member_rows_admin_read ON public.member_import_rows;
CREATE POLICY member_rows_admin_read ON public.member_import_rows
  FOR SELECT TO authenticated USING (public.is_admin());

-- کاربر فقط اعطای خودش را می‌بیند — تا بداند دسترسی‌اش تا کِی است.
DROP POLICY IF EXISTS member_grants_own_read ON public.member_grants;
CREATE POLICY member_grants_own_read ON public.member_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

REVOKE ALL ON TABLE public.member_import_batches FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.member_import_rows    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.member_grants         FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.member_import_batches TO authenticated;
GRANT SELECT ON TABLE public.member_import_rows    TO authenticated;
GRANT SELECT ON TABLE public.member_grants         TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.member_import_batches TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.member_import_rows    TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.member_grants         TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.member_import_batches_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.member_import_rows_id_seq    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.member_grants_id_seq         TO service_role;

-- ── ۶) راستی‌آزماییِ پس از اجرا ─────────────────────────────────────────────

DO $$
DECLARE t text; r text; p text; bad int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_import_batches','member_import_rows','member_grants'] LOOP
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
        IF has_table_privilege(r, format('public.%I', t), p) THEN
          RAISE WARNING 'گرنتِ ناخواسته: % روی % دارای %', r, t, p; bad := bad + 1;
        END IF;
      END LOOP;
    END LOOP;
    IF has_table_privilege('anon', format('public.%I', t), 'SELECT') THEN
      RAISE WARNING 'anon نباید % را بخواند', t; bad := bad + 1;
    END IF;
    IF has_table_privilege('service_role', format('public.%I', t), 'TRUNCATE') THEN
      RAISE WARNING 'service_role روی % دارای TRUNCATE', t; bad := bad + 1;
    END IF;
  END LOOP;
  IF bad > 0 THEN
    RAISE EXCEPTION 'phase27: % گرنتِ خطرناک پس از اجرا باقی ماند', bad;
  END IF;
END $$;
