import Link from "next/link";
import { ChatCard } from "./chat-card";

export function Hero() {
  return (
    <section className="pt-14 pb-16 md:pt-20 md:pb-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-[1fr,auto] gap-10 md:gap-14 items-start">
          {/* Left Column */}
          <div className="flex flex-col gap-5 pt-4">
            {/* Eyebrow */}
            <p className="text-xs uppercase tracking-widest text-terracotta font-medium">
              Real conversations. Real people.
            </p>

            {/* Headline */}
            <h1 className="font-serif text-4xl md:text-5xl lg:text-[3.5rem] leading-[1.15] text-balance">
              Find someone who <em className="italic">sees it differently</em>
            </h1>

            {/* Body */}
            <p className="text-muted-foreground leading-relaxed max-w-md text-[0.95rem]">
              CommonGround matches you with a stranger who holds a different
              view. No algorithms gaming your feed. Just two people, one topic,
              and an open mind.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link
                href="/sign-in"
                className="bg-foreground text-primary-foreground px-6 py-3 rounded-sm text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Start a conversation
              </Link>
              <a
                href="#how-it-works"
                className="text-sm text-foreground hover:text-muted-foreground transition-colors"
              >
                See how it works →
              </a>
            </div>
          </div>

          {/* Right Column - Chat Card */}
          <div className="flex justify-center md:justify-end md:-mt-2">
            <div className="md:rotate-1">
              <ChatCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
