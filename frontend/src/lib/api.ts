

export async function listRecipes(): Promise<any[]> {
  const r = await fetch("/api/esphome_touch_designer/recipes");
  if (!r.ok) throw new Error(`recipes failed: ${r.status}`);
  const data = await r.json();
  return data.recipes || [];
}

export async function compileYaml(deviceId: string, project?: any): Promise<string> {
  const r = await fetch(`/api/esphome_touch_designer/devices/${deviceId}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project ? { project } : {}),
  });
  if (!r.ok) throw new Error(`compile failed: ${r.status}`);
  const data = await r.json();
  return data.yaml;
}



export async function listEntities() {
  const r = await fetch('/api/esphome_touch_designer/entities');
  if (!r.ok) throw new Error('Failed to list entities');
  return await r.json();
}

export async function getEntity(entity_id: string) {
  const safe = entity_id.replace('.', ',');
  const r = await fetch(`/api/esphome_touch_designer/entity/${safe}`);
  if (!r.ok) throw new Error('Failed to get entity');
  return await r.json();
}


export async function importRecipe(yamlText: string, label?: string, id?: string): Promise<any> {
  const r = await fetch("/api/esphome_touch_designer/recipes/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml: yamlText, label, id }),
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error ? `${data.error}${data.detail ? `: ${data.detail}` : ""}` : `import failed: ${r.status}`);
  }
  return data;
}

export async function updateRecipeLabel(recipe_id: string, label: string): Promise<void> {
  const r = await fetch(`/api/esphome_touch_designer/recipes/user/${encodeURIComponent(recipe_id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error ? `${data.error}${data.detail ? `: ${data.detail}` : ""}` : `update failed: ${r.status}`);
  }
}

export async function deleteRecipe(recipe_id: string): Promise<void> {
  const r = await fetch(`/api/esphome_touch_designer/recipes/user/${encodeURIComponent(recipe_id)}`, {
    method: "DELETE",
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error ? `${data.error}${data.detail ? `: ${data.detail}` : ""}` : `delete failed: ${r.status}`);
  }
}

export async function cloneRecipe(source_id: string, label?: string, id?: string): Promise<any> {
  const r = await fetch('/api/esphome_touch_designer/recipes/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id, label, id }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error ? `${data.error}${data.detail ? `: ${data.detail}` : ''}` : `clone failed: ${r.status}`);
  }
  return data;
}

export async function exportRecipe(recipe_id: string): Promise<any> {
  const r = await fetch(`/api/esphome_touch_designer/recipes/${encodeURIComponent(recipe_id)}/export`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error ? `${data.error}${data.detail ? `: ${data.detail}` : ''}` : `export failed: ${r.status}`);
  }
  return data;
}
