import { supabase } from "./supabase"

export async function importMatches() {
  const { data, error } = await supabase.functions.invoke("import-matches")
  if (error) console.error("Erreur import:", error)
  else console.log(`✅ ${data.imported} matchs importés !`)
}
