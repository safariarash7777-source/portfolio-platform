import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "ایمیل الزامی است." }, { status: 400 });
  }

  const { error } = await supabase.from("waitlist").insert([{ email }]);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "این ایمیل قبلاً ثبت شده است." }, { status: 409 });
    }
    return NextResponse.json({ error: "خطا در ثبت اطلاعات." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
