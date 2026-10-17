"use client";
import { useCallback, useEffect, useState } from "react";
import {
  DESK_DEFAULTS,
  parseDeskPreferenceReceipt,
  type DeskPreferences,
  type DeskPreferenceReceipt,
} from "@/lib/desk/preferences";
export function useDeskAccountPreferences() {
  const [receipt, setReceipt] = useState<DeskPreferenceReceipt | null>(null);
  const [draft, setDraft] = useState<DeskPreferences>({
    ...DESK_DEFAULTS,
    hiddenTools: [],
  });
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const read = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/desk/preferences", {
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
          : AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error("read_failed");
      const value = parseDeskPreferenceReceipt(await response.json());
      setReceipt(value);
      setDraft(value.preferences);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage(
          "تنظیمات حساب خوانده نشد؛ چیدمان موقت است و ذخیرهٔ حساب تأیید نشده.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    return () => controller.abort();
  }, [read]);
  async function save(next = draft) {
    if (!receipt || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/desk/preferences", {
        method: "PUT",
        signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, expectedRevision: receipt.revision }),
      });
      if (response.status === 409) {
        setMessage(
          "تنظیمات در نشست دیگری تغییر کرده؛ انتخاب شما حفظ شد. پیش از ذخیرهٔ دوباره، حساب را بازخوانی کنید.",
        );
        return;
      }
      if (!response.ok) throw new Error("save_unconfirmed");
      const value = parseDeskPreferenceReceipt(await response.json());
      if (
        value.revision <= receipt.revision ||
        value.preferences.layout !== next.layout ||
        [...value.preferences.hiddenTools].sort().join() !==
          [...next.hiddenTools].sort().join()
      )
        throw new Error("invalid_save_receipt");
      setReceipt(value);
      setDraft(value.preferences);
      setMessage("تنظیمات در حساب شما ذخیره و تأیید شد.");
    } catch {
      setMessage(
        "نتیجهٔ ذخیره تأیید نشد؛ انتخاب شما حفظ شده است. برای روشن‌شدن نتیجه، تنظیمات حساب را بازخوانی کنید.",
      );
    } finally {
      setSaving(false);
    }
  }
  return {
    receipt,
    draft,
    setDraft,
    loading,
    saving,
    message,
    reload: () => read(),
    save,
    reset: () => save({ ...DESK_DEFAULTS, hiddenTools: [] }),
  };
}
