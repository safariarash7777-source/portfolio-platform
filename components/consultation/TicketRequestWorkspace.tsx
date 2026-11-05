"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/deadline";
import { authSessionFailure } from "@/lib/auth/session-error";
import { toPersianDigits } from "@/lib/format";
import { readConsultation } from "@/lib/consultation/request";
import type { ConsultationRead } from "@/lib/consultation/contracts";
import { validateTicketTransition, validateTicketContinuation, type TicketCommand, type TicketRead, type TicketReceipt, type TicketRequest } from "@/lib/consultation/tickets";
import { afterConfirmedTicketAbsence, prepareTicketStorageAttempt, readTicketStorage, recoverTicketStorageAttempt, sendTicketStorageAttempt, ticketLookupSelection, type TicketStorageAttempt } from "@/lib/consultation/ticketStorageRequest";
import { ticketStorageParent, type TicketInboxItem, type TicketStorageCapability, type TicketStorageEnvelope } from "@/lib/consultation/ticketStorageContracts";
import { bindOriginalPreparation, readTicketAttemptStorage, sendTicketPreparation } from "@/lib/consultation/ticketAttemptStorageRequest";
import { restorePreparedTicketAttempt, type TicketAttemptMetadata, type TicketPrepared } from "@/lib/consultation/ticketAttemptStorageContracts";
import { diagnoseTicketServiceRight } from "@/lib/consultation/ticketServiceRightDiagnostic";
import TicketRequestPanel, { blankTicketDraft, type TicketDraft, type TicketLegacyDiagnosticView } from "./TicketRequestPanel";

type Pending = "preparation_unknown" | "preparation_absent" | "none" | "uncertain" | "confirmed_absent" | "request_found" | "readback_pending" | "unavailable";
export default function TicketRequestWorkspace({ expectedActorId, initialRelationshipId, initialRequestId }: { expectedActorId: string; initialRelationshipId?: string; initialRequestId?: string }) {
  const [identity, setIdentity] = useState<"checking" | "ready" | "error" | "changed">("checking");
  const [source, setSource] = useState<ConsultationRead | null>(null), [items, setItems] = useState<TicketInboxItem[] | null>(null), [data, setData] = useState<TicketRead | null>(null);
  const [preparations, setPreparations] = useState<TicketAttemptMetadata[] | null>(null);
  const durable = useRef<TicketPrepared | null>(null), durabilityReady = useRef(false);
  const [capability, setCapability] = useState<TicketStorageCapability>({ state: "not_connected", runId: null });
  const [legacyDiagnostic, setLegacyDiagnostic] = useState<TicketLegacyDiagnosticView | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [draft, setDraft] = useState<TicketDraft>(() => blankTicketDraft()), [dirty, setDirty] = useState(false);
  const [reading, setReading] = useState(false), [posting, setPosting] = useState(false), [needsRefresh, setNeedsRefresh] = useState(false);
  const [pendingState, setPendingState] = useState<Pending>("none"), [message, setMessage] = useState("");
  const live = useRef(false), sequence = useRef(0), writeSequence = useRef(0), inFlight = useRef(false), abort = useRef<AbortController | null>(null);
  const relation = useRef(initialRelationshipId), selectedRequest = useRef(initialRequestId);
  const attempt = useRef<TicketStorageAttempt | null>(null), saved = useRef<TicketReceipt | null>(null), lastLookup = useRef<TicketStorageEnvelope | null>(null);
  const confirmedHistory = useRef<TicketRead | null>(null), dirtyRef = useRef(false);
  const invalidateWrites = useCallback(() => { writeSequence.current++; }, []);
  const cancelReads = useCallback(() => { sequence.current++; abort.current?.abort(); setLegacyDiagnostic(null); setLegacyLoading(false); }, []);
  const suspendIdentity = useCallback(() => {
    // Keep the same actor's intent/draft privately in memory, but remove every
    // rendered authorization result until a fresh parent read authorizes it.
    live.current = false; cancelReads(); invalidateWrites(); inFlight.current = false;
    setSource(null); setItems(null); setData(null); setPreparations(null); durabilityReady.current = false; setCapability({ state: "unavailable", runId: null });
    setReading(false); setPosting(false); setNeedsRefresh(true); setIdentity("error");
  }, [cancelReads, invalidateWrites]);
  const clearPrivate = useCallback((text: string) => {
    live.current = false; cancelReads(); invalidateWrites(); attempt.current = null; durable.current = null; saved.current = null; lastLookup.current = null; confirmedHistory.current = null; inFlight.current = false; dirtyRef.current = false;
    setSource(null); setItems(null); setData(null); setPreparations(null); durabilityReady.current = false; setCapability({ state: "not_connected", runId: null }); setDraft(blankTicketDraft()); setDirty(false); setPendingState("none"); setReading(false); setPosting(false); setNeedsRefresh(false); setMessage(text); setIdentity("changed");
  }, [cancelReads, invalidateWrites]);
  const setLocation = useCallback((relationshipId?: string, requestId?: string) => {
    const url = new URL(window.location.href);
    if (relationshipId) url.searchParams.set("relation", relationshipId); else url.searchParams.delete("relation");
    if (requestId) url.searchParams.set("request", requestId); else url.searchParams.delete("request");
    // Only resource IDs enter the URL, never subject, text, command or intent.
    window.history.replaceState(null, "", url);
  }, []);
  const keepHistory = useCallback((next: TicketRead, parent: ConsultationRead) => {
    if (confirmedHistory.current?.requestId === next.requestId && confirmedHistory.current.relationshipId === next.relationshipId) validateTicketContinuation(confirmedHistory.current, next, parent, next.requestId);
    if (next.history.state === "ready") confirmedHistory.current = next;
    setData(next);
  }, []);
  const readLegacyDiagnostic = useCallback((parent: ConsultationRead, generation: number, parentSignal: AbortSignal) => {
    if (parent.actor.id !== expectedActorId || parent.selected?.clientId !== expectedActorId) return;
    const current = () => live.current && generation === sequence.current && !parentSignal.aborted;
    if (!current()) return;
    setLegacyLoading(true);
    // This independent read cannot delay or authorize a ticket/history operation.
    void withDeadline(async signal => {
      const client = createClient();
      const carrier = await client.auth.getSession();
      if (signal.aborted || !current()) throw Error("legacy_read_cancelled");
      if (carrier.error || !carrier.data.session?.access_token) throw Error("legacy_auth_unavailable");
      // The session's user is not permission evidence. Bind Auth and the data
      // request to the same validated token, without changing global client state.
      const jwt = carrier.data.session.access_token;
      const identity = await client.auth.getUser(jwt);
      if (signal.aborted || !current()) throw Error("legacy_read_cancelled");
      if (identity.error || !identity.data.user) throw Error("legacy_auth_unavailable");
      if (identity.data.user.id !== expectedActorId) {
        clearPrivate("حساب تغییر کرده است؛ دادهٔ خصوصی قبلی نمایش داده نمی‌شود.");
        throw Error("legacy_actor_changed");
      }
      const result = await client.from("entitlements")
        .select("id,user_id,kind,source,starts_at,expires_at,revoked_at", { count: "exact" })
        .eq("user_id", identity.data.user.id).order("id", { ascending: true }).range(0, 999)
        .retry(false).setHeader("Authorization", `Bearer ${jwt}`).abortSignal(signal);
      if (signal.aborted || !current()) throw Error("legacy_read_cancelled");
      const snapshot = result.error || !Array.isArray(result.data)
        ? { state: "unavailable", rows: null }
        : { state: "ready", rows: result.data, complete: Number.isSafeInteger(result.count) && result.count !== null && result.count >= 0 && result.count <= 1000 && result.count === result.data.length };
      return diagnoseTicketServiceRight(snapshot, expectedActorId, new Date().toISOString());
    }, 10_000, parentSignal).then(value => {
      if (current()) setLegacyDiagnostic({ ownerId: expectedActorId, value });
    }).catch(() => {
      if (current()) setLegacyDiagnostic({ ownerId: expectedActorId, value: diagnoseTicketServiceRight({ state: "unavailable", rows: null }, expectedActorId, new Date().toISOString()) });
    }).finally(() => { if (current()) setLegacyLoading(false); });
  }, [clearPrivate, expectedActorId]);
  const load = useCallback(async (relationshipId?: string, requestId?: string) => {
    if (!live.current) return;
    const generation = ++sequence.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setLegacyDiagnostic(null); setLegacyLoading(false);
    setReading(true); setNeedsRefresh(true);
    try {
      const parentRead = await readConsultation({ actorId: expectedActorId, relationshipId, signal: controller.signal });
      if (!live.current || generation !== sequence.current) return;
      if (parentRead.status !== "ready") {
        if (["AUTH_REQUIRED", "ACTOR_CHANGED", "FORBIDDEN"].includes(parentRead.error.code)) { clearPrivate("نشست یا دسترسی رابطه تأیید نشد؛ داده و تلاش خصوصی نمایش داده نمی‌شود."); return; }
        suspendIdentity();
        setMessage(parentRead.error.error); return;
      }
      const parent = parentRead.data;
      if (attempt.current && !parent.selected) { clearPrivate("رابطهٔ تلاش خصوصی در خواندن جاری تأیید نشد؛ تلاش بازگردانده نمی‌شود."); return; }
      if (parent.selected) {
        try { ticketStorageParent(parent, expectedActorId, parent.selected.id); }
        catch { clearPrivate("دسترسی جاری به رابطه تأیید نشد؛ محتوای خصوصی کنار گذاشته شد."); return; }
      }
      if (!parent.selected) { setSource(parent); setIdentity("ready"); relation.current = undefined; selectedRequest.current = undefined; setItems(null); setData(null); setNeedsRefresh(false); return; }
      const relationship = parent.selected.id;
      if (attempt.current && JSON.parse(attempt.current.intent.body).command.relationshipId !== relationship) { clearPrivate("رابطهٔ تلاش خصوصی تغییر کرده است؛ تلاش قبلی نمایش داده نمی‌شود."); return; }
      setSource(parent); setIdentity("ready");
      readLegacyDiagnostic(parent, generation, controller.signal);
      relation.current = relationship;
      const inbox = await readTicketStorage({ mode: "inbox", relationshipId: relationship }, parent, { signal: controller.signal });
      if (!live.current || generation !== sequence.current) return;
      if (inbox.status !== "ready" || inbox.data.mode !== "inbox") {
        if (inbox.status === "error" && [401, 403].includes(inbox.httpStatus ?? 0)) { clearPrivate("دسترسی فهرست درخواست‌ها تأیید نشد؛ دادهٔ خصوصی کنار گذاشته شد."); return; }
        setItems(null); setMessage("فهرست درخواست‌ها خوانده نشد؛ فهرست خالی تأیید نشده است."); return;
      }
      setItems(inbox.data.data.requests); setCapability(inbox.data.capability);
      const retained = await readTicketAttemptStorage({ mode: "list", relationshipId: relationship }, parent, { signal: controller.signal });
      if (!live.current || generation !== sequence.current) return;
      if (retained.status === "error" && [401, 403].includes(retained.httpStatus ?? 0)) { clearPrivate("دسترسی تلاش‌های محفوظ تأیید نشد؛ محتوای خصوصی کنار گذاشته شد."); return; }
      const retainedReady = retained.status === "ready" && retained.data.contractVersion === "consultation-ticket-attempt-list.v1";
      durabilityReady.current = retainedReady;
      setPreparations(retained.status === "ready" && retained.data.contractVersion === "consultation-ticket-attempt-list.v1" ? retained.data.attempts : null);
      if (attempt.current) {
        const input = JSON.parse(attempt.current.intent.body) as TicketRequest;
        const preservation = await readTicketAttemptStorage({ mode: "lookup", relationshipId: relationship, clientToken: input.clientToken }, parent, { expectedBody: attempt.current.intent.body, signal: controller.signal });
        if (!live.current || generation !== sequence.current) return;
        if (preservation.status === "error" && [401, 403].includes(preservation.httpStatus ?? 0)) { clearPrivate("دسترسی متن اصلی تأیید نشد؛ متن یا رسید خصوصی بازگردانده نمی‌شود."); return; }
        durable.current = null;
        const preserved = preservation.status === "ready" && preservation.data.contractVersion === "consultation-ticket-attempt-lookup.v1" ? preservation.data : null;
        if (preserved?.state === "found") { bindOriginalPreparation(preserved.prepared!, attempt.current, parent); durable.current = preserved.prepared; }
        const looked = await readTicketStorage(ticketLookupSelection(input), parent, { input, signal: controller.signal });
        if (!live.current || generation !== sequence.current) return;
        if (looked.status !== "ready" || looked.data.mode !== "lookup") {
          if (looked.status === "error" && [401, 403].includes(looked.httpStatus ?? 0)) { clearPrivate("دسترسی تلاش محفوظ تأیید نشد؛ تلاش یا رسید خصوصی بازگردانده نمی‌شود."); return; }
          setPendingState(saved.current ? "readback_pending" : "unavailable"); setMessage("نتیجهٔ همان تلاش هنوز تعیین تکلیف نشده است؛ فقط بازخوانی انجام دهید."); return;
        }
        lastLookup.current = looked.data;
        const result = recoverTicketStorageAttempt(attempt.current, looked.data, parent, saved.current);
        if (looked.data.data.request.state === "found") keepHistory(looked.data.data.request.data, parent);
        if (result.status === "confirmed") {
          selectedRequest.current = input.command.requestId; setLocation(relationship, input.command.requestId);
          setMessage(`ثبت نسخهٔ ${toPersianDigits(result.receipt!.version)} در بازخوانی مستقل تطبیق داده شد.`);
          attempt.current = null; durable.current = null; saved.current = null; lastLookup.current = null; setPendingState("none"); dirtyRef.current = false; setDirty(false);
          setDraft(blankTicketDraft(parent.actor.id === parent.selected.clientId ? "member_followup" : "advisor_clarification")); setNeedsRefresh(false);
        } else {
          if (!durable.current) {
            setPendingState(preserved?.state === "confirmed_absent" ? "preparation_absent" : "preparation_unknown");
            setMessage(preserved?.state === "confirmed_absent" ? "نبود متن محفوظ همین تلاش تأیید شد؛ فرمانی خودکار ارسال نمی‌شود. حفظ دوباره فقط صریح و با همان متن و شناسه ممکن است." : "حفظ متن اصلی هنوز تعیین تکلیف نشده است؛ هیچ فرمانی ارسال نمی‌شود. فقط بازخوانی کنید.");
            return;
          }
          setCapability(looked.data.capability); setPendingState(result.status);
          setMessage(result.status === "confirmed_absent" ? "نبود اثر همین تلاش در بازخوانی تأیید شد؛ تکرار خودکار انجام نمی‌شود. تلاش صریح فقط با همان متن، شناسه و نسخه ممکن است." : "رسید یا نتیجهٔ درخواست هنوز کامل تطبیق داده نشده است؛ متن و تلاش ثابت مانده‌اند و دوباره ارسال نمی‌شوند.");
        }
        return;
      }
      if (requestId) {
        const history = await readTicketStorage({ mode: "read", relationshipId: relationship, requestId }, parent, { signal: controller.signal });
        if (!live.current || generation !== sequence.current) return;
        if (history.status !== "ready" || history.data.mode !== "read") {
          if (history.status === "error" && [401, 403].includes(history.httpStatus ?? 0)) { clearPrivate("دسترسی تاریخچه تأیید نشد؛ محتوای خصوصی نمایش داده نمی‌شود."); return; }
          setMessage("تاریخچهٔ همین شناسه خوانده نشد؛ درخواست تازه یا ثبت تکراری به‌طور خودکار ساخته نمی‌شود."); return;
        }
        keepHistory(history.data.data, parent); setCapability(history.data.capability); selectedRequest.current = requestId;
      } else { setData(null); selectedRequest.current = undefined; confirmedHistory.current = null; }
      if (!dirtyRef.current) setDraft(blankTicketDraft(parent.actor.id === parent.selected.clientId ? requestId ? "member_followup" : "open" : "advisor_clarification"));
      setNeedsRefresh(!retainedReady); setMessage(retainedReady ? "" : "فهرست تلاش‌های محفوظ تأیید نشد؛ تاریخچه قابل خواندن است و ثبت تازه تا بازخوانی بسته است.");
    } catch {
      if (live.current && generation === sequence.current) { suspendIdentity(); setMessage("بازخوانی معتبر انجام نشد؛ تاریخچهٔ قبلی جای نتیجهٔ تازه نیست. نشست را بررسی و دوباره بازخوانی کنید؛ ثبت تکرار نشود."); }
    } finally { if (generation === sequence.current) setReading(false); }
  }, [clearPrivate, expectedActorId, keepHistory, readLegacyDiagnostic, setLocation, suspendIdentity]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    try {
      const { data: auth } = createClient().auth.onAuthStateChange((event, session) => {
        if (disposed) return;
        if (event === "SIGNED_OUT" || session?.user && session.user.id !== expectedActorId) { clearPrivate("حساب تغییر کرده یا خارج شده است؛ متن و تلاش خصوصی پاک شد."); return; }
        if (!session?.user) { suspendIdentity(); return; }
        const first = !live.current; live.current = true;
        if (first) { setIdentity("checking"); void load(relation.current, selectedRequest.current); }
      });
      unsubscribe = () => auth.subscription.unsubscribe();
    } catch { live.current = false; setIdentity("error"); }
    return () => { disposed = true; live.current = false; cancelReads(); invalidateWrites(); attempt.current = null; durable.current = null; saved.current = null; confirmedHistory.current = null; unsubscribe(); };
  }, [cancelReads, clearPrivate, expectedActorId, invalidateWrites, load, suspendIdentity]);
  useEffect(() => {
    if (!dirty && pendingState === "none") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pendingState]);
  const verify = async () => {
    try {
      const auth = await withDeadline(() => createClient().auth.getUser(), 10_000);
      if (authSessionFailure(auth.error) === 401 || !auth.error && !auth.data.user) { clearPrivate("نشست معتبر وجود ندارد؛ تلاش خصوصی کنار گذاشته شد."); return; }
      if (auth.error || !auth.data.user) { setMessage("نشست معتبر تأیید نشد؛ هیچ ثبت تازه‌ای انجام نشد."); return; }
      if (auth.data.user.id !== expectedActorId) { clearPrivate("حساب تغییر کرده است؛ صفحه را با هویت جدید باز کنید."); return; }
      live.current = true; setIdentity("checking"); await load(relation.current, selectedRequest.current);
    } catch { setMessage("بررسی نشست در دسترس نیست؛ متن یا ثبت تازه‌ای ارسال نشد."); }
  };
  const transmit = async (prepared: TicketStorageAttempt) => {
    if (!source || !live.current) return;
    if (!durable.current || durable.current.body !== prepared.intent.body || durable.current.fixtureRunId !== prepared.fixtureRunId) { setPendingState("preparation_unknown"); setMessage("متن اصلی در بازخوانی مستقل سرور تطبیق داده نشده است؛ فرمان ارسال نشد."); return; }
    const generation = sequence.current;
    const result = await sendTicketStorageAttempt(prepared, source, { currentActorId: expectedActorId });
    if (!live.current || generation !== sequence.current) return;
    if (result.status === "saved") { saved.current = result.receipt; setPendingState("readback_pending"); await load(relation.current, selectedRequest.current); }
    else if (result.status === "uncertain") { setPendingState("uncertain"); setMessage("نتیجهٔ ثبت نامعلوم است؛ ارسال دوباره بسته است. فقط همان تلاش را بازخوانی کنید."); }
    else {
      if (result.httpStatus === 401 || result.httpStatus === 403) { clearPrivate("نشست یا دسترسی هنگام ثبت رد شد؛ محتوای خصوصی بازگردانده نمی‌شود."); return; }
      attempt.current = null; saved.current = null; lastLookup.current = null; setPendingState("none"); setNeedsRefresh(true); setMessage(result.error.error);
    }
  };
  const preserveThenTransmit = async (prepared: TicketStorageAttempt) => {
    if (!source?.selected || !live.current) return;
    const generation = sequence.current;
    const result = await sendTicketPreparation(prepared, source, { currentActorId: expectedActorId });
    if (!live.current || generation !== sequence.current) return;
    if (result.status === "uncertain") { setPendingState("preparation_unknown"); setMessage("نتیجهٔ حفظ متن اصلی نامعلوم است؛ هیچ فرمانی ارسال نشد. فقط همان تلاش را بازخوانی کنید."); return; }
    if (result.status !== "saved") {
      if ([401, 403].includes(result.httpStatus ?? 0)) { clearPrivate("هویت یا دسترسی هنگام حفظ متن رد شد؛ محتوای خصوصی کنار گذاشته شد."); return; }
      attempt.current = null; durable.current = null; setPendingState("none"); setNeedsRefresh(true); setMessage(result.error.error); return;
    }
    const readback = await readTicketAttemptStorage({ mode: "lookup", relationshipId: source.selected.id, clientToken: prepared.intent.clientToken }, source, { expectedBody: prepared.intent.body });
    if (!live.current || generation !== sequence.current) return;
    if (readback.status !== "ready" || readback.data.contractVersion !== "consultation-ticket-attempt-lookup.v1" || readback.data.state !== "found") {
      if (readback.status === "error" && [401, 403].includes(readback.httpStatus ?? 0)) { clearPrivate("دسترسی بازخوانی متن اصلی رد شد؛ محتوای خصوصی بازگردانده نمی‌شود."); return; }
      setPendingState("preparation_unknown"); setMessage("حفظ متن در بازخوانی مستقل تطبیق نشد؛ فرمانی ارسال نشد. فقط بازخوانی کنید."); return;
    }
    const persisted = readback.data.prepared!;
    bindOriginalPreparation(persisted, prepared, source);
    if (persisted.preparationId !== result.receipt.preparationId || persisted.bodyHash !== result.receipt.bodyHash || persisted.createdAt !== result.receipt.createdAt) throw Error("preparation receipt changed");
    durable.current = persisted;
    const input = JSON.parse(prepared.intent.body) as TicketRequest;
    const current = await readTicketStorage(ticketLookupSelection(input), source, { input });
    if (!live.current || generation !== sequence.current) return;
    if (current.status !== "ready" || current.data.mode !== "lookup") {
      if (current.status === "error" && [401, 403].includes(current.httpStatus ?? 0)) { clearPrivate("دسترسی نسخهٔ مبنا رد شد؛ فرمان ارسال نشد."); return; }
      setPendingState("unavailable"); setMessage("نسخه و نتیجهٔ جاری تأیید نشد؛ متن روی سرور محفوظ است. فقط بازخوانی کنید."); return;
    }
    if (current.data.data.attempt.state === "found") { await load(relation.current, selectedRequest.current); return; }
    afterConfirmedTicketAbsence(prepared, current.data, source);
    validateTicketTransition(input, source, current.data.data);
    setPendingState("uncertain"); await transmit(prepared);
  };
  const submit = async () => {
    if (!live.current || !source?.selected || inFlight.current || reading || posting || attempt.current || needsRefresh || !durabilityReady.current) return;
    inFlight.current = true; setPosting(true); const generation = sequence.current, writeGeneration = ++writeSequence.current;
    try {
      const requestId = data?.requestId ?? crypto.randomUUID();
      const baseVersion = data?.history.state === "ready" ? data.history.events[data.history.events.length - 1].version : 0;
      const common = { relationshipId: source.selected.id, requestId, baseVersion };
      const command: TicketCommand = draft.kind === "open" ? { ...common, kind: "open", subject: draft.subject, text: draft.text, recommendation: draft.recommendation }
        : draft.kind === "close" ? { ...common, kind: "close", reason: draft.text }
          : draft.kind === "link_recommendation" ? { ...common, kind: "link_recommendation", recommendation: draft.recommendation! }
            : { ...common, kind: draft.kind, text: draft.text };
      const input: TicketRequest = { contractVersion: "consultation-ticket-request.v1", expectedActorId, clientToken: crypto.randomUUID(), command };
      const lookup = await readTicketStorage(ticketLookupSelection(input), source, { input });
      if (!live.current || generation !== sequence.current) return;
      if (lookup.status !== "ready") {
        if ([401, 403].includes(lookup.httpStatus ?? 0)) { clearPrivate("دسترسی پیش از ثبت تأیید نشد؛ تلاش خصوصی کنار گذاشته شد."); return; }
        setMessage("نبود همان تلاش هنوز تأیید نشده است؛ متن حفظ شد و هیچ POST ارسال نشد."); setNeedsRefresh(true); return;
      }
      const result = prepareTicketStorageAttempt(input, source, lookup.data);
      if (result.status === "blocked") { setMessage("حق همان خدمت متصل نیست؛ متن حفظ شد و ثبت ارسال نشد."); return; }
      attempt.current = result.attempt; durable.current = null; saved.current = null; lastLookup.current = null; selectedRequest.current = requestId;
      setLocation(source.selected.id, requestId); setPendingState("preparation_unknown");
      await preserveThenTransmit(result.attempt);
    } catch { if (live.current && generation === sequence.current) setMessage("ورودی یا نسخهٔ مبنا برای ثبت معتبر نیست؛ متن حفظ شده است. پیش از تلاش تازه بازخوانی کنید."); }
    finally { if (writeGeneration === writeSequence.current) { inFlight.current = false; setPosting(false); } }
  };
  const retryAbsent = async () => {
    if (!source || !attempt.current || !lastLookup.current || !["confirmed_absent", "request_found", "preparation_absent"].includes(pendingState) || inFlight.current || reading) return;
    inFlight.current = true; setPosting(true); const writeGeneration = ++writeSequence.current;
    try { const same = afterConfirmedTicketAbsence(attempt.current, lastLookup.current, source); if (pendingState === "preparation_absent") await preserveThenTransmit(same); else { setPendingState("uncertain"); await transmit(same); } }
    catch { setMessage("نبود ثبت، نسخه یا مجوز آزمایشی جاری تطبیق داده نشد؛ فقط بازخوانی انجام دهید."); }
    finally { if (writeGeneration === writeSequence.current) { inFlight.current = false; setPosting(false); } }
  };
  const restorePreparation = async (preparationId: string) => {
    if (!live.current || !source?.selected || reading || posting || attempt.current || dirtyRef.current) return;
    const generation = ++sequence.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller; setLegacyDiagnostic(null); setLegacyLoading(false); setReading(true); setNeedsRefresh(true);
    try {
      const result = await readTicketAttemptStorage({ mode: "lookup", relationshipId: source.selected.id, preparationId }, source, { signal: controller.signal });
      if (!live.current || generation !== sequence.current) return;
      if (result.status !== "ready" || result.data.contractVersion !== "consultation-ticket-attempt-lookup.v1" || result.data.state !== "found") {
        if (result.status === "error" && [401, 403].includes(result.httpStatus ?? 0)) { clearPrivate("دسترسی تلاش انتخاب‌شده رد شد؛ متن خصوصی بازگردانده نمی‌شود."); return; }
        setMessage("متن همان تلاش انتخاب‌شده خوانده نشد؛ ثبت یا انتخاب جایگزین خودکار انجام نمی‌شود."); return;
      }
      const stored = result.data.prepared!, restored = restorePreparedTicketAttempt(stored, source), input = JSON.parse(restored.intent.body) as TicketRequest, command = input.command;
      attempt.current = restored; durable.current = stored; saved.current = null; lastLookup.current = null; confirmedHistory.current = null; selectedRequest.current = command.requestId; setData(null);
      setDraft({ kind: command.kind, subject: command.kind === "open" ? command.subject : "", text: command.kind === "close" ? command.reason : command.kind === "link_recommendation" ? "" : command.text, recommendation: command.kind === "open" || command.kind === "link_recommendation" ? command.recommendation : null });
      dirtyRef.current = true; setDirty(true); setPendingState("unavailable"); setLocation(source.selected.id, command.requestId);
      // A restored intent only triggers reads; it never resumes a command POST.
      await load(source.selected.id, command.requestId);
    } catch { if (live.current && generation === sequence.current) setMessage("متن/هویت/هش تلاش انتخاب‌شده تطبیق داده نشد؛ هیچ فرمانی ارسال نشد."); }
    finally { if (generation === sequence.current) setReading(false); }
  };
  if (identity !== "ready") return <section className="card space-y-3 p-5" aria-label="تأیید هویت درخواست"><p role="status">{identity === "checking" ? "در حال تأیید نشست…" : message || "نشست تأیید نشده است؛ محتوای خصوصی نمایش داده نمی‌شود."}</p>{identity === "error" && <button type="button" className="btn btn-outline" onClick={() => void verify()}>بررسی نشست و بازخوانی</button>}</section>;
  const locked = reading || posting || pendingState !== "none";
  const selectionLocked = locked || dirty;
  return <div className="min-w-0 space-y-4">
    {source && <label className="block space-y-1 text-sm">رابطهٔ مجاز<select className="input min-h-11 w-full" disabled={selectionLocked} value={source.selected?.id ?? ""} onChange={event => {
      if (selectionLocked) return; relation.current = event.target.value || undefined; selectedRequest.current = undefined; confirmedHistory.current = null; setData(null); setItems(null); setPreparations(null); durabilityReady.current = false; setLocation(relation.current); void load(relation.current);
    }}><option value="">انتخاب رابطه</option>{source.relationships.map(item => <option key={item.id} value={item.id}>{item.clientLabel} · {item.revoked ? "لغوشده" : "فعال"}</option>)}</select></label>}
    {message && <p role="status" className="card break-words p-4 text-sm leading-7">{message}</p>}
    {reading && <p role="status">در حال بازخوانی مستقل پرونده و درخواست…</p>}
    {posting && <p role="status">همان تلاش در حال ثبت است؛ موفقیت هنوز تأیید نشده است.</p>}
    <button type="button" className="btn btn-outline" disabled={reading || posting} onClick={() => void load(relation.current, selectedRequest.current)}>بازخوانی بدون ارسال دوباره</button>
    {["confirmed_absent", "request_found", "preparation_absent"].includes(pendingState) && <button type="button" className="btn btn-outline" disabled={reading || posting} onClick={() => void retryAbsent()}>{pendingState === "preparation_absent" ? "حفظ صریح دوباره با همان متن و شناسه" : "تلاش صریح پس از تأیید نبود ثبت، با همان شناسه"}</button>}
    {source && <TicketRequestPanel source={source} items={items} data={data} preparedAttempts={preparations} onRestorePreparation={id => void restorePreparation(id)} capability={capability} legacyDiagnostic={legacyDiagnostic} legacyLoading={legacyLoading} draft={draft} locked={locked} selectionLocked={selectionLocked} needsRefresh={needsRefresh}
      onDraft={value => { if (!locked) { setDraft(value); dirtyRef.current = true; setDirty(true); } }} onSubmit={() => void submit()}
      onSelect={requestId => { if (!selectionLocked) { selectedRequest.current = requestId; confirmedHistory.current = null; setData(null); setLocation(relation.current, requestId); void load(relation.current, requestId); } }}
      onNew={() => { if (!selectionLocked) { selectedRequest.current = undefined; confirmedHistory.current = null; setData(null); setDraft(blankTicketDraft()); setLocation(relation.current); setNeedsRefresh(!durabilityReady.current); } }}
      onDiscard={() => { if (!locked) { setDraft(blankTicketDraft(source.actor.id === source.selected?.clientId ? data ? "member_followup" : "open" : "advisor_clarification")); dirtyRef.current = false; setDirty(false); } }} />}
  </div>;
}
