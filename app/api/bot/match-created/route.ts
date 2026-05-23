import { NextResponse } from "next/server";
import {
  checkWebhookSecret,
  logHandlerError,
  type WebhookBody,
} from "@/app/api/bot/_shared";
import { handleMatchCreated } from "@/lib/bot/handlers";

// 30s leaves headroom for: signin (~300ms) + opener sleep (4-7s) + LLM
// (~1-3s) + insert. Vercel Hobby allows up to 60s.
export const maxDuration = 30;

// Configure Supabase: `Database → Webhooks → New Hook`
//   Event: INSERT on public.matches
//   URL:   POST https://<your-vercel-app>/api/bot/match-created
//   Header: Authorization: Bearer <BOT_WEBHOOK_SECRET>
export async function POST(req: Request) {
  const auth = checkWebhookSecret(req);
  if (auth) return auth;

  let body: WebhookBody<{ id: string }>;
  try {
    body = (await req.json()) as WebhookBody<{ id: string }>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  if (body.type !== "INSERT" || !body.record?.id) {
    return NextResponse.json({ ok: true, skipped: "not_insert" });
  }

  try {
    await handleMatchCreated(body.record.id);
  } catch (err) {
    logHandlerError("match-created", err);
  }

  return NextResponse.json({ ok: true });
}
