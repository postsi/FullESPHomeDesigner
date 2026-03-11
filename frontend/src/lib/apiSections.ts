/** Sections defaults for Components panel — loaded on demand to avoid bundle init order issues.
 * When deviceId and entryId are provided, backend substitutes __ETD_DEVICE_NAME__ with the device slug. */
export async function getSectionsDefaults(
  project: any,
  recipeId?: string,
  deviceId?: string | null,
  entryId?: string | null
): Promise<{
  sections: Record<string, string>;
  categories: Record<string, string[]>;
  keys_with_additions: string[];
  default_sections: Record<string, string>;
}> {
  const body: Record<string, unknown> = {
    project,
    recipe_id: recipeId ?? (project?.device?.hardware_recipe_id ?? project?.hardware?.recipe_id ?? "") ?? "",
  };
  if (deviceId) body.device_id = deviceId;
  if (entryId) body.entry_id = entryId;
  const r = await fetch("/api/esphome_touch_designer/sections/defaults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) throw new Error(data?.error ?? `sections/defaults failed: ${r.status}`);
  const cat = data.categories ?? {};
  const categories: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(cat)) {
    categories[k] = Array.isArray(v) ? v : [];
  }
  const keys_with_additions = Array.isArray(data.keys_with_additions) ? data.keys_with_additions : [];
  const default_sections = (data.default_sections && typeof data.default_sections === "object") ? data.default_sections : {};
  return { sections: data.sections ?? {}, categories, keys_with_additions, default_sections };
}
