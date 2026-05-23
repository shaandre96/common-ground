import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Nav } from "@/components/nav";
import { Stats } from "@/components/stats";
import { TopicExplorer } from "@/components/topic-explorer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <HowItWorks />
      <TopicExplorer />
      <Stats />
      <Footer />
    </main>
  );
}
