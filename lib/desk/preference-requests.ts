export interface PreferenceRequest {
  kind: "read" | "save";
  controller: AbortController;
}
/** Synchronous exclusion plus response identity; cancellation alone is insufficient. */
export class PreferenceRequests {
  private current: PreferenceRequest | null = null;
  begin(kind: PreferenceRequest["kind"]): PreferenceRequest | null {
    if (this.current?.kind === "save" || (kind === "save" && this.current))
      return null;
    this.current?.controller.abort();
    const request = { kind, controller: new AbortController() };
    this.current = request;
    return request;
  }
  accepts(request: PreferenceRequest): boolean {
    return this.current === request && !request.controller.signal.aborted;
  }
  finish(request: PreferenceRequest): boolean {
    if (this.current !== request) return false;
    this.current = null;
    return true;
  }
  cancel() {
    this.current?.controller.abort();
    this.current = null;
  }
}
