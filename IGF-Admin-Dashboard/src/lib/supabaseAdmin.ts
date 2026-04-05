import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _instance: SupabaseClient | null = null;

function getInstance(): SupabaseClient {
  if (!_instance) {
    _instance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  return _instance;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    return (getInstance() as any)[prop as string];
  },
});
