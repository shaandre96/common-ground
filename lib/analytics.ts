import { createClient } from "@/lib/supabase/server";

/**
 * Insert a product-analytics event into `public.events`.
 *
 * Server-side only. Fire-and-forget: failures are logged but never thrown,
 * so analytics outages never surface as user-facing errors. Call this from
 * server actions / route handlers at meaningful junctures — sign-in,
 * onboarding completion, match request, message send, etc.
 *
 * `user_id` is attached from the current session if present; pass null
 * properties for anonymous events (pre-signup).
 */
export async function track(
  name: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("events").insert({
      user_id: user?.id ?? null,
      name,
      properties,
    });
    if (error) {
      console.error(`track(${name}) insert error:`, error.message);
    }
  } catch (err) {
    console.error(`track(${name}) threw:`, err);
  }
}
