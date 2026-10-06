import type { UpdateInfo } from './update.js';
import type { ShadowRootLike, UiDocument, UiElement } from './types.js';
export interface IndicatorHandlers {
    /** "Update now": typically `performUpdate({ info, … })` then a reload. A rejection is shown in the popover. */
    onUpdate(info: UpdateInfo): unknown;
    /** "Not now": the indicator goes away for this page; the next day's check offers again. */
    onLater?(info: UpdateInfo): void;
    /** "Skip this version": typically `skipVersion(info.kind, info.latest)`. The indicator goes away. */
    onSkip?(info: UpdateInfo): void;
}
export interface UpdateIndicator {
    /** The element inserted after the anchor (its shadow root holds the chrome). */
    readonly host: UiElement;
    readonly root: ShadowRootLike;
    open(): void;
    close(): void;
    isOpen(): boolean;
    /** Remove the indicator and every listener it added. */
    dispose(): void;
}
/** Mount the indicator after `anchor` (the brand). Throws only when there is no document. */
export declare function mountUpdateIndicator(anchor: UiElement, info: UpdateInfo, handlers: IndicatorHandlers, options?: {
    document?: UiDocument;
}): UpdateIndicator;
//# sourceMappingURL=indicator.d.ts.map