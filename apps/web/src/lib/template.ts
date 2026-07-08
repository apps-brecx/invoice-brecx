import { useEffect, useState } from "react";
import { templateSettingsSchema, type TemplateSettings } from "@inv/shared";
import { api } from "./api";

export type { TemplateSettings };

/** Schema defaults — what the paper looks like before any customization. */
export const DEFAULT_TEMPLATE: TemplateSettings = templateSettingsSchema.parse({});

export async function fetchTemplate(): Promise<TemplateSettings> {
  const { template } = await api.get<{ template: TemplateSettings }>("/settings/template");
  return template;
}

export async function saveTemplate(t: TemplateSettings): Promise<TemplateSettings> {
  const { template } = await api.put<{ template: TemplateSettings }>("/settings/template", t);
  return template;
}

/* ------------------------- multi-template API ------------------------- */

export interface TemplateRecord {
  id: number;
  name: string;
  active: boolean;
  settings: TemplateSettings;
}

export async function fetchTemplates(): Promise<TemplateRecord[]> {
  const { templates } = await api.get<{ templates: TemplateRecord[] }>("/templates");
  return templates;
}

export async function createTemplate(
  name: string,
  settings: TemplateSettings,
): Promise<TemplateRecord> {
  const { template } = await api.post<{ template: TemplateRecord }>("/templates", {
    name,
    settings,
  });
  return template;
}

export async function updateTemplate(
  id: number,
  name: string,
  settings: TemplateSettings,
): Promise<TemplateRecord> {
  const { template } = await api.put<{ template: TemplateRecord }>(`/templates/${id}`, {
    name,
    settings,
  });
  return template;
}

export async function activateTemplate(id: number): Promise<TemplateRecord> {
  const { template } = await api.post<{ template: TemplateRecord }>(`/templates/${id}/activate`);
  return template;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.del(`/templates/${id}`);
}

/** Load the saved template once; callers render with defaults meanwhile. */
export function useTemplate(): {
  template: TemplateSettings;
  setTemplate: (t: TemplateSettings) => void;
  loaded: boolean;
} {
  const [template, setTemplate] = useState<TemplateSettings>(DEFAULT_TEMPLATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTemplate()
      .then((t) => {
        if (alive) setTemplate(t);
      })
      .catch(() => {
        /* defaults stay */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { template, setTemplate, loaded };
}
