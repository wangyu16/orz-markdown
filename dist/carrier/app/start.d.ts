import type { CarrierApp, CarrierAppOptions, OrzCarrierGlobal, StandaloneKind } from './types.js';
export interface StartOptions extends CarrierAppOptions {
    /** Where the global goes (default `globalThis`); `false`: set none. */
    global?: Record<string, unknown> | false;
    /** Boot the standalone app when the page is an assembled file (default `true`). */
    boot?: boolean;
}
/** Build the FC-19 §2 global of a kind (`app`: the booted file, or a getter of it). */
export declare function carrierGlobal(k: StandaloneKind, app?: () => CarrierApp | null): OrzCarrierGlobal;
/**
 * Set `globalThis.OrzCarrier` and boot the standalone file. A file that
 * cannot boot says so in the console only (its text stays in the island).
 */
export declare function startCarrier(k: StandaloneKind, options?: StartOptions): {
    carrier: OrzCarrierGlobal;
    app: CarrierApp | null;
};
//# sourceMappingURL=start.d.ts.map