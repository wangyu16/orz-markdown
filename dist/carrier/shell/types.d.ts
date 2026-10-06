/**
 * Structural slices of the browser APIs the shell runtime uses. The package
 * compiles without the DOM lib, and tests pass fakes; a real `Window`,
 * `HTMLIFrameElement`, `Storage` or `IDBFactory` satisfies these types.
 */
export interface MessageEventLike {
    readonly data: unknown;
    readonly origin: string;
    readonly source: unknown;
}
export interface PostTarget {
    postMessage(message: unknown, targetOrigin: string): void;
}
export type MessageListener = (event: MessageEventLike) => void;
export interface MessageWindow {
    addEventListener(type: 'message', listener: MessageListener): void;
    removeEventListener(type: 'message', listener: MessageListener): void;
    readonly parent?: unknown;
}
export interface LocationLike {
    readonly protocol: string;
    readonly href: string;
    readonly pathname: string;
}
export interface WritableLike {
    write(data: unknown): Promise<void>;
    close(): Promise<void>;
}
/** The part of `FileSystemFileHandle` the save uses. */
export interface FileHandleLike {
    readonly name?: string;
    createWritable(options?: {
        keepExistingData?: boolean;
    }): Promise<WritableLike>;
    queryPermission?(descriptor: {
        mode: 'read' | 'readwrite';
    }): Promise<string>;
    requestPermission?(descriptor: {
        mode: 'read' | 'readwrite';
    }): Promise<string>;
}
export interface SaveFilePickerOptions {
    suggestedName?: string;
    id?: string;
    types?: Array<{
        description: string;
        accept: Record<string, string[]>;
    }>;
}
/** `Storage` (localStorage). */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** Enough of `IDBFactory` to open one database with one object store. */
export interface IdbFactoryLike {
    open(name: string, version?: number): IdbOpenRequestLike;
}
export interface IdbRequestLike<T = unknown> {
    result: T;
    error: unknown;
    onsuccess: ((this: unknown, ev: unknown) => unknown) | null;
    onerror: ((this: unknown, ev: unknown) => unknown) | null;
}
export interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
    onupgradeneeded: ((this: unknown, ev: unknown) => unknown) | null;
    onblocked: ((this: unknown, ev: unknown) => unknown) | null;
}
export interface IdbDatabaseLike {
    readonly objectStoreNames: {
        contains(name: string): boolean;
    };
    createObjectStore(name: string): unknown;
    transaction(store: string, mode?: 'readonly' | 'readwrite'): IdbTransactionLike;
    close(): void;
}
export interface IdbTransactionLike {
    objectStore(name: string): IdbStoreLike;
    oncomplete: ((this: unknown, ev: unknown) => unknown) | null;
    onabort: ((this: unknown, ev: unknown) => unknown) | null;
    onerror: ((this: unknown, ev: unknown) => unknown) | null;
}
export interface IdbStoreLike {
    get(key: string): IdbRequestLike;
    put(value: unknown, key: string): IdbRequestLike;
    delete(key: string): IdbRequestLike;
}
export interface ElementLike {
    setAttribute(name: string, value: string): void;
    click(): void;
    remove(): void;
}
export interface DocumentLike {
    createElement(tag: 'a'): ElementLike & {
        href: string;
        download: string;
        rel: string;
    };
    readonly body: {
        appendChild(node: unknown): unknown;
    } | null;
}
/** What the saver reads from a window (all optional: absent features are feature-detected away). */
export interface SaverWindow {
    readonly location?: LocationLike;
    readonly document?: DocumentLike;
    readonly indexedDB?: IdbFactoryLike;
    showSaveFilePicker?(options: SaveFilePickerOptions): Promise<FileHandleLike>;
    readonly Blob?: new (parts: unknown[], options?: {
        type?: string;
    }) => unknown;
    readonly URL?: {
        createObjectURL(blob: unknown): string;
        revokeObjectURL(url: string): void;
    };
    setTimeout?(handler: () => void, ms: number): unknown;
}
/** The iframe the host side embeds an assembled file in. */
export interface IframeLike {
    readonly contentWindow: PostTarget | null;
    addEventListener(type: 'load', listener: () => void): void;
    removeEventListener(type: 'load', listener: () => void): void;
}
/** Reach the current global window lazily (never at module load). */
export declare function globalWindow<T>(): T | undefined;
//# sourceMappingURL=types.d.ts.map