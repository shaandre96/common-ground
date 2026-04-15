"use client"

const topics = [
  "Climate Policy",
  "Universal Basic Income",
  "AI & Jobs",
  "Free Speech",
  "Urban Planning",
  "Immigration",
  "Veganism",
  "Space Exploration",
  "Drug Policy",
  "Education Reform",
  "Healthcare Systems",
  "Nuclear Energy",
  "Remote Work",
  "Cryptocurrency",
  "Genetic Engineering",
]

export function TopicExplorer() {
  return (
    <section id="topics" className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-2xl md:text-3xl mb-10 text-balance">
          What&apos;s being discussed right now
        </h2>

        <div className="flex flex-wrap gap-3">
          {topics.map((topic) => (
            <button
              key={topic}
              className="text-sm border border-border px-4 py-2 rounded-sm hover:bg-sand-dark transition-colors"
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
