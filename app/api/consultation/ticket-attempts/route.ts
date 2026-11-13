import { createClient } from "@/lib/supabase/server";
import { getTicketAttemptStorage, postTicketAttemptStorage, ticketAttemptDb } from "@/lib/consultation/ticketAttemptStorageServer";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return getTicketAttemptStorage(request, async () => ticketAttemptDb(await createClient())); }
export function POST(request: Request) { return postTicketAttemptStorage(request, async () => ticketAttemptDb(await createClient())); }
