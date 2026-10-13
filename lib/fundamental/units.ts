/** No implicit unit or conversion for stored reports. */
export function isMillionRialUnit(unit: unknown): boolean {
  return typeof unit === "string" && unit.replace(/\s+/g, " ").trim() === "میلیون ریال";
}
