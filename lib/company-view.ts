/** Presentation experiment only. A URL cannot activate it in Production. */
export type CompanyView = "decision" | "dossier";
export function companyPreviewView(value: unknown, environment: string | undefined, isFund: boolean): CompanyView | null {
  return environment === "preview" && !isFund && (value === "decision" || value === "dossier") ? value : null;
}
