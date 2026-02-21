export type DeviceSummary = {
  device_id: string;
  slug: string;
  name: string;
  hardware_recipe_id?: string | null;
};

export type WidgetSchemaIndexItem = {
  type: string;
  title: string;
  description?: string;
};

export type WidgetSchema = {
  type: string;
  title: string;
  description?: string;
  props?: Record<string, any>;
  style?: Record<string, any>;
  events?: Record<string, any>;
};

export type ProjectModel = {
  model_version: number;
  pages: Array<{ page_id: string; name: string; widgets: any[] }>;
  // Optional project-level HA bindings + live update links.
  // These are consumed by the backend compiler.
  bindings?: any[];
  links?: any[];
  palette?: Record<string, string>;
  // Optional runtime/device metadata used by the designer UI.
  // The backend stores this as part of the project model.
  device?: {
    hardware_recipe_id?: string;
    screen?: { width?: number; height?: number };
  };
  ui?: {
    gridSize?: number;
    showGrid?: boolean;
  };
};

export type ApiOk<T> = T & { ok: true };
export type ApiErr = { ok: false; error: string };

const DOMAIN = "esphome_touch_designer";

function url(path: string, entryId?: string) {
  const u = new URL(`/api/${DOMAIN}/${path}`, window.location.origin);
  if (entryId) u.searchParams.set("entry_id", entryId);
  return u.toString();
}

export async function getContext(): Promise<ApiOk<{ entry_id: string }> | ApiErr> {
  const res = await fetch(url("context"));
  return res.json();
}

export async function listDevices(entryId: string): Promise<ApiOk<{ devices: DeviceSummary[] }> | ApiErr> {
  const res = await fetch(url("devices", entryId));
  return res.json();
}

export async function upsertDevice(
  entryId: string,
  payload: { device_id: string; name?: string; slug?: string; hardware_recipe_id?: string | null }
): Promise<ApiOk<{}> | ApiErr> {
  const res = await fetch(url("devices", entryId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteDevice(entryId: string, deviceId: string): Promise<ApiOk<{}> | ApiErr> {
  const u = new URL(url("devices", entryId));
  u.searchParams.set("device_id", deviceId);
  const res = await fetch(u.toString(), { method: "DELETE" });
  return res.json();
}

export async function getProject(entryId: string, deviceId: string): Promise<ApiOk<{ project: ProjectModel }> | ApiErr> {
  const res = await fetch(url(`devices/${encodeURIComponent(deviceId)}/project`, entryId));
  return res.json();
}

export async function putProject(entryId: string, deviceId: string, project: ProjectModel): Promise<ApiOk<{}> | ApiErr> {
  const res = await fetch(url(`devices/${encodeURIComponent(deviceId)}/project`, entryId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  });
  return res.json();
}

export async function listWidgetSchemas(): Promise<ApiOk<{ schemas: WidgetSchemaIndexItem[] }> | ApiErr> {
  const res = await fetch(url("schemas/widgets"));
  return res.json();
}

export async function getWidgetSchema(widgetType: string): Promise<ApiOk<{ schema: WidgetSchema }> | ApiErr> {
  const res = await fetch(url(`schemas/widgets/${encodeURIComponent(widgetType)}`));
  return res.json();
}

export async function deploy(entryId: string, deviceId: string): Promise<ApiOk<{ path: string }> | ApiErr> {
  const res = await fetch(url("deploy", entryId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return res.json();
}


export async function listAssets(): Promise<{name:string; size:number}[]> {
  return apiGet('/api/esphome_touch_designer/assets');
}

export async function uploadAsset(name: string, dataBase64: string) {
  return apiPost('/api/esphome_touch_designer/assets/upload', { name, data_base64: dataBase64 });
}


export async function validateRecipe(recipe_id: string) {
  return apiPost('/api/esphome_touch_designer/recipes/validate', { recipe_id });
}


export async function exportDeviceYaml(device_id: string) {
  return apiPost(`/api/esphome_touch_designer/devices/${device_id}/export`, {});
}


export async function getEntityCapabilities(entity_id: string) {
  const enc = encodeURIComponent(entity_id);
  return apiGet(`/api/esphome_touch_designer/ha/entities/${enc}/capabilities`);
}


export async function listPlugins() {
  return apiGet('/api/esphome_touch_designer/plugins');
}


export async function exportDeviceYamlPreview(device_id: string) {
  return apiPost(`/api/esphome_touch_designer/devices/${device_id}/export/preview`, {});
}

export async function exportDeviceYamlWithExpectedHash(device_id: string, expected_hash: string) {
  return apiPost(`/api/esphome_touch_designer/devices/${device_id}/export`, { expected_hash });
}
