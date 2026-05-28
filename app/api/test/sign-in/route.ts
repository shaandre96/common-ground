import { createClient } from "@/lib/supabase/server";

/**
 * Test-only password sign-in endpoint.
 *
 * Calls `supabase.auth.signInWithPassword` on the server, which lets
 * `@supabase/ssr` set the auth cookies on the response. The Playwright
 * test context then has a real authenticated session for protected routes.
 *
 * SAFETY: gated by both `NODE_ENV !== "production"` AND `ENABLE_TEST_AUTH=1`.
 * Even if accidentally deployed, the endpoint returns 404 unless the env flag
 * is explicitly set on the production runtime — which we never do.
 */

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }
  if (process.env.ENABLE_TEST_AUTH !== "1") {
    return new Response("Not Found", { status: 404 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return Response.json(
      { error: "email and password required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  if (error || !data.user) {
    return Response.json(
      { error: error?.message ?? "sign-in failed" },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, userId: data.user.id });
}
