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

-- ── ۳) اعطاها ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_grants (
  id         bigserial PRIMARY KEY,
  row_id     bigint NOT NULL REFERENCES public.member_import_rows(id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_from  date NOT NULL,
  access_until date NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  CHECK (access_until > access_from),
  CHECK (revoked_at IS NULL OR length(btrim(coalesce(revoke_reason, ''))) >= 10)
);

-- **جلوگیری از اعطای دوباره**: یک کاربر نمی‌تواند دو اعطای فعالِ هم‌زمان
-- داشته باشد. ایندکسِ جزئی یعنی پس از لغو، اعطای تازه مجاز است.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_grant_active
  ON public.member_grants (user_id) WHERE revoked_at IS NULL;

-- هر ردیفِ فهرست حداکثر یک اعطای فعال — تکرارِ پردازش اعطای تکراری نمی‌سازد.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_grant_row
  ON public.member_grants (row_id) WHERE revoked_at IS NULL;

-- ── ۴) لغوِ یک دسته ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_member_batch(p_batch_id bigint, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'فقط ادمین می‌تواند دسته را لغو کند' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'علتِ لغو باید دستِ‌کم ۱۰ نویسه باشد' USING ERRCODE = '22023';
  END IF;

  UPDATE public.member_grants g
     SET revoked_at = now(), revoke_reason = p_reason
   WHERE g.revoked_at IS NULL
     AND g.row_id IN (SELECT r.id FROM public.member_import_rows r WHERE r.batch_id = p_batch_id);
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.member_import_batches
     SET revoked_at = now(), revoke_reason = p_reason
   WHERE id = p_batch_id AND revoked_at IS NULL;

  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.revoke_member_batch(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_member_batch(bigint, text) TO service_role;

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
