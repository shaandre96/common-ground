"use client";

import { useState, useTransition } from "react";
import { sendContactMessage } from "./actions";

const inputClass =
  "border border-border bg-background px-4 py-3 rounded-sm text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-terracotta disabled:opacity-50";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendContactMessage({ name, email, message });
      if ("error" in result) {
        setError(result.error);
      } else {
        setSent(true);
        setName("");
        setEmail("");
        setMessage("");
      }
    });
  }

  if (sent) {
    return (
      <div className="border border-border rounded-sm p-6 flex flex-col gap-2">
        <span className="text-xs uppercase tracking-widest text-terracotta">
          Sent
        </span>
        <p className="text-sm leading-relaxed">
          Thanks — your message is on its way. I'll get back to you at the email
          you provided.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-name"
          className="text-xs uppercase tracking-widest text-muted-foreground"
        >
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={100}
          required
          disabled={pending}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-email"
          className="text-xs uppercase tracking-widest text-muted-foreground"
        >
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          maxLength={200}
          required
          disabled={pending}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-message"
          className="text-xs uppercase tracking-widest text-muted-foreground"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          maxLength={5000}
          rows={6}
          required
          disabled={pending}
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && <p className="text-sm text-terracotta">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="text-sm bg-foreground text-primary-foreground px-5 py-3 rounded-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
