-- ════════════════════════════════════════════════════════════════════════
-- فاز ۹ — یادداشت روزانهٔ بازار (Market Notes)
-- ADDITIVE · idempotent · append-only (همان الگوی فازهای قبل).
--
-- «یادداشت روزانهٔ بازار» فیدِ عمومیِ تحلیلِ کوتاهِ آرش است: چند بولت + یک
-- جمع‌بندی، با برچسبِ دسته (طلا/بورس/ارز/کریپتو). این چیزی است که دادهٔ زندهٔ
-- بازار را «معنی‌دار» می‌کند و دلیلِ بازگشتِ روزانهٔ کاربر می‌شود (نقشهٔ راه §۱.۱).
--
-- تفاوت با اعلامیه‌ها: یادداشت‌ها *عمومی*‌اند (خواندنِ anon، بدونِ لاگین) و
-- هدف‌گیری ندارند. بدونِ هیچ عدد/بازدهِ ساختگی؛ بدونِ سیگنالِ مستقیمِ خرید/فروش.
--
-- پیش‌نیاز: is_admin()، audit_log، deny_mutation() (فازهای قبل).
-- ════════════════════════════════════════════════════════════════════════

-- نگهبانِ append-only (اگر از قبل موجود است، همان؛ برای خوداتکاییِ فایل
-- دوباره تعریف می‌شود — بی‌خطر).
CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $$;

-- ── 1. جدول ─────────────────────────────────────────────────────────────
-- یادداشت. append-only. tags: آرایهٔ دستهٔ فارسی (مثلاً {طلا,بورس}).
CREATE TABLE IF NOT EXISTS public.market_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body_md      text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_market_notes_published
  ON public.market_notes(published_at DESC);

-- ── 2. append-only enforcement ──────────────────────────────────────────
DROP TRIGGER IF EXISTS no_mutation ON public.market_notes;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.market_notes
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

-- ── 3. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.market_notes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='market_notes'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.market_notes', r.policyname); END LOOP;
END $$;

-- خواندنِ عمومی: هرکس (لاگین‌کرده یا نه) یادداشتِ منتشرشده را می‌بیند؛ ادمین همه را.
CREATE POLICY "notes_public_read" ON public.market_notes
  FOR SELECT
  TO anon, authenticated
  USING (published_at IS NOT NULL OR public.is_admin());

-- بدون سیاست INSERT/UPDATE/DELETE — نوشتن فقط از تابعِ SECURITY DEFINER زیر.

-- anon/authenticated باید SELECT روی خودِ جدول داشته باشند (RLS بالا محدودش می‌کند).
GRANT SELECT ON public.market_notes TO anon, authenticated;

-- ── 4. تابعِ انتشار (ادمین) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_market_note(
  p_title   text,
  p_body_md text,
  p_tags    text[] DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند یادداشت منتشر کند.';
  END IF;
  IF coalesce(btrim(p_title),'') = '' OR coalesce(btrim(p_body_md),'') = '' THEN
    RAISE EXCEPTION 'عنوان و متنِ یادداشت الزامی است.';
  END IF;

  INSERT INTO public.market_notes (title, body_md, tags, created_by, published_at)
  VALUES (btrim(p_title), btrim(p_body_md), coalesce(p_tags, '{}'), auth.uid(), now())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'note.publish', 'market_note', NULL,
          jsonb_build_object('id', v_id, 'title', btrim(p_title), 'tags', to_jsonb(coalesce(p_tags,'{}'))));

  RETURN v_id;
END $$;

-- ── 5. Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.publish_market_note(text,text,text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_market_note(text,text,text[]) TO authenticated;
