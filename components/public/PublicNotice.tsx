import type { ReactNode } from "react";
export default function PublicNotice({ title, children, tone = "neutral", action }: { title: string; children: ReactNode; tone?: "neutral" | "error"; action?: ReactNode }) {
  return <div className={`public-notice public-notice-${tone}`} role={tone === "error" ? "alert" : undefined}><h3>{title}</h3><div>{children}</div>{action ? <div className="public-actions">{action}</div> : null}</div>;
}
