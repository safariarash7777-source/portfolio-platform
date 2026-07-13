import { createClient } from "@/lib/supabase/server";
import NotesManager from "@/components/admin/NotesManager";

export const metadata = {
  title: "یادداشت روزانهٔ بازار",
};

export default async function AdminNotesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("market_notes")
    .select("id, title, body_md, tags, published_at")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(50);

  return <NotesManager notes={data ?? []} />;
}
