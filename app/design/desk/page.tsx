import { notFound } from "next/navigation";
import DeskStudio from "@/components/admin/DeskStudio";

export const dynamic = "force-dynamic";
export const metadata = { title: "پیش‌نمایش میز تحلیل آرش", robots: { index: false, follow: false } };

export default function DeskDesignPreview() {
  // Only synthetic data; never expose this design-review route on Production.
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  return <DeskStudio demo />;
}
