import { createClient } from "@/lib/supabase/server";
import { getRoster, rosterDb } from "@/lib/consultation/rosterServer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return getRoster(request, async () => rosterDb(await createClient())); }
