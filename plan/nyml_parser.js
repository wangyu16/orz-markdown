/**
 * NYML V2 Parser implementation.
 *
 * V2 introduces list-based output where:
 * - Root is always a list of entries
 * - Multi-value fields create nested lists
 * - Mixed content (strings + key/value pairs) is supported
 * - No comments (# is allowed in values)
 */

class ParseError extends Error {
  constructor(code, message, line, column = null) {
    super(`Line ${line}: ${message}`);
    this.code = code;
    this.line = line;
    this.column = column;
    this.name = "ParseError";
  }
}

/**
 * Count leading spaces in a string.
 * @param {string} s
 * @returns {number}
 */
function leadingSpaces(s) {
  let count = 0;
  for (const ch of s) {
    if (ch === " ") {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Parse a stripped line into [key, value] tuple.
 *
 * @param {string} stripped - Line with leading/trailing whitespace removed
 * @returns {[string|null, string|null]} - [key, value] or [null, null] if no colon
 */
function parseKeyValue(stripped) {
  if (!stripped) {
    return [null, null];
  }

  // Handle quoted keys
  if (stripped.startsWith('"')) {
    const end = stripped.indexOf('"', 1);
    if (end === -1) {
      // Unmatched quote - treat as plain string
      return [null, null];
    }
    const key = stripped.slice(1, end);
    const rest = stripped.slice(end + 1).trimStart();
    if (!rest.startsWith(":")) {
      // No colon after quoted key - treat as plain string
      return [null, null];
    }
    const value = rest.slice(1).trim();
    return [key, value];
  }

  // Regular key:value
  const idx = stripped.indexOf(":");
  if (idx === -1) {
    return [null, null];
  }

  const key = stripped.slice(0, idx).trim();
  const value = stripped.slice(idx + 1).trim();
  return [key, value];
}

/**
 * Collect multiline string content starting from startIdx + 1.
 *
 * @param {string[]} lines - All lines
 * @param {number} startIdx - Index of the "key: |" line
 * @param {number} baseIndent - Indent of the key line
 * @returns {[string, number]} - [content, nextIndex]
 */
function collectMultiline(lines, startIdx, baseIndent) {
  const rawLines = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    const line = lines[i];
    const indent = leadingSpaces(line);

    // Empty lines are included in multiline content
    if (line.trim() === "") {
      rawLines.push("");
      i++;
      continue;
    }

    // Line with less or equal indent ends the block
    if (indent <= baseIndent) {
      break;
    }

    rawLines.push(line);
    i++;
  }

  // Dedent: find minimum indent among non-blank lines
  const nonblank = rawLines.filter((r) => r.trim() !== "");
  let minIndent = 0;
  if (nonblank.length > 0) {
    minIndent = Math.min(...nonblank.map((r) => leadingSpaces(r)));
  }

  // Apply dedent
  const pieces = [];
  for (const r of rawLines) {
    if (r.trim() === "") {
      pieces.push("");
    } else {
      pieces.push(r.slice(minIndent));
    }
  }

  // Collapse multiple trailing blank lines
  while (
    pieces.length >= 2 &&
    pieces[pieces.length - 1] === "" &&
    pieces[pieces.length - 2] === ""
  ) {
    pieces.pop();
  }

  // Build content with trailing newline
  let content;
  if (pieces.length > 0 && pieces[pieces.length - 1] === "") {
    content = pieces.join("\n");
  } else {
    content = pieces.length > 0 ? pieces.join("\n") + "\n" : "";
  }

  return [content, i];
}

/**
 * Parse NYML V2 text into a list structure.
 *
 * @param {string} text - The NYML V2 content to parse
 * @returns {Array} - A list representing the parsed data
 */
function parseNymlV2(text) {
  const lines = text.split(/\r?\n/);
  const result = [];

  // Stack of [container, baseIndent]
  const stack = [[result, -1]];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    // Skip empty lines
    if (!stripped) {
      i++;
      continue;
    }

    const indent = leadingSpaces(line);

    // Pop stack to find correct parent based on indent
    while (stack.length > 1 && indent <= stack[stack.length - 1][1]) {
      stack.pop();
    }

    const [parent, parentIndent] = stack[stack.length - 1];

    // Parse the line
    const [key, value] = parseKeyValue(stripped);

    if (key === null) {
      // No colon found - plain string
      if (stack.length > 1) {
        // Inside a multi-value context: add as plain string
        parent.push(stripped);
      }
      // At root level: ignore (Rule 9)
      i++;
      continue;
    }

    if (value === "|") {
      // Multiline string
      const [content, nextIdx] = collectMultiline(lines, i, indent);
      parent.push({ [key]: content });
      i = nextIdx;
      continue;
    }

    if (value === "") {
      // Multi-value field: create a list for children
      const newList = [];
      parent.push({ [key]: newList });
      stack.push([newList, indent]);
      i++;
      continue;
    }

    // Single-line key:value
    parent.push({ [key]: value });
    i++;
  }

  return result;
}

/**
 * Serialize a V2 data structure back to NYML format.
 *
 * @param {Array} data - List structure as returned by parseNymlV2()
 * @param {number} indent - Current indentation level (spaces)
 * @returns {string} - NYML formatted string
 */
function serializeNymlV2(data, indent = 0) {
  const lines = [];
  const prefix = " ".repeat(indent);

  for (const item of data) {
    if (typeof item === "string") {
      // Plain string in multi-value context
      lines.push(`${prefix}${item}`);
    } else if (typeof item === "object" && item !== null) {
      // Should have exactly one key
      for (const [key, value] of Object.entries(item)) {
        // Check if key needs quoting
        const quotedKey = key.includes(":") ? `"${key}"` : key;

        if (Array.isArray(value)) {
          // Multi-value field
          lines.push(`${prefix}${quotedKey}:`);
          lines.push(serializeNymlV2(value, indent + 2));
        } else if (typeof value === "string" && value.includes("\n")) {
          // Multiline string
          lines.push(`${prefix}${quotedKey}: |`);
          for (const vline of value.replace(/\n$/, "").split("\n")) {
            lines.push(`${prefix}  ${vline}`);
          }
        } else {
          // Single-line value
          lines.push(`${prefix}${quotedKey}: ${value}`);
        }
      }
    }
  }

  return lines.join("\n");
}

// Export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseNymlV2,
    serializeNymlV2,
    ParseError,
  };
}