import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-5 py-14">{children}</main>
      <Footer />
    </>
  );
}
