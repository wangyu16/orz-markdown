/** The stub's creation tool, shared by its Node entry (build.ts) and its bundle ("New document"). */
import { editHeader, mintUid } from '../../src/carrier';

/** A new document with a header that names the carrier and a freshly minted uid. */
export function createStubText(title = 'Untitled'): string {
  return editHeader(`# ${title}\n\nStart writing here.\n`, { carrier: 'md', title, uid: mintUid() });
}
