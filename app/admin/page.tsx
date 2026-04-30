import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AdminDashboard from "./AdminDashboard";

export const metadata = {
  title: "پنل مدیریت",
  description: "پنل مدیریت پلتفرم آرش صفری.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  // NOTE: Supabase auth/role guard is preserved at the API level (untouched).
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <AdminDashboard />
      </main>
      <Footer />
    </>
  );
}
