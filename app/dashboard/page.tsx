import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "داشبورد",
  description: "داشبورد کاربری برای ارزیابی ریسک و مدیریت سبد سرمایه‌گذاری.",
};

export default function DashboardPage() {
  // NOTE: Supabase auth wiring is preserved at the API level (untouched).
  //       This page renders the light-theme client and passes a placeholder user.
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <DashboardClient userName="سرمایه‌گذار" />
      </main>
      <Footer />
    </>
  );
}
