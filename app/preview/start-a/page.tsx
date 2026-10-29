import React from "react";
import { notFound } from "next/navigation";
import StartAPreview from "@/components/consultation/StartAPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "نمونه نمایشی مالی و پیگیری", robots: { index: false, follow: false } };
export default function StartAPreviewPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <StartAPreview />;
}
