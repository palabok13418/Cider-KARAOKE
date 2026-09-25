export type PluginDefinition = {
  ce_prefix?: string;
  identifier: string;
  name: string;
  description: string;
  version: string;
  author: string;
  repo: string;
  pluginKitVersion?: string | number;
  CustomElements?: Record<string, unknown>;
  setup?: () => void;
};

export function definePluginContext(options: PluginDefinition) {
  const customElementName = (name: string) =>
    `${options.ce_prefix ?? options.identifier}-${name}`;

  return {
    customElementName,
    plugin: {
      ...options,
      pluginKitVersion: 4,
    },
  };
}

export function addImmersiveLayout(layout: {
  name: string;
  identifier: string;
  component: string;
  type?: "normal" | "portrait";
}) {
  const api = (globalThis as any).__PLUGINSYS__?.Components?.ImmersiveLayouts;
  if (!api?.addLayout) {
    throw new Error("Cider ImmersiveLayouts API is unavailable.");
  }
  return api.addLayout(layout);
}
