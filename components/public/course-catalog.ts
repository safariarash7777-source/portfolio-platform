import type { ReadState } from "@/lib/read-state";
export interface PublicCohort {
  id: string;
  title: string;
  startsAt: string | null;
  endsAtExclusive: string | null;
  timeZone: "Asia/Tehran";
  policyVersion: string | null;
  status: "published";
  registrationAction: { enabled: false; reason: "registration_not_enabled" };
}
export interface PublicCourse {
  id: string;
  title: string;
  summary: string | null;
  cohorts: PublicCohort[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const dateOrNull = (value: unknown) =>
  value === null ||
  (typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    /(Z|[+-]\d{2}:\d{2})$/.test(value));
function validCohort(value: unknown): value is PublicCohort {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.title !== "string" ||
    !value.title.trim()
  )
    return false;
  if (
    !dateOrNull(value.startsAt) ||
    !dateOrNull(value.endsAtExclusive) ||
    value.timeZone !== "Asia/Tehran" ||
    value.status !== "published"
  )
    return false;
  if (
    value.startsAt !== null &&
    value.endsAtExclusive !== null &&
    Date.parse(value.endsAtExclusive as string) <=
      Date.parse(value.startsAt as string)
  )
    return false;
  return (
    (value.policyVersion === null || typeof value.policyVersion === "string") &&
    record(value.registrationAction) &&
    value.registrationAction.enabled === false &&
    value.registrationAction.reason === "registration_not_enabled"
  );
}
function validCourse(value: unknown): value is PublicCourse {
  return (
    record(value) &&
    typeof value.id === "string" &&
    Boolean(value.id) &&
    typeof value.title === "string" &&
    Boolean(value.title.trim()) &&
    (value.summary === null || typeof value.summary === "string") &&
    Array.isArray(value.cohorts) &&
    value.cohorts.every(validCohort)
  );
}
export async function fetchPublicCourses(
  fetcher: typeof fetch = fetch,
): Promise<ReadState<PublicCourse[]>> {
  try {
    const response = await fetcher("/api/courses", { cache: "no-store" });
    if (!response.ok)
      return {
        status: "error",
        data: null,
        code: "course_catalog_unavailable",
      };
    const body: unknown = await response.json();
    if (
      !record(body) ||
      body.contractVersion !== "seasonal.v0.1" ||
      !Array.isArray(body.courses) ||
      !body.courses.every(validCourse)
    )
      return { status: "error", data: null, code: "course_catalog_invalid" };
    return body.courses.length
      ? { status: "ready", data: body.courses }
      : { status: "empty", data: null };
  } catch {
    return { status: "error", data: null, code: "course_catalog_unavailable" };
  }
}
