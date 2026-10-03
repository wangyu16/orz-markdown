"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskLists = taskLists;
function attrSet(token, name, value) {
    const index = token.attrIndex(name);
    if (index < 0)
        token.attrPush([name, value]);
    else
        token.attrs[index] = [name, value];
}
function startsWithTodo(token) {
    return token.content.indexOf('[ ] ') === 0 || token.content.indexOf('[x] ') === 0 || token.content.indexOf('[X] ') === 0;
}
function taskLists(state) {
    const tokens = state.tokens;
    // lastAtLevel[l]: the latest token seen at level l — for a list item at level
    // L, the token at level L - 1 before it is its list's opener.
    const lastAtLevel = [];
    for (let i = 0; i < tokens.length; i++) {
        if (i >= 2) {
            const inline = tokens[i];
            if (inline.type === 'inline' && tokens[i - 1].type === 'paragraph_open' && tokens[i - 2].type === 'list_item_open' && startsWithTodo(inline)) {
                const checkbox = new state.Token('html_inline', '', 0);
                if (inline.content.indexOf('[ ] ') === 0)
                    checkbox.content = '<input class="task-list-item-checkbox" disabled="" type="checkbox">';
                else
                    checkbox.content = '<input class="task-list-item-checkbox" checked="" disabled="" type="checkbox">';
                inline.children.unshift(checkbox);
                inline.children[1].content = inline.children[1].content.slice(3);
                inline.content = inline.content.slice(3);
                attrSet(tokens[i - 2], 'class', 'task-list-item');
                const parent = lastAtLevel[tokens[i - 2].level - 1];
                if (parent !== undefined)
                    attrSet(tokens[parent], 'class', 'contains-task-list');
            }
        }
        lastAtLevel[tokens[i].level] = i;
    }
}
//# sourceMappingURL=task-lists.js.map