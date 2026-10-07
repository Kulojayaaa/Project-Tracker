import { createClient } from "@supabase/supabase-js";

const supabaseDefaultUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseApiUrl = import.meta.env.VITE_SUPABASE_API_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabaseUrl = supabaseApiUrl || supabaseDefaultUrl;

export const supabaseConfigError = !supabaseUrl || !supabasePublishableKey
  ? "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy."
  : null;

const clientUrl = supabaseUrl || "https://missing-supabase-url.supabase.co";
const clientKey = supabasePublishableKey || "missing-supabase-publishable-key";

export const configuredSupabaseUrl = supabaseUrl ?? "";
export const usingSupabaseCoDomain = supabaseUrl ? new URL(supabaseUrl).hostname.endsWith(".supabase.co") : false;

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
