import type { ReactNode } from "react";
import { approvedCodalUrl } from "@/lib/desk/workspace-model";

/** One presentation/security contract; the caller owns its metadata and fallback. */
export default function CodalSourceLink({ url, children, fallback, className }: {
  url: unknown;
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
}) {
  const href = approvedCodalUrl(url);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <>{fallback}</>;
}
