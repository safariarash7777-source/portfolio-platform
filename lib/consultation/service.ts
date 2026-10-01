import "server-only";
import { createClient } from "@/lib/supabase/server";
import { UUID, type ConsultationData, type Relationship, type Session, type Action, type ApprovedResearch } from "./contracts";
import { safeRead } from "@/lib/read-state";
export async function loadConsultation(relationshipId?: string): Promise<ConsultationData | null> {
  if (relationshipId && !UUID.test(relationshipId)) throw new Error("invalid relation");
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError) throw new Error("session unavailable");
  if (!user) return null;
  const [relations, advisors] = await Promise.all([
    db.from("consultation_relationships").select("id,client_id,advisor_id,client_label,created_at").order("created_at",{ascending:false}),
    db.from("consultation_advisors").select("user_id,display_name").eq("enabled",true),
  ]);
  if (relations.error || advisors.error) throw new Error("consultation unavailable");
  const relationships = (relations.data ?? []) as Relationship[];
  const selected = relationshipId ? relationships.find(r => r.id === relationshipId) ?? null : relationships[0] ?? null;
  if (relationshipId && !selected) throw new Error("relation inaccessible");
  const empty: ConsultationData = { userId:user.id,relationships,advisors:advisors.data ?? [],selected,revoked:false,sessions:[],notes:[],publications:[],actions:[],holdings:[],research:[],researchUnavailable:false };
  if (!selected) return empty;
  const [sessions, actions, revocations, publications, notes, holdings, research] = await Promise.all([
    db.from("consultation_sessions").select("*").eq("relationship_id",selected.id).order("occurs_at",{ascending:false}),
    db.from("consultation_actions").select("*").eq("relationship_id",selected.id).order("version",{ascending:false}),
    db.from("consultation_revocations").select("relationship_id").eq("relationship_id",selected.id),
    db.from("consultation_publications").select("session_id,published_at"),
    selected.advisor_id === user.id ? db.from("consultation_private_notes").select("session_id,note") : Promise.resolve({ data:[], error:null }),
    db.rpc("consultation_holding_versions",{p_relation:selected.id}),
    selected.advisor_id === user.id ? safeRead(db.rpc("consultation_approved_research_versions",{p_relation:selected.id})) : Promise.resolve({data:[],error:null}),
  ]);
  if ([sessions,actions,revocations,publications,notes,holdings].some(r => r.error)) throw new Error("consultation unavailable");
  const sessionRows = (sessions.data ?? []) as Session[];
  const sessionIds = new Set(sessionRows.map(s => s.id));
  return { ...empty,revoked:!!revocations.data?.length,sessions:sessionRows,actions:(actions.data ?? []) as Action[],holdings:holdings.data ?? [],
    research:(research.data ?? []) as ApprovedResearch[],researchUnavailable:!!research.error,
    notes:(notes.data ?? []).filter(n => sessionIds.has(n.session_id)), publications:(publications.data ?? []).filter(p => sessionIds.has(p.session_id)) };
}
