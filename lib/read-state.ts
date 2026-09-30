/** A failed read never supplies an empty record or a zero. Public errors contain no service text. */
export type ReadState<T> =
  | { status: "ready"; data: T }
  | { status: "empty"; data: null }
  | { status: "error"; data: null; code: string };

export function readState<T>(result: { data: T | null; error: unknown }, code: string): ReadState<T> {
  if (result.error) return { status: "error", data: null, code };
  if (result.data === null || (Array.isArray(result.data) && result.data.length === 0)) {
    return { status: "empty", data: null };
  }
  return { status: "ready", data: result.data };
}

export async function safeRead<T extends PromiseLike<{ data: unknown; error: unknown }>>(query: T): Promise<Awaited<T>> {
  try { const result = await query; return (result.error ? { ...result, data: null } : result) as Awaited<T>; } catch { return { data: null, error: true } as Awaited<T>; }
}

export type SectionStates = Record<string, { status: ReadState<unknown>["status"]; code?: string }>;

export async function safeReads<const T extends readonly PromiseLike<{ data: unknown; error: unknown }>[]>(queries: T): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  return await Promise.all(queries.map(query => safeRead(query))) as { [K in keyof T]: Awaited<T[K]> };
}
