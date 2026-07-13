import { createClient } from "@/lib/supabase/server";
import ContentHubManager from "@/components/admin/ContentHubManager";

export const metadata = {
  title: "هابِ محتوا",
};

export default async function AdminContentPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("content_hub")
    .select("id, platform, kind, content_url, title, description, published_at, deleted_at")
    .order("published_at", { ascending: false })
    .limit(80);

  return <ContentHubManager items={data ?? []} />;
}
