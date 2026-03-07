/** Sections defaults for Components panel — loaded on demand to avoid bundle init order issues. */
export async function getSectionsDefaults(
  project: any,
  recipeId?: string
): Promise<{
  sections: Record<string, string>;
  categories: Record<string, string[]>;
  overridden_keys: string[];
  default_sections: Record<string, string>;
}> {
  const r = await fetch("/api/esphome_touch_designer/sections/defaults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, recipe_id: recipeId ?? (project?.device?.hardware_recipe_id ?? project?.hardware?.recipe_id ?? "") }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) throw new Error(data?.error ?? `sections/defaults failed: ${r.status}`);
  const cat = data.categories ?? {};
  const categories: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(cat)) {
    categories[k] = Array.isArray(v) ? v : [];
  }
  const overridden_keys = Array.isArray(data.overridden_keys) ? data.overridden_keys : [];
  const default_sections = (data.default_sections && typeof data.default_sections === "object") ? data.default_sections : {};
  return { sections: data.sections ?? {}, categories, overridden_keys, default_sections };
}
