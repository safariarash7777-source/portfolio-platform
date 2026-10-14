"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  Video,
  Users,
  Calendar,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { formatToman, toLatinDigits, toPersianDigits } from "@/lib/format";

interface Webinar {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_open: boolean;
  max_capacity: number | null;
  price_toman: number;
  platform: string;
  platform_url: string | null;
  access_enabled: boolean;
  access_starts_at: string | null;
  access_ends_at: string | null;
  status: string;
  created_at: string;
  webinar_registrations: { count: number }[];
}

type FormData = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  registration_open: boolean;
  max_capacity: string;
  price_toman: string;
  platform: string;
  platform_url: string;
  access_enabled: boolean;
  access_starts_at: string;
  access_ends_at: string;
  status: string;
};

const PLATFORMS = [
  { value: "link", label: "لینک دلخواه" },
  { value: "skyroom", label: "اسکای‌روم" },
  { value: "zoom", label: "زوم" },
  { value: "google_meet", label: "گوگل میت" },
];

const STATUSES = [
  { value: "draft", label: "پیش‌نویس" },
  { value: "published", label: "منتشرشده" },
  { value: "live", label: "در حال برگزاری" },
  { value: "ended", label: "پایان‌یافته" },
  { value: "cancelled", label: "لغوشده" },
];

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: "var(--surface-2)", color: "var(--text-3)", label: "پیش‌نویس" },
    published: { bg: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)", label: "منتشرشده" },
    live: { bg: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)", label: "در حال برگزاری" },
    ended: { bg: "color-mix(in srgb, var(--text-3) 12%, transparent)", color: "var(--text-3)", label: "پایان‌یافته" },
    cancelled: { bg: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)", label: "لغوشده" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(toman: number) {
  if (toman === 0) return "رایگان";
  return formatToman(toman);
}

function localDateTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function hasAccessWindow(webinar: Pick<Webinar, "access_enabled" | "access_starts_at" | "access_ends_at">) {
  const start = webinar.access_starts_at ? Date.parse(webinar.access_starts_at) : NaN;
  const end = webinar.access_ends_at ? Date.parse(webinar.access_ends_at) : NaN;
  return webinar.access_enabled === true && Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export default function AdminWebinarsPage() {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const emptyForm: FormData = {
    title: "",
    description: "",
    starts_at: "",
    ends_at: "",
    registration_open: false,
    max_capacity: "",
    price_toman: "",
    platform: "link",
    platform_url: "",
    access_enabled: false,
    access_starts_at: "",
    access_ends_at: "",
    status: "draft",
  };
  const [form, setForm] = useState<FormData>(emptyForm);
  const lifetime = useRef({ active: true });
  const savePending = useRef(false);
  const uncertainCreation = useRef(false);

  useEffect(() => {
    const scope = { active: true };
    lifetime.current = scope;
    setSaving(false);
    // A server write may complete after cleanup; only UI effects are suppressed.
    return () => { scope.active = false; };
  }, []);

  const fetchWebinars = useCallback(async () => {
    const scope = lifetime.current;
    if (!scope.active) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/webinars");
      if (!scope.active || lifetime.current !== scope) return;
      if (!res.ok) throw new Error("خطا در دریافت وبینارها");
      const data = await res.json();
      if (!scope.active || lifetime.current !== scope) return;
      setWebinars(data.webinars ?? []);
    } catch (e: any) {
      if (scope.active && lifetime.current === scope) setError(e.message);
    } finally {
      if (scope.active && lifetime.current === scope) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebinars();
  }, [fetchWebinars]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const scope = lifetime.current;
    if (!scope.active || savePending.current || (!editingId && uncertainCreation.current)) return;
    savePending.current = true;
    setSaving(true);
    setError("");
    setSuccess("");

    let createRequested = false;
    let definiteRejection = false;
    try {
      const price = toLatinDigits(form.price_toman).trim();
      const capacity = toLatinDigits(form.max_capacity).trim();
      if (!/^\d+$/.test(price) || !Number.isSafeInteger(Number(price))) {
        throw new Error("قیمت را به تومان و به‌صورت عدد صحیح وارد کنید؛ برای وبینار رایگان، صفر را انتخاب کنید.");
      }
      if (capacity && (!/^\d+$/.test(capacity) || !Number.isSafeInteger(Number(capacity)) || Number(capacity) < 1)) {
        throw new Error("ظرفیت باید عدد صحیحِ مثبت باشد یا خالی بماند.");
      }
      if (form.access_enabled && form.registration_open && Number(price) > 0 && capacity) {
        throw new Error("بازکردن ثبت‌نام وبینار پولی با ظرفیت محدود، به تصمیم صریح دربارهٔ رزرو و آزادسازی ظرفیت نیاز دارد. فعلاً ثبت‌نام را بسته نگه دارید یا ظرفیت را خالی بگذارید.");
      }
      const timestamp = (value: string, label: string) => {
        if (!value) return null;
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) throw new Error(`${label} معتبر نیست.`);
        return date.toISOString();
      };
      const accessStart = timestamp(form.access_starts_at, "شروع دسترسی");
      const accessEnd = timestamp(form.access_ends_at, "پایان دسترسی");
      if (form.access_enabled && (!accessStart || !accessEnd || Date.parse(accessEnd) <= Date.parse(accessStart))) {
        throw new Error("برای فعال‌کردن دسترسی، شروع و پایان آن را صریح انتخاب کنید؛ پایان باید بعد از شروع باشد.");
      }
      if (form.access_enabled) {
        let sessionUrl: URL;
        try { sessionUrl = new URL(form.platform_url); } catch { throw new Error("برای فعال‌کردن دسترسی، لینک HTTPS معتبر جلسه را وارد کنید."); }
        if (sessionUrl.protocol !== "https:" || sessionUrl.username || sessionUrl.password) {
          throw new Error("لینک جلسه باید HTTPS و بدون نام کاربری یا رمز در نشانی باشد.");
        }
      }
      const payload = {
        title: form.title,
        description: form.description || null,
        starts_at: timestamp(form.starts_at, "شروع رویداد"),
        ends_at: timestamp(form.ends_at, "پایان رویداد"),
        registration_open: form.access_enabled && form.registration_open,
        max_capacity: capacity ? Number(capacity) : null,
        price_toman: Number(price),
        platform: form.platform,
        platform_url: form.platform_url || null,
        access_enabled: form.access_enabled,
        access_starts_at: accessStart,
        access_ends_at: accessEnd,
        status: form.status,
      };
      let res;
      if (editingId) {
        res = await fetch("/api/admin/webinars", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        createRequested = true;
        res = await fetch("/api/admin/webinars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!scope.active || lifetime.current !== scope) return;
      if (!res.ok) {
        definiteRejection = res.status >= 400 && res.status < 500;
        const data = await res.json();
        if (!scope.active || lifetime.current !== scope) return;
        throw new Error(data.error || "خطا");
      }
      setSuccess(editingId ? "وبینار ویرایش شد." : "وبینار ساخته شد.");
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchWebinars();
    } catch (e: any) {
      if (createRequested && !definiteRejection) uncertainCreation.current = true;
      if (scope.active && lifetime.current === scope) setError(uncertainCreation.current
        ? "پاسخ قطعی ساخت وبینار دریافت نشد؛ ممکن است ذخیره شده باشد. فهرست را تازه و بررسی کنید و سپس صفحه را دوباره باز کنید؛ ساخت دوباره پیش از بررسی می‌تواند تکراری باشد."
        : e.message);
    } finally {
      savePending.current = false;
      if (scope.active && lifetime.current === scope) setSaving(false);
    }
  };

  const handleEdit = (w: Webinar) => {
    setEditingId(w.id);
    setForm({
      title: w.title,
      description: w.description || "",
      starts_at: localDateTime(w.starts_at),
      ends_at: localDateTime(w.ends_at),
      registration_open: hasAccessWindow(w) && w.registration_open,
      max_capacity: w.max_capacity ? String(w.max_capacity) : "",
      price_toman: String(w.price_toman),
      platform: w.platform,
      platform_url: w.platform_url || "",
      access_enabled: w.access_enabled === true,
      access_starts_at: localDateTime(w.access_starts_at),
      access_ends_at: localDateTime(w.access_ends_at),
      status: w.status,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const scope = lifetime.current;
    if (!scope.active) return;
    if (!confirm("آیا از حذف این وبینار مطمئنید؟")) return;
    try {
      const res = await fetch("/api/admin/webinars", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!scope.active || lifetime.current !== scope) return;
      if (!res.ok) throw new Error("خطا در حذف");
      fetchWebinars();
    } catch (e: any) {
      if (scope.active && lifetime.current === scope) setError(e.message);
    }
  };

  const toggleRegistration = async (w: Webinar) => {
    const scope = lifetime.current;
    if (!scope.active) return;
    try {
      if (!w.registration_open && !hasAccessWindow(w)) {
        throw new Error("پیش از بازکردن ثبت‌نام، بازهٔ دسترسی همین وبینار را تنظیم و فعال کنید.");
      }
      if (!w.registration_open && w.price_toman > 0 && w.max_capacity !== null) {
        throw new Error("ثبت‌نام وبینار پولی با ظرفیت محدود تا تعیین سیاست رزرو و آزادسازی ظرفیت بسته می‌ماند.");
      }
      const res = await fetch("/api/admin/webinars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id, registration_open: !w.registration_open }),
      });
      if (!scope.active || lifetime.current !== scope) return;
      if (!res.ok) throw new Error("خطا");
      fetchWebinars();
    } catch (e: any) {
      if (scope.active && lifetime.current === scope) setError(e.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text-1)" }}>
            مدیریت وبینارها
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
            ساخت، ویرایش و مدیریت رویدادهای آنلاین
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setForm(emptyForm);
          }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors"
          style={{ background: "var(--navy)", color: "var(--text-on-navy)" }}
        >
          <Plus size={16} />
          وبینار جدید
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
          style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}
        >
          <XCircle size={16} />
          {error}
          <button onClick={() => setError("")} className="mr-auto text-xs underline">
            بستن
          </button>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="mb-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
          style={{ background: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}
        >
          <CheckCircle size={16} />
          {success}
          <button onClick={() => setSuccess("")} className="mr-auto text-xs underline">
            بستن
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div
          className="mb-8 rounded-2xl p-6 border"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text-1)" }}>
            {editingId ? "ویرایش وبینار" : "ساخت وبینار جدید"}
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            {/* عنوان */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                عنوان *
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                placeholder="مثلاً: وبینار تحلیل بازار طلا — تیر ۱۴۰۵"
              />
            </div>

            {/* توضیحات */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                توضیحات
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm min-h-[80px]"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                placeholder="توضیحات وبینار برای نمایش در صفحه عمومی..."
              />
            </div>

            {/* تاریخ شروع */}
            <div>
              <label htmlFor="webinar_starts_at" className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                تاریخ و ساعت شروع *
              </label>
              <input
                type="datetime-local"
                id="webinar_starts_at"
                step="0.001"
                required
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              />
            </div>

            {/* تاریخ پایان */}
            <div>
              <label htmlFor="webinar_ends_at" className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                تاریخ و ساعت پایان
              </label>
              <input
                type="datetime-local"
                id="webinar_ends_at"
                step="0.001"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              />
            </div>

            {/* قیمت */}
            <div>
              <label htmlFor="webinar_price" className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                قیمت (تومان) *
              </label>
              <input
                type="text"
                id="webinar_price"
                inputMode="numeric"
                required
                value={form.price_toman}
                onChange={(e) => setForm({ ...form, price_toman: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                placeholder="قیمت را وارد کنید"
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>صفر یعنی رایگان؛ قیمت پیش‌فرض ندارد.</p>
            </div>

            {/* ظرفیت */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                حداکثر ظرفیت
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.max_capacity}
                onChange={(e) => setForm({ ...form, max_capacity: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                placeholder="خالی = بدون محدودیت"
              />
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-3)" }}>
                برای وبینار پولی، ثبت‌نام با ظرفیت محدود تا تعیین سیاست رزرو و آزادسازی ظرفیت بسته می‌ماند. ظرفیت خالی یعنی بدون محدودیت.
              </p>
            </div>

            {/* پلتفرم */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                پلتفرم برگزاری
              </label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* لینک پلتفرم */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                لینک جلسه
              </label>
              <input
                type="url"
                value={form.platform_url}
                onChange={(e) => setForm({ ...form, platform_url: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                dir="ltr"
                placeholder="https://..."
              />
            </div>

            {/* وضعیت */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                وضعیت
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="md:col-span-2 grid gap-4 md:grid-cols-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <legend className="text-sm font-bold px-1" style={{ color: "var(--text-1)" }}>دسترسی به همین وبینار</legend>
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 text-sm font-bold" style={{ color: "var(--text-2)" }}>
                  <input
                    type="checkbox"
                    checked={form.access_enabled}
                    onChange={(e) => setForm({ ...form, access_enabled: e.target.checked, registration_open: e.target.checked && form.registration_open })}
                    className="w-4 h-4 rounded"
                  />
                  بازهٔ دسترسی را فعال می‌کنم
                </label>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-3)" }}>
                  شروع و پایان دسترسی را جدا از زمان برگزاری انتخاب کنید. تا زمان فعال‌سازی، ثبت‌نام بسته می‌ماند. ثبت‌نام فقط دسترسی به همین وبینار را باز می‌کند.
                </p>
              </div>
              <div>
                <label htmlFor="access_starts_at" className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>شروع دسترسی {form.access_enabled && "*"}</label>
                <input
                  type="datetime-local"
                  id="access_starts_at"
                  step="0.001"
                  required={form.access_enabled}
                  value={form.access_starts_at}
                  onChange={(e) => setForm({ ...form, access_starts_at: e.target.value })}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                />
              </div>
              <div>
                <label htmlFor="access_ends_at" className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>پایان دسترسی {form.access_enabled && "*"}</label>
                <input
                  type="datetime-local"
                  id="access_ends_at"
                  step="0.001"
                  required={form.access_enabled}
                  value={form.access_ends_at}
                  onChange={(e) => setForm({ ...form, access_ends_at: e.target.value })}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                />
              </div>
            </fieldset>

            {/* ثبت‌نام باز */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="reg_open"
                checked={form.registration_open}
                disabled={!form.access_enabled}
                onChange={(e) => setForm({ ...form, registration_open: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="reg_open" className="text-sm font-bold" style={{ color: "var(--text-2)" }}>
                ثبت‌نام باز باشد
              </label>
            </div>

            {/* دکمه‌ها */}
            <div className="md:col-span-2 flex gap-3 mt-2">
              <button
                type="submit"
                disabled={saving || (!editingId && uncertainCreation.current)}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                style={{ background: "var(--navy)", color: "var(--text-on-navy)", opacity: saving || (!editingId && uncertainCreation.current) ? 0.6 : 1 }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingId ? "ذخیره تغییرات" : "ساخت وبینار"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="rounded-xl px-5 py-2.5 text-sm font-bold"
                style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
              >
                انصراف
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
        </div>
      ) : webinars.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl border"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          <Video size={48} className="mx-auto mb-4" style={{ color: "var(--text-3)" }} />
          <p className="text-sm font-bold" style={{ color: "var(--text-3)" }}>
            هنوز وبیناری ساخته نشده.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {webinars.map((w) => {
            const regCount = w.webinar_registrations?.[0]?.count ?? 0;
            return (
              <div
                key={w.id}
                className="rounded-2xl border p-5"
                style={{ background: "var(--surface)", borderColor: "var(--line)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-bold truncate" style={{ color: "var(--text-1)" }}>
                        {w.title}
                      </h3>
                      {statusBadge(w.status)}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--text-3)" }}>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(w.starts_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {toPersianDigits(regCount)} ثبت‌نام
                        {w.max_capacity !== null && ` / ${toPersianDigits(w.max_capacity)}`}
                      </span>
                      <span>{formatPrice(w.price_toman)}</span>
                      <span>{PLATFORMS.find((p) => p.value === w.platform)?.label}</span>
                      <span>{hasAccessWindow(w) ? `دسترسی: ${formatDate(w.access_starts_at!)} تا ${formatDate(w.access_ends_at!)}` : "دسترسی غیرفعال / نیازمند تنظیم"}</span>
                    </div>
                    {w.status === "ended" && (
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-3)" }}>
                        دعوت کانال تا تعیین سیاست جداگانه غیرفعال است.
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleRegistration(w)}
                      disabled={!w.registration_open && !hasAccessWindow(w)}
                      title={w.registration_open ? "بستن ثبت‌نام" : hasAccessWindow(w) ? "باز کردن ثبت‌نام" : "ابتدا بازهٔ دسترسی را تنظیم کنید"}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: w.registration_open ? "var(--success)" : "var(--text-3)" }}
                    >
                      {w.registration_open ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      onClick={() => handleEdit(w)}
                      title="ویرایش"
                      className="p-2 rounded-lg"
                      style={{ color: "var(--text-2)" }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
                      title="حذف"
                      className="p-2 rounded-lg"
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
