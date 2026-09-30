import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadConsultation } from "@/lib/consultation/service";
import { postConsultation } from "@/lib/consultation/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const data = await loadConsultation(new URL(req.url).searchParams.get("relation") ?? undefined);
    return data ? NextResponse.json(data) : NextResponse.json({error:"برای دیدن پرونده وارد شوید."},{status:401});
  } catch { return NextResponse.json({error:"پرونده در دسترس نیست؛ دوباره تلاش کنید."},{status:503}); }
}
export async function POST(req: Request) {
  return postConsultation(req, async () => {
    const db = await createClient();
    return {
      async authenticate() {
        const { data: { user }, error } = await db.auth.getUser();
        return { user, error: !!error };
      },
      async rpc(name, args) { return db.rpc(name, args); },
    };
  });
}
