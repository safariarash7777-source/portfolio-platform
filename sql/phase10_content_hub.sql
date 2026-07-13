-- ════════════════════════════════════════════════════════════════════════
-- فاز ۱۰ — هابِ محتوا (Content Hub / آخرین تحلیل‌ها)
-- ADDITIVE · idempotent.
--
-- تجمیعِ تحلیل‌ها/ویدیوها/پست‌های آرش از شبکه‌های اجتماعی (تلگرام، اینستاگرام،
-- توییتر/X) در یک فیدِ عمومی (/insights) و یک سکشنِ خلاصه در صفحهٔ اصلی.
--
-- سیاستِ ذخیره: نوشتن فقط از راهِ توابعِ SECURITY DEFINERِ ادمین (زیر) — نه
-- upsertِ مخرب. حذف = «حذفِ نرم» (deleted_at) که audit می‌شود؛ رکورد نابود
-- نمی‌شود (سازگار با قانونِ append-only/نسخه‌دار). محتوا دستِ ادمین است، نه
-- کاربر؛ ولی برای اصلاحِ لینکِ اشتباه، پنهان‌سازی لازم است.
--
-- منبعِ ورود: باتِ تلگرام (سرویس‌رول) یا فرمِ ادمینِ وب. هر دو به همین جدول.
-- پیش‌نیاز: is_admin()، audit_log (فازهای قبل).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. جدول ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_hub (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     text NOT NULL CHECK (platform IN ('telegram','instagram','twitter')),
  kind         text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','video','story','reel')),
  content_url  text NOT NULL,
  embed_html   text,                 -- برای آینده؛ v1 رندر نمی‌شود
  title        text,
  description  text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz           -- حذفِ نرمِ کنترل‌شده
);

-- فیدِ عمومی: منتشرشده و حذف‌نشده، جدیدترین اول.
CREATE INDEX IF NOT EXISTS idx_content_hub_feed
  ON public.content_hub(published_at DESC)
  WHERE deleted_at IS NULL;

-- ── 2. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.content_hub ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='content_hub'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.content_hub', r.policyname); END LOOP;
END $$;

-- خواندنِ عمومی: هرکس محتوای منتشرشده و حذف‌نشده را می‌بیند؛ ادمین همه را.
CREATE POLICY "content_public_read" ON public.content_hub
  FOR SELECT
  TO anon, authenticated
  USING ((published_at IS NOT NULL AND deleted_at IS NULL) OR public.is_admin());

-- بدون سیاستِ INSERT/UPDATE/DELETE — نوشتن فقط از توابعِ SECURITY DEFINERِ زیر
-- (یا سرویس‌رولِ باتِ تلگرام که RLS را دور می‌زند).
GRANT SELECT ON public.content_hub TO anon, authenticated;

-- ── 3. تابعِ افزودن (ادمین) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_content_item(
  p_platform    text,
  p_kind        text,
  p_content_url text,
  p_title       text DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند محتوا اضافه کند.';
  END IF;
  IF p_platform NOT IN ('telegram','instagram','twitter') THEN
    RAISE EXCEPTION 'شبکهٔ نامعتبر.';
  END IF;
  IF coalesce(btrim(p_content_url),'') = '' THEN
    RAISE EXCEPTION 'لینکِ محتوا الزامی است.';
  END IF;

  INSERT INTO public.content_hub (platform, kind, content_url, title, description, created_by)
  VALUES (
    p_platform,
    CASE WHEN p_kind IN ('post','video','story','reel') THEN p_kind ELSE 'post' END,
    btrim(p_content_url),
    nullif(btrim(coalesce(p_title,'')), ''),
    nullif(btrim(coalesce(p_description,'')), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'content.add', 'content_hub', NULL,
          jsonb_build_object('id', v_id, 'platform', p_platform, 'url', btrim(p_content_url)));

  RETURN v_id;
END $$;

-- ── 4. تابعِ پنهان‌سازی/حذفِ نرم (ادمین) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.hide_content_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند محتوا را پنهان کند.';
  END IF;

  UPDATE public.content_hub
     SET deleted_at = now()
   WHERE id = p_id AND deleted_at IS NULL;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'content.hide', 'content_hub', NULL,
          jsonb_build_object('id', p_id));
END $$;

-- ── 5. Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.add_content_item(text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.add_content_item(text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.hide_content_item(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hide_content_item(uuid) TO authenticated;
