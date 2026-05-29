import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact · CommonGround",
  description: "Get in touch with the maker of CommonGround.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-10">
        Common<span className="text-terracotta">·</span>Ground
      </Link>

      <div className="w-full max-w-xl flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-widest text-terracotta">
            Contact
          </span>
          <h1 className="font-serif text-3xl md:text-4xl">Get in touch</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Feedback, a bug, a question, or just a hello — send it over and
            it'll land in my inbox.
          </p>
        </header>

        <ContactForm />

        <div className="border-t border-border pt-6 text-sm">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Home
          </Link>
        </div>
      </div>
    </div>
  );
}
