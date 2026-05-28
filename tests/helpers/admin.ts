import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  throw new Error(
    "tests/helpers/admin.ts: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local",
  );
}

/**
 * Shared service-role Supabase client for test setup/teardown. Bypasses RLS,
 * so use it only from tests and never expose it to the app.
 */
export const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
