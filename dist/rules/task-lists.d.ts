/**
 * markdown-it-task-lists' core rule, ported (MIT, © Revin Guillen) for the
 * options orz-markdown uses (disabled checkboxes, no label wrapper). One change:
 * the list that holds an item is tracked while walking, instead of searched
 * backwards per item (`parentToken`), which made one list of N task items
 * O(N²): 40,000 items took 41 s, in plain markdown-it too (round 19, H5).
 * Output is token-for-token identical.
 */
import type MarkdownIt from 'markdown-it';
export declare function taskLists(state: MarkdownIt.StateCore): void;
//# sourceMappingURL=task-lists.d.ts.map