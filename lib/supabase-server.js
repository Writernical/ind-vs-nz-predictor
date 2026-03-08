import { createClient } from "@supabase/supabase-js";

// Server-side client — used in API routes for automated writes.
// Uses the same anon key but runs server-side.
// For extra security you can use a SUPABASE_SERVICE_ROLE_KEY instead.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getServerSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(supabaseUrl, supabaseKey);
}
