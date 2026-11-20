import { cashFlowObject as object, cashFlowText as text, cashFlowUuid as uuid, cashFlowDay as day, validateCashFlowPeriod, validateCashFlowPayload, type CashFlowPayload } from "../portfolio/cashFlowApiContract";
import { validateGoalsPayload, type GoalsPayload } from "../portfolio/goalsApiContract";
export const CONSULTATION_BODY_LIMIT = 150_000;
export interface FinancialBasis { holdingsVersionId: string | null; cashFlowPeriod: { startOn: string; endOn: string }; cashFlowVersionId: string | null; goalsVersionId: string | null }
export interface RecommendationBody {
 topic: string; goal: string; clientSummary: string; rationale: string; limitations: string; reviewOn: string;
 basis: FinancialBasis; researchVersionIds: string[];
 evidence: { label: string; url: string | null; asOf: string }[];
 actions: { actionKey: string; title: string; dueOn: string; responsible: "member" | "advisor" }[];
}
export type FeedbackStatus = "viewed" | "acknowledged" | "doing" | "done" | "question";
export type ConsultationCommand =
 | { kind: "grant"; advisorId: string; clientLabel: string }
 | { kind: "revoke"; relationshipId: string }
 | { kind: "save"; relationshipId: string; sessionKey: string; baseVersion: number; body: RecommendationBody; privateNote: string | null }
 | { kind: "submit" | "approve" | "publish" | "withdraw"; relationshipId: string; sessionId: string; contentHash: string; note: string | null }
 | { kind: "feedback"; relationshipId: string; sessionId: string; actionKey: string | null; baseVersion: number; status: FeedbackStatus; text: string | null };
export interface ConsultationRequest { contractVersion: "consultation-request.v1"; expectedActorId: string; clientToken: string; command: ConsultationCommand }
export interface ConsultationReceipt { contractVersion: "consultation-write.v1"; actorId: string; clientToken: string; command: ConsultationCommand; id: string; version: number; reused: boolean; canonicalContentHash: string }
export interface Relationship { id: string; clientId: string; advisorId: string; clientLabel: string; createdAt: string; revoked: boolean }
export interface ConsultationSession { id: string; relationshipId: string; sessionKey: string; version: number; createdAt: string; actorId: string; contentHash: string; body: RecommendationBody; approval: { actorId: string; createdAt: string } | null; state: "draft" | "submitted" | "approved" | "published" | "withdrawn" }
export interface ConsultationEvent { id: string; sessionId: string; kind: "submit" | "approve" | "publish" | "withdraw"; actorId: string; createdAt: string; note: string | null }
export interface ConsultationAction { id: string; sessionId: string; actionKey: string | null; version: number; status: FeedbackStatus; text: string | null; actorId: string; createdAt: string }
export interface ConsultationDossier {
 basis: FinancialBasis;
 holdings: null | { id: string; version: number; positions: { key: string; title: string; quantity: string | null; unit: string; ownershipPercent: string; declaredValueToman: number | null; source: string | null; asOf: string | null }[]; debts: { key: string; title: string; balanceToman: number; balanceAsOf: string; nextInstallmentToman: number | null; nextDueOn: string | null }[] };
 cashFlow: null | { id: string; version: number; payload: CashFlowPayload };
 goals: null | { id: string; version: number; payload: GoalsPayload };
}
export interface ConsultationRead {
 contractVersion: "consultation-read.v1";
 actor: { id: string; isAdvisor: boolean; isOwner: boolean };
 advisors: { id: string; displayName: string; isOwner: boolean }[];
 relationships: Relationship[]; selected: Relationship | null; dossier: ConsultationDossier | null;
 sessions: ConsultationSession[]; notes: { sessionId: string; note: string | null }[]; events: ConsultationEvent[]; actions: ConsultationAction[];
}
const id = (v: unknown): string => { if (!uuid(v)) throw Error("شناسه معتبر نیست."); return v.toLowerCase(); };
const nullableId = (v: unknown) => v === null ? null : id(v);
const nullableText = (v: unknown, max: number) => v === null ? null : text(v, max);
const version = (v: unknown, zero = false): number => { if (typeof v !== "number" || !Number.isInteger(v) || v < (zero ? 0 : 1) || v > (zero ? 2_147_483_646 : 2_147_483_647)) throw Error("نسخه معتبر نیست."); return v; };
const hash = (v: unknown): string => { if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) throw Error("اثر انگشت معتبر نیست."); return v; };
const list = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw Error("تعداد رکوردها معتبر نیست."); return v; };
const unique = (values: string[]) => { if (new Set(values).size !== values.length) throw Error("شناسه تکراری است."); };
function evidenceUrl(v: unknown): string | null {
 if (v === null) return null;
 const value = text(v, 1000);
 if (!/^https?:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z]([a-z0-9-]*[a-z0-9])?(\/.*)?$/i.test(value) || /[\\\x00-\x20\x7f-\uffff]/.test(value) || /(^|\.)xn--/.test(value.toLowerCase().split("://")[1].split("/")[0])) throw Error("نشانی HTTP منبع بدون نام کاربری و رمز لازم است.");
 return value;
}
export function validateFinancialBasis(value: unknown): FinancialBasis {
 const b = object(value, ["holdingsVersionId", "cashFlowPeriod", "cashFlowVersionId", "goalsVersionId"]);
 return { holdingsVersionId: nullableId(b.holdingsVersionId), cashFlowPeriod: validateCashFlowPeriod(b.cashFlowPeriod), cashFlowVersionId: nullableId(b.cashFlowVersionId), goalsVersionId: nullableId(b.goalsVersionId) };
}
export function validateRecommendationBody(value: unknown): RecommendationBody {
 const b = object(value, ["topic", "goal", "clientSummary", "rationale", "limitations", "reviewOn", "basis", "researchVersionIds", "evidence", "actions"]);
 const researchVersionIds = list(b.researchVersionIds, 10).map(id); unique(researchVersionIds);
 const evidence = list(b.evidence, 20).map(v => { const e = object(v, ["label", "url", "asOf"]); return { label: text(e.label, 300), url: evidenceUrl(e.url), asOf: day(e.asOf) }; });
 if (!evidence.length) throw Error("حداقل یک شاهد منبع‌دار لازم است.");
 const actions = list(b.actions, 20).map(v => { const a = object(v, ["actionKey", "title", "dueOn", "responsible"]); if (a.responsible !== "member" && a.responsible !== "advisor") throw Error("مسئول اقدام معتبر نیست."); return { actionKey: id(a.actionKey), title: text(a.title, 1000), dueOn: day(a.dueOn), responsible: a.responsible as "member" | "advisor" }; });
 unique(actions.map(a => a.actionKey));
 return { topic: text(b.topic, 300), goal: text(b.goal, 2000), clientSummary: text(b.clientSummary, 10000), rationale: text(b.rationale, 6000), limitations: text(b.limitations, 4000), reviewOn: day(b.reviewOn), basis: validateFinancialBasis(b.basis), researchVersionIds, evidence, actions };
}
export function validateConsultationRequest(value: unknown): ConsultationRequest {
 const r = object(value, ["contractVersion", "expectedActorId", "clientToken", "command"]);
 if (r.contractVersion !== "consultation-request.v1") throw Error("قرارداد درخواست معتبر نیست.");
 const c = r.command as Record<string, unknown>; if (!c || typeof c !== "object") throw Error("کنش معتبر نیست.");
 let command: ConsultationCommand;
 if (c.kind === "grant") { object(c,["kind","advisorId","clientLabel"]); command={kind:c.kind,advisorId:id(c.advisorId),clientLabel:text(c.clientLabel,120)}; }
 else if (c.kind === "revoke") { object(c,["kind","relationshipId"]); command={kind:c.kind,relationshipId:id(c.relationshipId)}; }
 else if (c.kind === "save") { object(c,["kind","relationshipId","sessionKey","baseVersion","body","privateNote"]); command={kind:c.kind,relationshipId:id(c.relationshipId),sessionKey:id(c.sessionKey),baseVersion:version(c.baseVersion,true),body:validateRecommendationBody(c.body),privateNote:nullableText(c.privateNote,10000)}; }
 else if (["submit","approve","publish","withdraw"].includes(String(c.kind))) { object(c,["kind","relationshipId","sessionId","contentHash","note"]); command={kind:c.kind as "submit"|"approve"|"publish"|"withdraw",relationshipId:id(c.relationshipId),sessionId:id(c.sessionId),contentHash:hash(c.contentHash),note:nullableText(c.note,2000)}; }
 else if (c.kind === "feedback") { object(c,["kind","relationshipId","sessionId","actionKey","baseVersion","status","text"]); if (!["viewed","acknowledged","doing","done","question"].includes(String(c.status))) throw Error("وضعیت معتبر نیست."); const message=nullableText(c.text,2000); if(["doing","done"].includes(String(c.status))&&c.actionKey===null)throw Error("اقدام مشخص لازم است."); if(c.status==="question"&&!message)throw Error("متن پرسش لازم است."); command={kind:c.kind,relationshipId:id(c.relationshipId),sessionId:id(c.sessionId),actionKey:nullableId(c.actionKey),baseVersion:version(c.baseVersion,true),status:c.status as FeedbackStatus,text:message}; }
 else throw Error("کنش معتبر نیست.");
 return {contractVersion:r.contractVersion,expectedActorId:id(r.expectedActorId),clientToken:text(r.clientToken,200),command};
}
const stable = (value: unknown): string => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
export function validateConsultationReceipt(value: unknown, request: ConsultationRequest): ConsultationReceipt {
 const r=object(value,["contractVersion","actorId","clientToken","command","id","version","reused","canonicalContentHash"]);
 if(r.contractVersion!=="consultation-write.v1"||r.actorId!==request.expectedActorId||r.clientToken!==request.clientToken||stable(r.command)!==stable(request.command)||typeof r.reused!=="boolean")throw Error("رسید ثبت معتبر نیست.");
 const n=version(r.version);if((request.command.kind==="save"||request.command.kind==="feedback")&&n!==request.command.baseVersion+1)throw Error("نسخه رسید معتبر نیست.");
 return {...r,id:id(r.id),version:n,canonicalContentHash:hash(r.canonicalContentHash)} as unknown as ConsultationReceipt;
}
const timestamp=(v:unknown):string=>{if(typeof v!=="string"||!/^\d{4}-\d\d-\d\dT/.test(v)||!Number.isFinite(Date.parse(v)))throw Error("زمان معتبر نیست.");return v;};
const bool=(v:unknown):boolean=>{if(typeof v!=="boolean")throw Error("وضعیت معتبر نیست.");return v;};
function relation(v:unknown):Relationship { const r=object(v,["id","clientId","advisorId","clientLabel","createdAt","revoked"]);return {id:id(r.id),clientId:id(r.clientId),advisorId:id(r.advisorId),clientLabel:text(r.clientLabel,120),createdAt:timestamp(r.createdAt),revoked:bool(r.revoked)}; }
export function validateConsultationRead(value: unknown, expected: {relationshipId?:string;actorId?:string;period?:{startOn:string;endOn:string}}={}): ConsultationRead {
 const r=object(value,["contractVersion","actor","advisors","relationships","selected","dossier","sessions","notes","events","actions"]);
 if(r.contractVersion!=="consultation-read.v1")throw Error("قرارداد خواندن معتبر نیست.");
 const a=object(r.actor,["id","isAdvisor","isOwner"]);const actor={id:id(a.id),isAdvisor:bool(a.isAdvisor),isOwner:bool(a.isOwner)};
 if(expected.actorId&&actor.id!==expected.actorId||actor.isOwner&&!actor.isAdvisor)throw Error("هویت تغییر کرده است.");
 const relationships=list(r.relationships,100).map(relation);unique(relationships.map(x=>x.id));
 if(relationships.some(x=>x.clientId!==actor.id&&x.advisorId!==actor.id||x.advisorId===actor.id&&x.revoked))throw Error("رابطه نامعتبر است.");
 const selected=r.selected===null?null:relation(r.selected);
 if(expected.relationshipId&&selected?.id!==expected.relationshipId||selected&&!relationships.some(x=>stable(x)===stable(selected)))throw Error("رابطه انتخابی معتبر نیست.");
 const advisor=!!selected&&selected.advisorId===actor.id;
 const advisors=list(r.advisors,50).map(v=>{const x=object(v,["id","displayName","isOwner"]);return{id:id(x.id),displayName:text(x.displayName,120),isOwner:bool(x.isOwner)};});
 const sessions=list(r.sessions,100).map(v=>{const x=object(v,["id","relationshipId","sessionKey","version","createdAt","actorId","contentHash","body","approval","state"]);if(!["draft","submitted","approved","published","withdrawn"].includes(String(x.state))||x.relationshipId!==selected?.id||!advisor&&!['published','withdrawn'].includes(String(x.state)))throw Error("نسخه قابل مشاهده نیست.");return{id:id(x.id),relationshipId:id(x.relationshipId),sessionKey:id(x.sessionKey),version:version(x.version),createdAt:timestamp(x.createdAt),actorId:id(x.actorId),contentHash:hash(x.contentHash),body:validateRecommendationBody(x.body),approval:x.approval===null?null:(()=>{const a=object(x.approval,["actorId","createdAt"]);return{actorId:id(a.actorId),createdAt:timestamp(a.createdAt)};})(),state:x.state as ConsultationSession['state']};});unique(sessions.map(x=>x.id));
 const sessionIds=new Set(sessions.map(x=>x.id));
 const notes=list(r.notes,100).map(v=>{const x=object(v,["sessionId","note"]);if(!advisor||!sessionIds.has(id(x.sessionId)))throw Error("یادداشت خصوصی قابل مشاهده نیست.");return{sessionId:id(x.sessionId),note:nullableText(x.note,10000)};});
 const events=list(r.events,400).map(v=>{const x=object(v,["id","sessionId","kind","actorId","createdAt","note"]);if(!sessionIds.has(id(x.sessionId))||!["submit","approve","publish","withdraw"].includes(String(x.kind))||!advisor&&x.kind!=="publish"&&x.kind!=="withdraw")throw Error("رویداد معتبر نیست.");return{id:id(x.id),sessionId:id(x.sessionId),kind:x.kind as ConsultationEvent['kind'],actorId:id(x.actorId),createdAt:timestamp(x.createdAt),note:nullableText(x.note,2000)};});
 const actions=list(r.actions,500).map(v=>{const x=object(v,["id","sessionId","actionKey","version","status","text","actorId","createdAt"]);if(!sessionIds.has(id(x.sessionId))||!["viewed","acknowledged","doing","done","question"].includes(String(x.status)))throw Error("پیگیری معتبر نیست.");return{id:id(x.id),sessionId:id(x.sessionId),actionKey:nullableId(x.actionKey),version:version(x.version),status:x.status as FeedbackStatus,text:nullableText(x.text,2000),actorId:id(x.actorId),createdAt:timestamp(x.createdAt)};});
 let dossier:ConsultationDossier|null=null;
 if(r.dossier!==null){if(!selected)throw Error("پرونده بدون رابطه");const d=object(r.dossier,["basis","holdings","cashFlow","goals"]);const basis=validateFinancialBasis(d.basis);if(expected.period&&stable(basis.cashFlowPeriod)!==stable(expected.period))throw Error("دوره تغییر کرده است.");
  const money=(v:unknown,nullable=false):number|null=>{if(nullable&&v===null)return null;if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0)throw Error("مبلغ معتبر نیست.");return v;};
  let holdings:ConsultationDossier['holdings']=null;
  if(d.holdings!==null){const h=object(d.holdings,["id","version","positions","debts"]);const positions=list(h.positions,500).map(v=>{const p=object(v,["key","title","quantity","unit","ownershipPercent","declaredValueToman","source","asOf"]);return{key:text(p.key,200),title:text(p.title,300),quantity:nullableText(p.quantity,100),unit:text(p.unit,100),ownershipPercent:text(p.ownershipPercent,100),declaredValueToman:money(p.declaredValueToman,true),source:nullableText(p.source,1000),asOf:p.asOf===null?null:day(p.asOf)};});const debts=list(h.debts,500).map(v=>{const p=object(v,["key","title","balanceToman","balanceAsOf","nextInstallmentToman","nextDueOn"]);return{key:text(p.key,200),title:text(p.title,300),balanceToman:money(p.balanceToman)!,balanceAsOf:day(p.balanceAsOf),nextInstallmentToman:money(p.nextInstallmentToman,true),nextDueOn:p.nextDueOn===null?null:day(p.nextDueOn)};});holdings={id:id(h.id),version:version(h.version),positions,debts};}
  let cashFlow:ConsultationDossier['cashFlow']=null,goals:ConsultationDossier['goals']=null;
  if(d.cashFlow!==null){const c=object(d.cashFlow,["id","version","payload"]);cashFlow={id:id(c.id),version:version(c.version),payload:validateCashFlowPayload(c.payload)};if(stable(cashFlow.payload.period)!==stable(basis.cashFlowPeriod))throw Error("دوره پرونده معتبر نیست.");}
  if(d.goals!==null){const g=object(d.goals,["id","version","payload"]);goals={id:id(g.id),version:version(g.version),payload:validateGoalsPayload(g.payload)};}
  if((holdings?.id??null)!==basis.holdingsVersionId||(cashFlow?.id??null)!==basis.cashFlowVersionId||(goals?.id??null)!==basis.goalsVersionId)throw Error("نسخه مبنای پرونده معتبر نیست.");dossier={basis,holdings,cashFlow,goals};
 }
 if(!!selected!==!!dossier||!selected&&(sessions.length||notes.length||events.length||actions.length))throw Error("پرونده ناقص است.");
 unique(advisors.map(x=>x.id));if(advisors.filter(x=>x.isOwner).length>1||advisors.some(x=>!x.isOwner))throw Error("فهرست مشاور معتبر نیست.");
 const keys=new Set<string>();
 for(const session of sessions){
  const key=session.sessionKey+":"+session.version;if(keys.has(key)||session.actorId!==selected?.advisorId)throw Error("تاریخچه نسخه معتبر نیست.");keys.add(key);
  if(session.approval&&(session.approval.actorId!==selected?.advisorId||Date.parse(session.approval.createdAt)<Date.parse(session.createdAt)))throw Error("تأیید نسخه معتبر نیست.");
  if(["approved","published"].includes(session.state)&&!session.approval)throw Error("تأیید نسخه موجود نیست.");
  for(const other of sessions)if(other.sessionKey===session.sessionKey&&other.version<session.version&&Date.parse(other.createdAt)>Date.parse(session.createdAt))throw Error("ترتیب نسخه معتبر نیست.");
 }
 unique(events.map(x=>x.id));unique(notes.map(x=>x.sessionId));unique(actions.map(x=>x.id));
 const eventKeys=new Set<string>();
 for(const event of events){const session=sessions.find(x=>x.id===event.sessionId)!;const key=event.sessionId+":"+event.kind;if(eventKeys.has(key)||event.actorId!==selected?.advisorId||Date.parse(event.createdAt)<Date.parse(session.createdAt)||!advisor&&event.note!==null)throw Error("رویداد پرونده معتبر نیست.");eventKeys.add(key);}
 const feedbackKeys=new Set<string>();
 for(const action of actions){
  const session=sessions.find(x=>x.id===action.sessionId)!;const definition=session.body.actions.find(x=>x.actionKey===action.actionKey);const key=action.sessionId+":"+action.actionKey+":"+action.version;
  if(feedbackKeys.has(key)||action.actionKey!==null&&!definition||![selected?.advisorId,selected?.clientId].includes(action.actorId)||Date.parse(action.createdAt)<Date.parse(session.createdAt))throw Error("پیگیری معتبر نیست.");feedbackKeys.add(key);
  if(["doing","done"].includes(action.status)){if(!definition||action.actorId!==(definition.responsible==="member"?selected?.clientId:selected?.advisorId))throw Error("مسئول پیگیری معتبر نیست.");}else if(action.actorId!==selected?.clientId)throw Error("بازخورد عضو معتبر نیست.");
  if(action.status==="question"&&!action.text)throw Error("پرسش بدون متن معتبر نیست.");
 }
 return {contractVersion:'consultation-read.v1',actor,advisors,relationships,selected,dossier,sessions,notes,events,actions};
}
