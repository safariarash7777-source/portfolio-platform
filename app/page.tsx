import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import Features from "@/components/sections/Features";
import Quote from "@/components/sections/Quote";
import FAQ from "@/components/sections/FAQ";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Quote />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
