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

/** What `FileSystemFileHandle.getFile()` gives: the file's current bytes (a `File`). */
export interface FileLike {
  arrayBuffer?(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/** The part of `FileSystemFileHandle` the save uses. */
export interface FileHandleLike {
  readonly name?: string;
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableLike>;
  /** The file's current contents: how the save proves which file a handle points at (spec/shell-runtime.md §1 step 3). */
  getFile?(): Promise<FileLike>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<string>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<string>;
}

export interface SaveFilePickerOptions {
  suggestedName?: string;
  id?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
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
  readonly objectStoreNames: { contains(name: string): boolean };
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
  createElement(tag: 'a'): ElementLike & { href: string; download: string; rel: string };
  readonly body: { appendChild(node: unknown): unknown } | null;
}

/** What the saver reads from a window (all optional: absent features are feature-detected away). */
export interface SaverWindow {
  readonly location?: LocationLike;
  readonly document?: DocumentLike;
  readonly indexedDB?: IdbFactoryLike;
  showSaveFilePicker?(options: SaveFilePickerOptions): Promise<FileHandleLike>;
  readonly Blob?: new (parts: unknown[], options?: { type?: string }) => unknown;
  readonly URL?: { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void };
  setTimeout?(handler: () => void, ms: number): unknown;
}

/** The iframe the host side embeds an assembled file in. */
export interface IframeLike {
  readonly contentWindow: PostTarget | null;
  addEventListener(type: 'load', listener: () => void): void;
  removeEventListener(type: 'load', listener: () => void): void;
}

/** Reach the current global window lazily (never at module load). */
export function globalWindow<T>(): T | undefined {
  try {
    const w = (globalThis as { window?: unknown }).window;
    return (typeof w === 'object' && w !== null ? w : undefined) as T | undefined;
  } catch {
    return undefined;
  }
}

/**
 * The page location a remembered file handle belongs to: the URL without its
 * query and fragment (for a `file:` page, the file's own path). `undefined`
 * when the page has no readable location.
 */
export function pageLocation(loc: { readonly href?: string } | undefined): string | undefined {
  const href = loc?.href;
  return typeof href === 'string' && href ? href.replace(/[?#].*$/s, '') : undefined;
}

/** The file name a `file:` page was opened from; `undefined` for any other page. */
export function openedFileName(loc: { readonly protocol?: string; readonly pathname?: string } | undefined): string | undefined {
  if (!loc || loc.protocol !== 'file:' || typeof loc.pathname !== 'string') return undefined;
  const last = loc.pathname.split('/').pop();
  if (!last) return undefined;
  try { return decodeURIComponent(last); } catch { return last; }
}

// ── chrome and update UI (chrome.ts, indicator.ts, update.ts) ─────────────

/** An event as the chrome reads it (a DOM `Event` / `KeyboardEvent` satisfies it). */
export interface UiEventLike {
  readonly key?: string;
  readonly target?: unknown;
  readonly relatedTarget?: unknown;
  preventDefault(): void;
  stopPropagation?(): void;
  composedPath?(): unknown[];
}
export type UiListener = (event: UiEventLike) => void;

/** The part of `CSSStyleDeclaration` the chrome writes. */
export interface StyleLike {
  setProperty(name: string, value: string): void;
}

/** The part of a DOM `Element` / `HTMLElement` the chrome writes. Only writes: the chrome never reads page content (its one markup write, an icon, is typed in chrome.ts). */
export interface UiElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
  /** `Node.append` (elements and text nodes). */
  append(...nodes: unknown[]): void;
  appendChild(node: unknown): unknown;
  remove(): void;
  addEventListener(type: string, listener: UiListener, options?: boolean | { capture?: boolean }): void;
  removeEventListener(type: string, listener: UiListener, options?: boolean | { capture?: boolean }): void;
  focus?(options?: { preventScroll?: boolean }): void;
  className: string;
  hidden: boolean;
  readonly style?: StyleLike;
  readonly ownerDocument?: UiDocument | null;
  readonly parentNode?: { insertBefore(node: unknown, before: unknown): unknown } | null;
  readonly nextSibling?: unknown;
  attachShadow?(init: { mode: 'open' | 'closed' }): ShadowRootLike;
  after?(...nodes: unknown[]): void;
  getBoundingClientRect?(): { top: number; left: number; bottom: number; right: number; width: number; height: number };
  /** `HTMLButtonElement.disabled`. */
  disabled?: boolean;
}

/** `CharacterData` (a DOM `Text`): the chrome changes a message through `data`. */
export interface TextLike {
  data: string;
}

/** The part of a `ShadowRoot` the chrome uses. */
export interface ShadowRootLike {
  append(...nodes: unknown[]): void;
  appendChild(node: unknown): unknown;
  contains?(node: unknown): boolean;
  adoptedStyleSheets?: unknown[];
  readonly host?: unknown;
  addEventListener?(type: string, listener: UiListener, options?: boolean | { capture?: boolean }): void;
  removeEventListener?(type: string, listener: UiListener, options?: boolean | { capture?: boolean }): void;
}

/** The view a chrome document belongs to (a `Window` satisfies it). */
export interface UiView {
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly CSSStyleSheet?: new () => { replaceSync(css: string): void };
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  matchMedia?(query: string): { matches: boolean };
}

/** The part of `Document` the chrome and the update use. */
export interface UiDocument {
  createElement(tag: string): UiElement;
  createElementNS?(ns: string, tag: string): UiElement;
  createTextNode(text: string): TextLike;
  readonly body: UiElement | null;
  readonly defaultView?: UiView | null;
  addEventListener(type: string, listener: UiListener, options?: boolean | { capture?: boolean }): void;
  removeEventListener(type: string, listener: UiListener, options?: boolean | { capture?: boolean }): void;
}
