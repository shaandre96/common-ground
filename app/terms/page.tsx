import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · CommonGround",
  description: "The rules for using CommonGround.",
};

const LAST_UPDATED = "May 29, 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-xl">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-10">
        Common<span className="text-terracotta">·</span>Ground
      </Link>

      <div className="w-full max-w-2xl flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-widest text-terracotta">
            Terms
          </span>
          <h1 className="font-serif text-3xl md:text-4xl">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {LAST_UPDATED}
          </p>
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          By using CommonGround you agree to these terms. They're meant to be
          plain and short.
        </p>

        <Section title="What CommonGround is">
          <p>
            CommonGround pairs you with another participant who sees a chosen
            statement differently, gives you a structured, time-boxed
            conversation about it, and shows whether either of you moved. It is
            not a social network and there is no public feed.
          </p>
        </Section>

        <Section title="Eligibility">
          <p>
            You must be at least 16 years old to use CommonGround. By using it,
            you confirm that you are.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You sign in with a one-time link sent to your email. You're
            responsible for keeping access to that inbox secure, and for the
            activity that happens under your account.
          </p>
        </Section>

        <Section title="How to behave">
          <p>You agree not to use CommonGround to:</p>
          <ul className="flex flex-col gap-1.5 list-disc pl-5">
            <li>
              harass, threaten, demean, or incite violence against another
              person;
            </li>
            <li>
              post hateful, illegal, or sexually explicit content, or content
              that isn't yours to share;
            </li>
            <li>impersonate someone else or misrepresent who you are;</li>
            <li>spam, advertise, or scrape the service; or</li>
            <li>
              attempt to break, overload, or circumvent the service's security
              or rate limits.
            </li>
          </ul>
          <p>
            The goal is good-faith disagreement. Engage with the person, not the
            caricature.
          </p>
        </Section>

        <Section title="AI partners">
          <p>
            Some conversation partners are AI bots rather than people. By using
            CommonGround you acknowledge that you may be matched with one, and
            that its replies are machine-generated and may be wrong.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            You keep ownership of the messages and reflections you write. You
            grant CommonGround the limited permission needed to store them and
            display your messages to the one other participant in your
            conversation. Sent messages are immutable — they can't be edited or
            withdrawn from the other person, though deleting your account
            removes them.
          </p>
        </Section>

        <Section title="Availability">
          <p>
            CommonGround is provided "as is" and "as available". It's an
            evolving independent project; features may change, break, or
            disappear, and we don't guarantee uptime.
          </p>
        </Section>

        <Section title="Ending things">
          <p>
            You can delete your account at any time from your{" "}
            <Link
              href="/profile"
              className="text-foreground underline hover:opacity-80"
            >
              profile
            </Link>
            . We may suspend or remove access for anyone who breaks these terms
            or puts others at risk.
          </p>
        </Section>

        <Section title="Disclaimers and liability">
          <p>
            Conversations happen with strangers; use your judgment and don't
            share sensitive personal information. To the fullest extent allowed
            by law, CommonGround is not liable for the content of conversations
            or for any indirect or consequential damages arising from your use
            of the service.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update these terms; the "last updated" date above will
            reflect any change. Continuing to use CommonGround after a change
            means you accept the updated terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms? Use the{" "}
            <Link
              href="/contact"
              className="text-foreground underline hover:opacity-80"
            >
              contact form
            </Link>
            .
          </p>
        </Section>

        <div className="flex items-center justify-between border-t border-border pt-6 text-sm">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Home
          </Link>
          <Link
            href="/privacy"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy Policy →
          </Link>
        </div>
      </div>
    </div>
  );
}
