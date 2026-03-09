import { getSupabaseClient } from "./supabaseClient";

const STORAGE_TABLE = "app_kv";

function throwIfError(error, action) {
  if (error) {
    throw new Error(`Storage ${action} failed: ${error.message}`);
  }
}

export async function idbGet(key) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(STORAGE_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();

  throwIfError(error, `read for key "${key}"`);
  return data?.value ?? null;
}

export async function idbSet(key, value) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(STORAGE_TABLE).upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  throwIfError(error, `write for key "${key}"`);
}

export async function idbDelete(key) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(STORAGE_TABLE).delete().eq("key", key);
  throwIfError(error, `delete for key "${key}"`);
}

export async function idbClear() {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(STORAGE_TABLE)
    .delete()
    .gte("key", "");
  throwIfError(error, "clear");
}
