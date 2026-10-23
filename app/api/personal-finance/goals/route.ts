import { createClient } from "@/lib/supabase/server";
import { goalsDb, getGoals, postGoals } from "@/lib/portfolio/goalsServer";

export const dynamic = "force-dynamic";
const connect = async () => goalsDb(await createClient());
export async function GET(request: Request) { return getGoals(request, connect); }
export async function POST(request: Request) { return postGoals(request, connect); }
