export interface PluginDefinition {
    type: 'block' | 'inline';
    aliases: string[];
    render: (args: string | null, body: string | null, env: object) => string;
}
export declare function register(def: PluginDefinition): void;
export declare function hasBlock(name: string): boolean;
export declare function hasInline(name: string): boolean;
export declare function getDefinition(name: string): PluginDefinition | undefined;
//# sourceMappingURL=registry.d.ts.map