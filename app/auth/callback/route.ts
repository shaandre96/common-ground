import { NextResponse } from "next/server";
import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await track("signed_in");
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to sign-in with error
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
