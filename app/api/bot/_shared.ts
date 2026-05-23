/**
 * Shared helpers for Supabase database webhook routes.
 *
 * Supabase fires webhooks with this body shape:
 *   {
 *     "type": "INSERT" | "UPDATE" | "DELETE",
 *     "table": "messages",
 *     "schema": "public",
 *     "record": { ... new row ... },
 *     "old_record": { ... } | null
 *   }
 *
 * Each route below checks the `BOT_WEBHOOK_SECRET` header if configured, then
 * dispatches to a handler in `lib/bot/handlers.ts`. All routes return 200 even
 * on internal errors so Supabase doesn't retry indefinitely — failures are
 * logged server-side.
 */

import { NextResponse } from "next/server";

export type WebhookBody<T = Record<string, unknown>> = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: T;
  old_record: T | null;
};

export function checkWebhookSecret(req: Request): NextResponse | null {
  const expected = process.env.BOT_WEBHOOK_SECRET;
  if (!expected) return null; // unset → allow (dev convenience)
  const header =
    req.headers.get("authorization") ??
    req.headers.get("x-webhook-secret") ??
    "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

export function logHandlerError(route: string, err: unknown) {
  console.error(`[${route}] handler error:`, err);
}
