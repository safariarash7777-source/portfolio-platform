/** Candidate native-journal service. No route/schema activation in this module. */
import { parseWorkbookSaveIntent, isIntentId, canonicalWorkbook, hashIntentRequest } from './workbook-save-intent';
import { saveWorkbook, StoreError, type StoreResult, type WorkbookGateway } from './workbook-store';

export interface StoredWorkbookIntent {
  intentId: string; workbookId: string; baseVersion: number; targetVersion: number;
  requestBody: string; requestHash: string; title: string; createdBy: string; createdAt: string;
}
export interface WorkbookIntentStore {
  get(intentId: string): Promise<StoredWorkbookIntent | null>;
  recent(limit: number, offset: number): Promise<Omit<StoredWorkbookIntent, 'requestBody'>[]>;
  insert(row: { intentId: string; requestBody: string }): Promise<StoredWorkbookIntent>;
}
export interface WorkbookIntentGateway extends WorkbookGateway { createIntentStore(): WorkbookIntentStore }

async function actor(gateway: WorkbookGateway): Promise<string | StoreResult> {
  let user: { id: string } | null;
  try { user = await gateway.getUser(); } catch { return { status: 503, body: { error: 'بررسی نشست انجام نشد؛ درخواست محفوظ است.' } }; }
  if (!user) return { status: 401, body: { error: 'ورود لازم است.' } };
  try { if (await gateway.getRole(user.id) !== 'admin') return { status: 403, body: { error: 'دسترسی مجاز نیست.' } }; }
  catch { return { status: 503, body: { error: 'بررسی نقش انجام نشد؛ درخواست محفوظ است.' } }; }
  return user.id;
}
function unavailable(): StoreResult { return { status: 503, body: { error: 'مخزن بازیابی امن در دسترس نیست؛ نتیجهٔ درخواست تأیید نشد و متن را نگه دارید.', unavailable: true } }; }
function invalid(): StoreResult { return { status: 400, body: { error: 'درخواست ذخیره یا شناسهٔ بازیابی معتبر نیست.' } }; }
function conflict(): StoreResult { return { status: 409, body: { error: 'شناسهٔ بازیابی با درخواست دیگری ثبت شده است؛ درخواست اصلی محفوظ است.' } }; }
async function verified(row: StoredWorkbookIntent, expectedActor: string) {
  if (row.createdBy !== expectedActor || !isIntentId(row.intentId) || !Number.isFinite(Date.parse(row.createdAt))) throw new Error('intent_identity_mismatch');
  const parsed = parseWorkbookSaveIntent(row.requestBody);
  if (parsed.workbookId.toLowerCase() !== row.workbookId.toLowerCase() || parsed.baseVersion !== row.baseVersion || parsed.targetVersion !== row.targetVersion ||
      await hashIntentRequest(row.requestBody) !== row.requestHash || parsed.workbook.title.trim() !== row.title) throw new Error('intent_content_mismatch');
  return parsed;
}
function receipt(row: Omit<StoredWorkbookIntent, 'requestBody'>) {
  return { intentId: row.intentId, workbookId: row.workbookId, baseVersion: row.baseVersion, targetVersion: row.targetVersion, requestHash: row.requestHash, preparedAt: row.createdAt, authorMatchesSession: true };
}

export async function prepareWorkbookSave(gateway: WorkbookIntentGateway, intentId: unknown, requestBody: unknown): Promise<StoreResult> {
  const identity = await actor(gateway); if (typeof identity !== 'string') return identity;
  if (!isIntentId(intentId)) return invalid();
  let parsed;
  try { parsed = parseWorkbookSaveIntent(requestBody); } catch { return invalid(); }
  if (parsed.workbook.privatePreparation && gateway.privatePreparationWritable !== true) return unavailable();
  try {
    const store = gateway.createIntentStore();
    const prior = await store.get(intentId);
    if (prior) {
      await verified(prior, identity);
      return prior.requestBody === requestBody ? { status: 200, body: { ...receipt(prior), reused: true } } : conflict();
    }
    let row;
    try { row = await store.insert({ intentId, requestBody: parsed.requestBody }); }
    catch (error) {
      if (!(error instanceof StoreError) || error.code !== 'conflict') throw error;
      row = await store.get(intentId);
      if (!row) throw error;
    }
    await verified(row, identity);
    return row.requestBody === requestBody ? { status: 201, body: receipt(row) } : conflict();
  } catch { return unavailable(); }
}

export async function readWorkbookSaveIntent(gateway: WorkbookIntentGateway, intentId: unknown): Promise<StoreResult> {
  const identity = await actor(gateway); if (typeof identity !== 'string') return identity;
  if (!isIntentId(intentId)) return invalid();
  try {
    const row = await gateway.createIntentStore().get(intentId);
    if (!row) return { status: 404, body: { error: 'درخواست بازیابی پیدا نشد.', intentId, absent: true } };
    await verified(row, identity);
    return { status: 200, body: { ...receipt(row), requestBody: row.requestBody } };
  } catch { return unavailable(); }
}

export async function listWorkbookSaveIntents(gateway: WorkbookIntentGateway, offset = 0): Promise<StoreResult> {
  const identity = await actor(gateway); if (typeof identity !== 'string') return identity;
  try {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) return invalid();
    const rows = await gateway.createIntentStore().recent(50, offset);
    // Verify the actor/content even with a faulty adapter. Never echo another
    // actor's draft or treat a storage failure as an empty list.
    for (const row of rows) if (row.createdBy !== identity || !isIntentId(row.intentId) || !isIntentId(row.workbookId) ||
      !Number.isInteger(row.baseVersion) || row.baseVersion < 0 || row.targetVersion !== row.baseVersion + 1 ||
      !/^[a-f0-9]{64}$/.test(row.requestHash) || !Number.isFinite(Date.parse(row.createdAt))) throw new Error('invalid_intent_metadata');
    return { status: 200, body: { items: rows.map(row => ({ ...receipt(row), title: row.title })), limit: 50, nextOffset: rows.length === 50 ? offset + 50 : null } };
  } catch { return unavailable(); }
}

export async function savePreparedWorkbook(gateway: WorkbookIntentGateway, intentId: unknown, requestBody: unknown): Promise<StoreResult> {
  const identity = await actor(gateway); if (typeof identity !== 'string') return identity;
  if (!isIntentId(intentId) || typeof requestBody !== 'string') return invalid();
  try {
    const row = await gateway.createIntentStore().get(intentId);
    if (!row) return { status: 409, body: { error: 'آماده‌سازی همان درخواست هنوز بازخوانی نشده است؛ ذخیره ارسال نشد.' } };
    const request = await verified(row, identity);
    if (request.requestBody !== requestBody) return conflict();
    const result = await saveWorkbook(gateway, JSON.parse(requestBody), identity);
    if (result.status !== 409) return result;
    // A retry that raced a completed v2 insert may recover only the exact native
    // author/body/target row; all other conflicts retain the original intent.
    const saved = (await gateway.createStore().versions(request.workbookId)).find(version => version.version === request.targetVersion);
    if (saved?.createdBy === identity && canonicalWorkbook(saved.body) === canonicalWorkbook(request.workbook)) {
      return { status: 200, body: { workbookId: saved.workbookId, version: saved.version, savedAt: saved.createdAt, reused: true } };
    }
    return result;
  } catch { return unavailable(); }
}
