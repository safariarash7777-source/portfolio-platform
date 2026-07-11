"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Video,
  Users,
  Calendar,
  Send,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";

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
  status: string;
  invites_sent: boolean;
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
    published: { bg: "#dbeafe", color: "#1d4ed8", label: "منتشرشده" },
    live: { bg: "#dcfce7", color: "#16a34a", label: "در حال برگزاری" },
    ended: { bg: "#f3f4f6", color: "#6b7280", label: "پایان‌یافته" },
    cancelled: { bg: "#fee2e2", color: "#dc2626", label: "لغوشده" },
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
  return toman.toLocaleString("fa-IR") + " تومان";
}

export default function AdminWebinarsPage() {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingInvites, setSendingInvites] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const emptyForm: FormData = {
    title: "",
    description: "",
    starts_at: "",
    ends_at: "",
    registration_open: false,
    max_capacity: "",
    price_toman: "0",
    platform: "link",
    platform_url: "",
    status: "draft",
  };
  const [form, setForm] = useState<FormData>(emptyForm);

  const fetchWebinars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/webinars");
      if (!res.ok) throw new Error("خطا در دریافت وبینارها");
      const data = await res.json();
      setWebinars(data.webinars ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebinars();
  }, [fetchWebinars]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload: any = {
      title: form.title,
      description: form.description || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      registration_open: form.registration_open,
      max_capacity: form.max_capacity ? parseInt(form.max_capacity) : null,
      price_toman: parseInt(form.price_toman) || 0,
      platform: form.platform,
      platform_url: form.platform_url || null,
      status: form.status,
    };

    try {
      let res;
      if (editingId) {
        res = await fetch("/api/admin/webinars", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        res = await fetch("/api/admin/webinars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "خطا");
      }
      setSuccess(editingId ? "وبینار ویرایش شد." : "وبینار ساخته شد.");
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchWebinars();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (w: Webinar) => {
    setEditingId(w.id);
    setForm({
      title: w.title,
      description: w.description || "",
      starts_at: w.starts_at ? w.starts_at.slice(0, 16) : "",
      ends_at: w.ends_at ? w.ends_at.slice(0, 16) : "",
      registration_open: w.registration_open,
      max_capacity: w.max_capacity ? String(w.max_capacity) : "",
      price_toman: String(w.price_toman),
      platform: w.platform,
      platform_url: w.platform_url || "",
      status: w.status,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("آیا از حذف این وبینار مطمئنید؟")) return;
    try {
      const res = await fetch("/api/admin/webinars", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("خطا در حذف");
      fetchWebinars();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSendInvites = async (id: string) => {
    if (!confirm("آیا از ارسال دعوت‌نامه‌ها به شرکت‌کنندگان مطمئنید؟")) return;
    setSendingInvites(id);
    try {
      const res = await fetch("/api/admin/webinars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "send_invites" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا");
      setSuccess(`${data.sent} دعوت‌نامه ارسال شد.`);
      fetchWebinars();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingInvites(null);
    }
  };

  const toggleRegistration = async (w: Webinar) => {
    try {
      const res = await fetch("/api/admin/webinars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id, registration_open: !w.registration_open }),
      });
      if (!res.ok) throw new Error("خطا");
      fetchWebinars();
    } catch (e: any) {
      setError(e.message);
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
          className="mb-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
          style={{ background: "#fee2e2", color: "#dc2626" }}
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
          className="mb-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
          style={{ background: "#dcfce7", color: "#16a34a" }}
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
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                تاریخ و ساعت شروع *
              </label>
              <input
                type="datetime-local"
                required
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              />
            </div>

            {/* تاریخ پایان */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                تاریخ و ساعت پایان
              </label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              />
            </div>

            {/* قیمت */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                قیمت (تومان)
              </label>
              <input
                type="number"
                min="0"
                value={form.price_toman}
                onChange={(e) => setForm({ ...form, price_toman: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                placeholder="0 = رایگان"
              />
            </div>

            {/* ظرفیت */}
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--text-2)" }}>
                حداکثر ظرفیت
              </label>
              <input
                type="number"
                min="1"
                value={form.max_capacity}
                onChange={(e) => setForm({ ...form, max_capacity: e.target.value })}
                className="w-full rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                placeholder="خالی = بدون محدودیت"
              />
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

            {/* ثبت‌نام باز */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="reg_open"
                checked={form.registration_open}
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
                disabled={saving}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                style={{ background: "var(--navy)", color: "var(--text-on-navy)", opacity: saving ? 0.6 : 1 }}
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
                        {regCount} ثبت‌نام
                        {w.max_capacity && ` / ${w.max_capacity}`}
                      </span>
                      <span>{formatPrice(w.price_toman)}</span>
                      <span>{PLATFORMS.find((p) => p.value === w.platform)?.label}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleRegistration(w)}
                      title={w.registration_open ? "بستن ثبت‌نام" : "باز کردن ثبت‌نام"}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: w.registration_open ? "#16a34a" : "var(--text-3)" }}
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
                    {w.status === "ended" && !w.invites_sent && (
                      <button
                        onClick={() => handleSendInvites(w.id)}
                        disabled={sendingInvites === w.id}
                        title="ارسال دعوت‌نامه کانال"
                        className="p-2 rounded-lg"
                        style={{ color: "#1d4ed8" }}
                      >
                        {sendingInvites === w.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Send size={16} />
                        )}
                      </button>
                    )}
                    {w.invites_sent && (
                      <span title="دعوت‌ها ارسال شده" className="p-2">
                        <CheckCircle size={16} style={{ color: "#16a34a" }} />
                      </span>
                    )}
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
