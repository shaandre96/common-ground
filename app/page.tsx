import { Nav } from "@/components/nav"
import { Hero } from "@/components/hero"
import { HowItWorks } from "@/components/how-it-works"
import { TopicExplorer } from "@/components/topic-explorer"
import { Stats } from "@/components/stats"
import { Footer } from "@/components/footer"

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
  )
}
