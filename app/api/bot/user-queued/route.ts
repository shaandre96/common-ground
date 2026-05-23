import { NextResponse } from "next/server";
import {
  checkWebhookSecret,
  logHandlerError,
  type WebhookBody,
} from "@/app/api/bot/_shared";
import { handleUserQueued } from "@/lib/bot/handlers";

// 30s leaves headroom for: dispatch sleep (3.5-5.5s) + signin + upsert +
// RPC. Vercel Hobby allows up to 60s.
export const maxDuration = 30;

// Configure Supabase: `Database → Webhooks → New Hook`
//   Event: INSERT on public.match_queue
//   URL:   POST https://<your-vercel-app>/api/bot/user-queued
//   Header: Authorization: Bearer <BOT_WEBHOOK_SECRET>
export async function POST(req: Request) {
  const auth = checkWebhookSecret(req);
  if (auth) return auth;

  let body: WebhookBody<{
    user_id: string;
    proposition_id: string;
    stance: string | null;
  }>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  if (body.type !== "INSERT" || !body.record?.user_id) {
    return NextResponse.json({ ok: true, skipped: "not_insert" });
  }

  try {
    await handleUserQueued(body.record);
  } catch (err) {
    logHandlerError("user-queued", err);
  }

  return NextResponse.json({ ok: true });
}
