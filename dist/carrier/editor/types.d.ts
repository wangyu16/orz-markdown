/**
 * Structural slices of the DOM the editor shell uses (the package compiles
 * without the DOM lib; a real `HTMLElement`, `Document`, `Window` or
 * `HTMLIFrameElement` satisfies them). Like the shell runtime, the editor
 * touches no browser global at module load: everything is reached from the
 * element the caller passes in.
 */
import type { ShadowRootLike } from '../shell/types.js';
export interface EdStyle {
    setProperty(name: string, value: string): void;
    removeProperty?(name: string): string;
    [key: string]: unknown;
}
export interface EdEvent {
    readonly type?: string;
    readonly key?: string;
    readonly metaKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly shiftKey?: boolean;
    readonly altKey?: boolean;
    readonly clientX?: number;
    readonly pointerId?: number;
    readonly button?: number;
    readonly defaultPrevented?: boolean;
    readonly isComposing?: boolean;
    readonly isTrusted?: boolean;
    readonly target?: unknown;
    readonly data?: unknown;
    readonly source?: unknown;
    readonly inputType?: string;
    /** `paste`: the clipboard (its files). */
    readonly clipboardData?: EdDataTransfer | null;
    /** `blur` / `focusout`: where focus goes. */
    readonly relatedTarget?: unknown;
    readonly deltaY?: number;
    composedPath?(): unknown[];
    /** `drop` / `dragover`: the dragged data (its files). */
    readonly dataTransfer?: EdDataTransfer | null;
    preventDefault(): void;
    stopPropagation?(): void;
}
export type EdListener = (event: EdEvent) => void;
/** A `File` (name, MIME type, size); a DOM `File` satisfies it. */
export interface EdFile {
    readonly name: string;
    readonly type: string;
    readonly size: number;
}
/** `DataTransfer`: the files of a paste or a drop, and the dragged types. */
export interface EdDataTransfer {
    readonly files?: ArrayLike<EdFile> | null;
    readonly types?: ArrayLike<string> | null;
}
export interface EdRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}
export interface EdElement {
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
    removeAttribute(name: string): void;
    append(...nodes: unknown[]): void;
    appendChild(node: unknown): unknown;
    remove(): void;
    replaceWith?(...nodes: unknown[]): void;
    addEventListener(type: string, listener: EdListener, options?: boolean | {
        capture?: boolean;
        passive?: boolean;
    }): void;
    removeEventListener(type: string, listener: EdListener, options?: boolean | {
        capture?: boolean;
    }): void;
    focus?(options?: {
        preventScroll?: boolean;
    }): void;
    contains?(node: unknown): boolean;
    className: string;
    hidden: boolean;
    readonly style: EdStyle;
    readonly ownerDocument: EdDocument | null;
    attachShadow?(init: {
        mode: 'open' | 'closed';
    }): ShadowRootLike;
    getBoundingClientRect?(): EdRect;
    setPointerCapture?(id: number): void;
    releasePointerCapture?(id: number): void;
    readonly clientWidth?: number;
    scrollTop?: number;
    readonly scrollHeight?: number;
    readonly clientHeight?: number;
    disabled?: boolean;
    title?: string;
}
/** `HTMLTextAreaElement`. */
export interface EdTextArea extends EdElement {
    value: string;
    readOnly: boolean;
    selectionStart: number;
    selectionEnd: number;
    spellcheck?: boolean;
    setSelectionRange?(start: number, end: number): void;
}
/** `HTMLIFrameElement`. */
export interface EdIframe extends EdElement {
    srcdoc: string;
    inert?: boolean;
    readonly contentWindow: {
        postMessage(message: unknown, targetOrigin: string, transfer?: unknown[]): void;
    } | null;
}
/** A `MessagePort`. */
export interface EdPort {
    postMessage(message: unknown): void;
    onmessage?: ((event: {
        data?: unknown;
    }) => void) | null;
    close?(): void;
}
/** `HTMLScriptElement`. */
export interface EdScript extends EdElement {
    src: string;
    integrity?: string;
    crossOrigin?: string | null;
    async?: boolean;
}
export interface EdResizeObserver {
    observe(target: unknown): void;
    disconnect(): void;
}
/** The window of the document the editor mounts in. */
export interface EdView {
    readonly innerWidth?: number;
    setTimeout(handler: () => void, ms: number): unknown;
    clearTimeout(id: unknown): void;
    requestAnimationFrame?(cb: () => void): unknown;
    addEventListener(type: string, listener: EdListener): void;
    removeEventListener(type: string, listener: EdListener): void;
    open?(url: string, target?: string, features?: string): unknown;
    readonly ResizeObserver?: new (cb: () => void) => EdResizeObserver;
    readonly CSSStyleSheet?: new () => {
        replaceSync(css: string): void;
    };
    readonly navigator?: {
        readonly platform?: string;
        readonly userAgent?: string;
        readonly userActivation?: {
            readonly isActive?: boolean;
        };
    };
    readonly location?: {
        readonly protocol?: string;
    };
    readonly performance?: {
        now(): number;
    };
    readonly top?: unknown;
    readonly crypto?: {
        getRandomValues?<T extends Uint8Array | Uint32Array>(array: T): T;
    };
    readonly MessageChannel?: new () => {
        port1: EdPort;
        port2: unknown;
    };
    [key: string]: unknown;
}
export interface EdDocument {
    createElement(tag: string): EdElement;
    addEventListener?(type: string, listener: EdListener, options?: boolean | {
        capture?: boolean;
    }): void;
    removeEventListener?(type: string, listener: EdListener, options?: boolean | {
        capture?: boolean;
    }): void;
    createTextNode(text: string): {
        data: string;
    };
    readonly head: EdElement | null;
    readonly body: EdElement | null;
    readonly defaultView: EdView | null;
    readonly activeElement?: unknown;
}
export type { ShadowRootLike };
//# sourceMappingURL=types.d.ts.map