import Navbar from "@/components/layout/Navbar";

export default function Loading() {
  return <>
    <Navbar prefetch={false} />
    <main dir="rtl" aria-busy="true" className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="font-display text-3xl font-bold">میز بازار</h1>
      <p role="status" className="mt-3 text-sm text-muted-foreground">در حال دریافت اطلاعات…</p>
    </main>
  </>;
}
