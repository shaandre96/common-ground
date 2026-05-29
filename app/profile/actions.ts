"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Record the intent before we erase the account. The events row survives
  // (its user_id is set null when the profile cascades away), so this stays
  // anonymous after deletion.
  await track("account_deleted");

  // Deleting the auth user requires the service key — this is the one app
  // path that uses it, kept strictly server-side. The FK cascade from
  // auth.users → profiles → everything-user-owned wipes all of their data.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: error.message };
  }

  await supabase.auth.signOut();
  redirect("/");
}
