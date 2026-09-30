import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadConsultation } from "@/lib/consultation/service";
import { consultationCommand, consultationFailure } from "@/lib/consultation/contracts";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const data = await loadConsultation(new URL(req.url).searchParams.get("relation") ?? undefined);
    return data ? NextResponse.json(data) : NextResponse.json({error:"برای دیدن پرونده وارد شوید."},{status:401});
  } catch { return NextResponse.json({error:"پرونده در دسترس نیست؛ دوباره تلاش کنید."},{status:503}); }
}
export async function POST(req: Request) {
  try {
    const db = await createClient();
    const { data:{user}, error } = await db.auth.getUser();
    if (error) return NextResponse.json({error:"بررسی نشست انجام نشد."},{status:503});
    if (!user) return NextResponse.json({error:"برای ثبت وارد شوید."},{status:401});
    if (Number(req.headers.get("content-length")) > 100000) return NextResponse.json({error:"درخواست بیش از حد بزرگ است."},{status:413});
    let command: ReturnType<typeof consultationCommand>;
    try { command=consultationCommand(await req.json()); }
    catch (error) { return NextResponse.json({error:error instanceof Error ? error.message : "درخواست نامعتبر است."},{status:400}); }
    const result = await db.rpc(command.rpc,command.args);
    if (result.error) { const failure=consultationFailure(result.error);return NextResponse.json({error:failure.error},{status:failure.status}); }
    return NextResponse.json({id:result.data},{status:201});
  } catch { return NextResponse.json({error:"ذخیره انجام نشد. متن شما را نگه دارید و دوباره تلاش کنید."},{status:503}); }
}
