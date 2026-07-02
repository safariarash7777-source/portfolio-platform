import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import ThreeSteps from "@/components/landing/ThreeSteps";
import Capabilities from "@/components/landing/Capabilities";
import WhyArash from "@/components/landing/WhyArash";
import LandingFAQ from "@/components/landing/LandingFAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/layout/Footer";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <ThreeSteps />
        <Capabilities />
        <WhyArash />
        <LandingFAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
