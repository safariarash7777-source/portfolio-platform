"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PreferenceRequests } from "@/lib/desk/preference-requests";
import {
  DESK_DEFAULTS,
  parseDeskPreferenceReceipt,
  type DeskPreferences,
  type DeskPreferenceReceipt,
} from "@/lib/desk/preferences";
export function useDeskAccountPreferences() {
  const requests = useRef(new PreferenceRequests());
  const confirmed = useRef<DeskPreferenceReceipt | null>(null);
  const [receipt, setReceipt] = useState<DeskPreferenceReceipt | null>(null);
  const [draft, setDraft] = useState<DeskPreferences>({
    ...DESK_DEFAULTS,
    hiddenTools: [],
  });
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const read = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    const request = requests.current.begin("read");
    if (!request) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/desk/preferences", {
        cache: "no-store",
        signal: AbortSignal.any([
          request.controller.signal,
          AbortSignal.timeout(12000),
          ...(signal ? [signal] : []),
        ]),
      });
      if (!response.ok) throw new Error("read_failed");
      const value = parseDeskPreferenceReceipt(await response.json());
      if (!requests.current.accepts(request) || signal?.aborted) return;
      if (value.revision < (confirmed.current?.revision ?? 0))
        throw new Error("obsolete_receipt");
      confirmed.current = value;
      setReceipt(value);
      setDraft(value.preferences);
    } catch (error) {
      if (
        requests.current.accepts(request) &&
        !signal?.aborted &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        setMessage(
          "تنظیمات حساب خوانده نشد؛ چیدمان موقت است و ذخیرهٔ حساب تأیید نشده.",
        );
    } finally {
      if (requests.current.finish(request) && !signal?.aborted)
        setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const activeRequests = requests.current;
    void read(controller.signal);
    return () => {
      controller.abort();
      activeRequests.cancel();
    };
  }, [read]);
  async function save(next = draft) {
    const previous = confirmed.current;
    if (!previous) return;
    const request = requests.current.begin("save");
    if (!request) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/desk/preferences", {
        method: "PUT",
        signal: AbortSignal.any([
          request.controller.signal,
          AbortSignal.timeout(12000),
        ]),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, expectedRevision: previous.revision }),
      });
      if (!requests.current.accepts(request)) return;
      if (response.status === 409) {
        setMessage(
          "تنظیمات در نشست دیگری تغییر کرده؛ انتخاب شما حفظ شد. پیش از ذخیرهٔ دوباره، حساب را بازخوانی کنید.",
        );
        return;
      }
      if (!response.ok) throw new Error("save_unconfirmed");
      const value = parseDeskPreferenceReceipt(await response.json());
      if (!requests.current.accepts(request)) return;
      if (
        value.revision <= previous.revision ||
        value.preferences.layout !== next.layout ||
        [...value.preferences.hiddenTools].sort().join() !==
          [...next.hiddenTools].sort().join()
      )
        throw new Error("invalid_save_receipt");
      confirmed.current = value;
      setReceipt(value);
      setDraft(value.preferences);
      setMessage("تنظیمات در حساب شما ذخیره و تأیید شد.");
    } catch {
      if (requests.current.accepts(request))
        setMessage(
          "نتیجهٔ ذخیره تأیید نشد؛ انتخاب شما حفظ شده است. برای روشن‌شدن نتیجه، تنظیمات حساب را بازخوانی کنید.",
        );
    } finally {
      if (requests.current.finish(request)) setSaving(false);
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
