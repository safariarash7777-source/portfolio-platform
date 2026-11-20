import { type LucideIcon } from "lucide-react";

export default function PageTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="arash-workspace-heading">
      <Icon size={28} aria-hidden="true" />
      <h1 className="font-display font-bold">{title}</h1>
    </div>
  );
}
