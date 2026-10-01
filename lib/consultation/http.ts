import { consultationCommand, consultationFailure } from "./contracts";

/** The production POST handler also used by the HTTP/real-DB acceptance tests. */
export interface ConsultationGateway {
  authenticate(): Promise<{ user: { id: string } | null; error: boolean }>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }>;
}
export async function postConsultation(req: Request, connect: () => Promise<ConsultationGateway>): Promise<Response> {
  try {
    const db = await connect();
    const { user, error } = await db.authenticate();
    if (error) return Response.json({ error: "بررسی نشست انجام نشد." }, { status: 503 });
    if (!user) return Response.json({ error: "برای ثبت وارد شوید." }, { status: 401 });
    if (Number(req.headers.get("content-length")) > 100000) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413 });
    let command: ReturnType<typeof consultationCommand>;
    try { command = consultationCommand(await req.json()); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "درخواست نامعتبر است." }, { status: 400 }); }
    const result = await db.rpc(command.rpc, command.args);
    if (result.error) {
      const failure = consultationFailure(result.error);
      return Response.json({ error: failure.error }, { status: failure.status });
    }
    return Response.json({ id: result.data }, { status: 201 });
  } catch { return Response.json({ error: "ذخیره انجام نشد. متن شما را نگه دارید و دوباره تلاش کنید." }, { status: 503 }); }
}
