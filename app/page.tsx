import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import Stats from "@/components/sections/Stats";
import Features from "@/components/sections/Features";
import Pricing from "@/components/sections/Pricing";
import Quote from "@/components/sections/Quote";
import FAQ from "@/components/sections/FAQ";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Features />
        <Pricing />
        <Quote />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
