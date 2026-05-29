"use server";

import { track } from "@/lib/analytics";

const CONTACT_TO = process.env.CONTACT_TO_EMAIL ?? "shaandre96@gmail.com";
// Defaults to Resend's shared sender, which can deliver to the account owner
// without a verified domain. Set CONTACT_FROM_EMAIL once a domain is verified.
const CONTACT_FROM =
  process.env.CONTACT_FROM_EMAIL ?? "CommonGround <onboarding@resend.dev>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Result = { ok: true } | { error: string };

export async function sendContactMessage(input: {
  name: string;
  email: string;
  message: string;
}): Promise<Result> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const message = input.message?.trim() ?? "";

  if (!name || name.length > 100) {
    return { error: "Please enter your name." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email so I can reply." };
  }
  if (!message || message.length > 5000) {
    return { error: "Please enter a message (up to 5000 characters)." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendContactMessage: RESEND_API_KEY is not set");
    return {
      error: "Contact is temporarily unavailable. Please try again later.",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: [CONTACT_TO],
        reply_to: email,
        subject: `New CommonGround contact from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      }),
    });
    if (!res.ok) {
      console.error(
        "sendContactMessage: Resend error",
        res.status,
        await res.text(),
      );
      return { error: "Could not send your message. Please try again later." };
    }
  } catch (err) {
    console.error("sendContactMessage threw:", err);
    return { error: "Could not send your message. Please try again later." };
  }

  await track("contact_submitted");
  return { ok: true };
}
