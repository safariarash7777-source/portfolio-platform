"use client";

// ─────────────────────────────────────────────────────────────────────────
// AdvisorChat — رابط چتِ مشاور هوش مصنوعی (Navy + Gold)
//   - هندلِ دقیقِ SSE: تایپ روان + کرسر طلایی
//   - حبابِ قرمزِ «قفسِ امنیت مالی فعال شد» هنگام blocked
//   - دیسکلیمرِ فوتر
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Send, ShieldAlert, Loader2 } from "lucide-react";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
}

const FOOTER_DISCLAIMER =
  "این دستیار صرفاً آموزشی و تحلیلی است؛ توصیهٔ سرمایه‌گذاری، تضمین سود یا پیشنهاد خرید/فروش نیست. تصمیم نهایی با شماست.";

let idCounter = 0;
const nextId = () => `m${Date.now()}_${idCounter++}`;

export default function AdvisorChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const appendToAssistant = useCallback((id: string, patch: Partial<Msg>, delta?: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, ...patch, content: delta != null ? m.content + delta : (patch.content ?? m.content) }
          : m,
      ),
    );
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Msg = { id: nextId(), role: "user", content: text };
    const assistantId = nextId();
    const assistantMsg: Msg = { id: assistantId, role: "assistant", content: "" };

    // تاریخچهٔ ارسالی (قبل از افزودن پیام دستیارِ خالی)
    const outbound = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: outbound }),
      });

      if (!res.ok || !res.body) {
        let msg = "خطا در ارتباط با مشاور.";
        if (res.status === 401) msg = "برای استفاده از مشاور باید وارد حساب خود شوید.";
        appendToAssistant(assistantId, { content: msg, blocked: true });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // حلقهٔ خواندن + پارسِ SSE
      // هر event یک خطِ "data: {json}" است که با "\n\n" جدا می‌شود.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = buf.indexOf("\n\n")) !== -1) {
          const rawEvent = buf.slice(0, sepIdx);
          buf = buf.slice(sepIdx + 2);

          const line = rawEvent.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let evt: { type: string; text?: string; message?: string; disclaimer?: string };
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }

          if (evt.type === "delta" && evt.text) {
            appendToAssistant(assistantId, {}, evt.text);
          } else if (evt.type === "blocked") {
            appendToAssistant(assistantId, { content: evt.message ?? "", blocked: true });
          } else if (evt.type === "error") {
            appendToAssistant(assistantId, { content: evt.message ?? "خطا رخ داد.", blocked: true });
          }
          // type === "done": دیسکلیمرِ فوتر همیشه نمایش داده می‌شود؛ کاری لازم نیست.
        }
      }
    } catch {
      appendToAssistant(assistantId, { content: "ارتباط با مشاور قطع شد.", blocked: true });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, appendToAssistant]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div
      className="card-elevated overflow-hidden"
      style={{ borderTop: "4px solid var(--gold)", display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ background: "var(--navy-deep)", color: "var(--gold-soft)" }}
      >
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 40, height: 40, background: "rgba(184,134,11,0.18)" }}
        >
          <Sparkles size={20} style={{ color: "var(--gold)" }} />
        </div>
        <div>
          <div className="font-display font-bold text-base" style={{ color: "#fff" }}>
            مشاور هوشمند سرمایه‌گذاری
          </div>
          <div className="text-xs" style={{ color: "var(--gold-soft)", opacity: 0.85 }}>
            تحلیلگر آموزشی · فقط فارسی
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="px-4 py-5 space-y-4 overflow-y-auto"
        style={{ background: "var(--surface-2)", minHeight: 280, maxHeight: 460 }}
      >
        {messages.length === 0 && (
          <div className="text-center py-10" style={{ color: "var(--text-3)" }}>
            <Sparkles size={28} style={{ color: "var(--gold)", margin: "0 auto 12px" }} />
            <p className="text-sm leading-7 max-w-sm mx-auto">
              دربارهٔ ریسک دارایی‌ها، سناریوهای بازار و چارچوب‌های تحلیلِ سرمایه‌گذاری بپرسید.
              <br />
              این دستیار سود تضمین نمی‌کند و توصیهٔ مستقیم خرید/فروش نمی‌دهد.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === "user";
          const isStreamingBubble = !isUser && m.id === lastId && streaming && !m.blocked;
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
              <div
                className="rounded-2xl px-4 py-3 text-sm leading-7"
                style={{
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  ...(m.blocked
                    ? {
                        background: "rgba(220,38,38,0.08)",
                        border: "1px solid rgba(220,38,38,0.35)",
                        color: "#b91c1c",
                      }
                    : isUser
                      ? {
                          background: "var(--navy-deep)",
                          color: "#fff",
                          borderBottomRightRadius: 18,
                          borderBottomLeftRadius: 4,
                        }
                      : {
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                          color: "var(--text-1)",
                        }),
                }}
              >
                {m.blocked && (
                  <div className="flex items-center gap-1.5 font-bold mb-1.5" style={{ color: "#b91c1c" }}>
                    <ShieldAlert size={15} />
                    قفسِ امنیت مالی فعال شد
                  </div>
                )}
                <span>{m.content}</span>
                {isStreamingBubble && (
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 16,
                      marginInlineStart: 2,
                      verticalAlign: "text-bottom",
                      background: "var(--gold)",
                      borderRadius: 1,
                      animation: "advisorBlink 1s steps(2) infinite",
                    }}
                  />
                )}
                {isStreamingBubble && m.content === "" && (
                  <Loader2 size={16} className="inline" style={{ color: "var(--gold)", animation: "spin 1s linear infinite" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="px-4 py-3" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)" }}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="پرسش خود را بنویسید…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl px-3 py-2.5 text-sm leading-6 outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--text-1)",
              maxHeight: 120,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="btn btn-gold flex-shrink-0"
            style={{ padding: "0.65rem 1rem", opacity: streaming || !input.trim() ? 0.6 : 1 }}
            aria-label="ارسال"
          >
            {streaming ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-xs mt-2.5 leading-6" style={{ color: "var(--text-3)" }}>
          {FOOTER_DISCLAIMER}
        </p>
      </div>

      <style jsx>{`
        @keyframes advisorBlink {
          0%,
          50% {
            opacity: 1;
          }
          50.01%,
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
