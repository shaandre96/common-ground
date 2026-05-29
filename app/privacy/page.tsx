import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · CommonGround",
  description:
    "What CommonGround collects, how it's used, and how to delete it.",
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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-10">
        Common<span className="text-terracotta">·</span>Ground
      </Link>

      <div className="w-full max-w-2xl flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-widest text-terracotta">
            Privacy
          </span>
          <h1 className="font-serif text-3xl md:text-4xl">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {LAST_UPDATED}
          </p>
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          CommonGround is an independent project that matches you with a
          stranger to discuss one debatable statement. This page explains what
          we collect, why, and how you can remove it. We collect as little as
          the product needs to work.
        </p>

        <Section title="What we collect">
          <p>
            <span className="text-foreground">Account.</span> Your email
            address, used to sign you in (we send a one-time link — there is no
            password to store) and to contact you about your account.
          </p>
          <p>
            <span className="text-foreground">Profile.</span> A display name and
            the timestamp you joined.
          </p>
          <p>
            <span className="text-foreground">Activity.</span> The statements
            you choose to discuss and your stance on them, the messages you send
            in a conversation, your reactions, your per-round stance votes, and
            any optional private reflections you write.
          </p>
          <p>
            <span className="text-foreground">Technical.</span> A small number
            of anonymous, cookieless product-analytics events (for example
            "onboarding completed", "message sent") so we can understand whether
            the product works. These carry no message contents.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            To run the service: sign you in, match you with someone who holds a
            different view, deliver your conversation in realtime, and show you
            how your positions moved at the end. We do not sell your data or use
            it for advertising.
          </p>
        </Section>

        <Section title="AI conversation partners">
          <p>
            Some partners on CommonGround are AI bots rather than people. When
            you are matched with a bot, the messages in that conversation are
            sent to our model provider (Groq) to generate replies. Treat any
            conversation as you would with a stranger and avoid sharing
            sensitive personal information.
          </p>
        </Section>

        <Section title="Where it's stored and who can see it">
          <p>
            Data is stored in a Postgres database hosted by Supabase, protected
            by row-level security. In practice that means your messages are
            visible only to you and the one person in that conversation; your
            private reflections are visible only to you; and your stance history
            is your own. Profiles are not public — conversations are anonymous
            by design.
          </p>
        </Section>

        <Section title="Third-party services">
          <p>
            We rely on a few providers, each limited to its purpose:{" "}
            <span className="text-foreground">Supabase</span> (authentication,
            database, realtime), <span className="text-foreground">Resend</span>{" "}
            (sending sign-in and contact emails),{" "}
            <span className="text-foreground">Groq</span> (generating AI partner
            replies), and <span className="text-foreground">Vercel</span>{" "}
            (hosting and privacy-friendly, cookieless traffic analytics).
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use a single category of cookie: the secure, HttpOnly session
            cookie that keeps you signed in. Traffic analytics are cookieless,
            so there is no tracking cookie and no consent banner to dismiss.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>
            You can delete your account at any time from your{" "}
            <Link
              href="/profile"
              className="text-foreground underline hover:opacity-80"
            >
              profile
            </Link>
            . Deletion is immediate and irreversible: it removes your account
            and cascades to everything tied to it — your profile, propositions
            and stances, messages, reactions, votes, and reflections. Anonymous
            analytics events are retained but are no longer linked to you.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can access the data you've created through your profile and
            results pages, and you can erase all of it via account deletion. For
            anything else, reach out below.
          </p>
        </Section>

        <Section title="Children">
          <p>
            CommonGround is not intended for anyone under 16. Please don't use
            it if you are younger than that.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes, the "last updated" date above will change
            with it. Material changes will be reflected here before they take
            effect.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about your data? Use the{" "}
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
            href="/terms"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms of Service →
          </Link>
        </div>
      </div>
    </div>
  );
}
