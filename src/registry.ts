export interface PluginDefinition {
  type: 'block' | 'inline';
  aliases: string[];
  render: (args: string | null, body: string | null, env: object) => string;
}

const registry = new Map<string, PluginDefinition>();

export function register(def: PluginDefinition): void {
  for (const alias of def.aliases) {
    registry.set(alias, def);
  }
}

export function hasBlock(name: string): boolean {
  const def = registry.get(name);
  return def !== undefined && def.type === 'block';
}

export function hasInline(name: string): boolean {
  const def = registry.get(name);
  return def !== undefined && def.type === 'inline';
}

export function getDefinition(name: string): PluginDefinition | undefined {
  return registry.get(name);
}
