import { webinarPhase, type MemberResource, type Webinar } from "./home";

/** Presentation only: the server rechecks access when a link is requested. */
export function webinarCalendar(webinars: Webinar[], now: string) {
  const upcoming = webinars.filter(w => ["before", "during"].includes(webinarPhase(w, now)))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id));
  const ended = webinars.filter(w => webinarPhase(w, now) === "after")
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at) || a.id.localeCompare(b.id));
  const unknown = webinars.filter(w => webinarPhase(w, now) === "unknown");
  return { upcoming, ended, unknown };
}

function searchText(value: string) {
  return value.normalize("NFKC").replaceAll("ي", "ی").replaceAll("ك", "ک")
    .replace(/[\u064b-\u065f\u0670]/g, "").replace(/\u200c/g, " ").toLocaleLowerCase("fa-IR");
}

/** Filter only the server-authorized rows; a title never determines content kind. */
export function searchResources(resources: MemberResource[], query: string): MemberResource[] {
  const words = searchText(query).trim().split(/\s+/).filter(Boolean);
  return resources.filter(r => words.every(word => searchText(r.title).includes(word)));
}
