import { createClient } from "@/lib/supabase/server";
import { getTicketStorage, postTicketStorage, ticketStorageDb } from "@/lib/consultation/ticketStorageServer";
export const dynamic = "force-dynamic";
const connect = async () => ticketStorageDb(await createClient());
export async function GET(request: Request) { return getTicketStorage(request, connect); }
export async function POST(request: Request) { return postTicketStorage(request, connect); }
