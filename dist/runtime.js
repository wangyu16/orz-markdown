"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserRuntimeScript = void 0;
exports.getBrowserRuntimeScript = getBrowserRuntimeScript;
exports.browserRuntimeScript = String.raw `
(function (global) {
  var expandedQr = null;
  var expandedSourceQr = null;

  function collapseQr() {
    if (!expandedQr) return;

    if (expandedSourceQr) {
      expandedSourceQr.classList.remove('is-expanded');
      expandedSourceQr.setAttribute('aria-expanded', 'false');
    }

    if (expandedQr.parentNode) {
      expandedQr.parentNode.removeChild(expandedQr);
    }

    if (global.document && global.document.body) {
      global.document.body.style.overflow = '';
    }
    expandedQr = null;
    expandedSourceQr = null;
  }

  function toggleQr(node) {
    if (expandedSourceQr === node) {
      collapseQr();
      return;
    }

    collapseQr();
    if (!global.document || !global.document.body) {
      return;
    }

    expandedSourceQr = node;
    expandedSourceQr.classList.add('is-expanded');
    expandedSourceQr.setAttribute('aria-expanded', 'true');

    expandedQr = node.cloneNode(true);
    expandedQr.classList.add('qrcode-overlay', 'is-expanded');
    expandedQr.setAttribute('aria-hidden', 'true');
    expandedQr.removeAttribute('aria-expanded');
    expandedQr.removeAttribute('tabindex');
    expandedQr.removeAttribute('role');
    expandedQr.addEventListener('click', function (event) {
      event.stopPropagation();
      collapseQr();
    });

    global.document.body.appendChild(expandedQr);

    if (global.document && global.document.body) {
      global.document.body.style.overflow = 'hidden';
    }
  }

  function initQrCodes(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    Array.prototype.slice.call(root.querySelectorAll('.qrcode')).forEach(function (node) {
      if (node.getAttribute('data-qr-ready') === '1') return;

      node.setAttribute('data-qr-ready', '1');
      node.addEventListener('click', function (event) {
        event.stopPropagation();
        toggleQr(node);
      });
      node.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleQr(node);
        }
        if (event.key === 'Escape') {
          collapseQr();
        }
      });
    });
  }

  function initTabs(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    Array.prototype.slice.call(root.querySelectorAll('.tabs')).forEach(function (tabs) {
      // data-js both guards re-init and switches the theme CSS from the no-JS
      // fallback (all panels shown) to JS mode (only the .active panel shown).
      if (tabs.getAttribute('data-js') === '1') return;
      var panels = Array.prototype.slice.call(tabs.querySelectorAll(':scope > .tab'));
      if (!panels.length) return;
      tabs.setAttribute('data-js', '1');

      var bar = global.document.createElement('div');
      bar.className = 'tabs-bar';
      panels.forEach(function (panel, i) {
        var label = panel.getAttribute('data-label') || 'Tab ' + (i + 1);
        var btn = global.document.createElement('button');
        btn.className = 'tabs-bar-btn' + (i === 0 ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', function () {
          Array.prototype.slice.call(tabs.querySelectorAll('.tabs-bar-btn')).forEach(function (b) { b.classList.remove('active'); });
          panels.forEach(function (p) { p.classList.remove('active'); });
          btn.classList.add('active');
          panel.classList.add('active');
        });
        bar.appendChild(btn);
      });
      tabs.insertBefore(bar, tabs.firstChild);
      panels[0].classList.add('active');
    });
  }

  function init(root) {
    var r = root || global.document;
    initQrCodes(r);
    initTabs(r);
  }

  // ---- copy-as-markdown: DOM -> Markdown walker ---------------------------
  // Converts a selected DOM fragment back to Markdown so that copying rendered
  // content yields source, not HTML. Standard constructs are reconstructed from
  // their tags; generated constructs (math, mermaid, smiles, qr, youtube) carry
  // a [data-md] breadcrumb that is emitted verbatim. Written without template
  // literals/backticks because this whole file is a String.raw template.
  var BT = String.fromCharCode(96);
  var FENCE = BT + BT + BT;

  function rt_repeat(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  function rt_attr(node, name) {
    return node && node.getAttribute ? node.getAttribute(name) : null;
  }

  function rt_isBlockElement(node) {
    if (!node || node.nodeType !== 1) return false;
    if (rt_attr(node, 'data-md') != null) return true;
    var tag = node.tagName.toLowerCase();
    if (/^(p|div|section|article|figure|h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tr|hr|details)$/.test(tag)) return true;
    if (node.classList && (node.classList.contains('katex-display') || node.classList.contains('mermaid'))) return true;
    return false;
  }

  function rt_katex(node, display) {
    var ann = node.querySelector ? node.querySelector('annotation[encoding="application/x-tex"]') : null;
    var tex = (ann ? ann.textContent : node.textContent) || '';
    tex = tex.replace(/^\s+|\s+$/g, '');
    if (display) return '$$\n' + tex + '\n$$';
    return '$' + tex + '$';
  }

  function rt_img(node) {
    var alt = rt_attr(node, 'alt') || '';
    var src = rt_attr(node, 'src') || '';
    var title = rt_attr(node, 'title');
    return '![' + alt + '](' + src + (title ? ' "' + title + '"' : '') + ')';
  }

  function rt_inlineChildren(node) {
    var out = '';
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) out += rt_inlineNode(kids[i]);
    return out;
  }

  function rt_inlineNode(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    var dm = rt_attr(node, 'data-md');
    if (dm != null) return dm;
    if (node.classList && node.classList.contains('katex')) return rt_katex(node, false);
    var tag = node.tagName.toLowerCase();
    switch (tag) {
      case 'strong': case 'b': return '**' + rt_inlineChildren(node) + '**';
      case 'em': case 'i': return '*' + rt_inlineChildren(node) + '*';
      case 'code': return BT + (node.textContent || '') + BT;
      case 'a':
        var href = rt_attr(node, 'href') || '';
        var title = rt_attr(node, 'title');
        return '[' + rt_inlineChildren(node) + '](' + href + (title ? ' "' + title + '"' : '') + ')';
      case 'del': case 's': return '~~' + rt_inlineChildren(node) + '~~';
      case 'ins': return '++' + rt_inlineChildren(node) + '++';
      case 'mark': return '==' + rt_inlineChildren(node) + '==';
      case 'sub': return '~' + rt_inlineChildren(node) + '~';
      case 'sup': return '^' + rt_inlineChildren(node) + '^';
      case 'br': return '  \n';
      case 'img': return rt_img(node);
      case 'input': return '';
      case 'span':
        var spCls = (rt_attr(node, 'class') || '').trim();
        return spCls ? '{{sp[' + spCls + '] ' + rt_inlineChildren(node) + '}}' : rt_inlineChildren(node);
      default: return rt_inlineChildren(node);
    }
  }

  function rt_align(cell) {
    var style = (rt_attr(cell, 'style') || '').toLowerCase();
    if (style.indexOf('center') !== -1) return 'center';
    if (style.indexOf('right') !== -1) return 'right';
    if (style.indexOf('left') !== -1) return 'left';
    return '';
  }

  function rt_sep(align) {
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    if (align === 'left') return ':---';
    return '---';
  }

  function rt_tableRows(headRow, bodyRows) {
    var rows = [];
    var header = [];
    var aligns = [];
    if (headRow) {
      var hc = headRow.children;
      for (var i = 0; i < hc.length; i++) { header.push(rt_inlineChildren(hc[i]).trim()); aligns.push(rt_align(hc[i])); }
    }
    rows.push('| ' + header.join(' | ') + ' |');
    var seps = [];
    for (var s = 0; s < header.length; s++) seps.push(rt_sep(aligns[s]));
    rows.push('| ' + seps.join(' | ') + ' |');
    for (var r = 0; r < bodyRows.length; r++) {
      var cells = [];
      var tds = bodyRows[r].children;
      for (var c = 0; c < tds.length; c++) cells.push(rt_inlineChildren(tds[c]).trim());
      rows.push('| ' + cells.join(' | ') + ' |');
    }
    return rows.join('\n');
  }

  function rt_table(tbl) {
    var headRow = tbl.querySelector ? tbl.querySelector('thead tr') : null;
    var bodyRows = tbl.querySelectorAll ? tbl.querySelectorAll('tbody tr') : [];
    return rt_tableRows(headRow, bodyRows);
  }

  // Reconstruct a table from bare table-internal nodes (thead/tbody/tr), e.g.
  // when a selection inside a table loses its <table> wrapper.
  function rt_tableFromParts(parts) {
    var headRow = null;
    var bodyRows = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var tag = p.tagName.toLowerCase();
      if (tag === 'thead') { var tr = p.querySelector ? p.querySelector('tr') : null; if (tr && !headRow) headRow = tr; }
      else if (tag === 'tbody') { var trs = p.querySelectorAll ? p.querySelectorAll('tr') : []; for (var j = 0; j < trs.length; j++) bodyRows.push(trs[j]); }
      else if (tag === 'tr') { if (!headRow) headRow = p; else bodyRows.push(p); }
    }
    return rt_tableRows(headRow, bodyRows);
  }

  function rt_codeBlock(pre) {
    var code = pre.querySelector ? (pre.querySelector('code') || pre) : pre;
    var lang = '';
    var cls = rt_attr(code, 'class') || '';
    var m = cls.match(/language-([A-Za-z0-9_+#-]+)/);
    if (m) lang = m[1];
    var text = (code.textContent || '').replace(/\n$/, '');
    return FENCE + lang + '\n' + text + '\n' + FENCE;
  }

  function rt_list(node, ordered, depth) {
    var items = [];
    var idx = 1;
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var li = kids[i];
      if (li.nodeType !== 1 || li.tagName.toLowerCase() !== 'li') continue;
      items.push(rt_listItem(li, ordered, idx, depth));
      idx++;
    }
    return items.join('\n');
  }

  function rt_listItem(li, ordered, idx, depth) {
    var indent = rt_repeat('  ', depth);
    var marker = ordered ? (idx + '. ') : '- ';
    var task = '';
    var cb = li.querySelector ? li.querySelector('input[type="checkbox"]') : null;
    if (cb) task = (cb.checked || rt_attr(cb, 'checked') != null) ? '[x] ' : '[ ] ';
    var inlineParts = '';
    var nested = '';
    var kids = li.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.nodeType === 1 && /^(ul|ol)$/.test(c.tagName.toLowerCase())) {
        nested += '\n' + rt_list(c, c.tagName.toLowerCase() === 'ol', depth + 1);
      } else {
        inlineParts += rt_inlineNode(c);
      }
    }
    inlineParts = inlineParts.replace(/\s+/g, ' ').trim();
    return indent + marker + task + inlineParts + nested;
  }

  function rt_blockquote(node) {
    var inner = rt_blockChildren(node);
    var lines = inner.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) out.push(lines[i] ? '> ' + lines[i] : '>');
    return out.join('\n');
  }

  function rt_blockChildren(node) {
    var parts = [];
    var kids = node.childNodes;
    var i = 0;
    while (i < kids.length) {
      var k = kids[i];
      // A selection can contain bare <li> elements (when the user selects a
      // list's contents rather than the <ul>/<ol> wrapper). Group a run of them
      // into a bullet list instead of emitting each as a separate block.
      if (k.nodeType === 1 && k.tagName.toLowerCase() === 'li') {
        var lis = [];
        while (i < kids.length) {
          var kk = kids[i];
          if (kk.nodeType === 1 && kk.tagName.toLowerCase() === 'li') { lis.push(kk); i++; }
          else if (kk.nodeType === 3 && !(kk.nodeValue || '').trim()) { i++; }
          else break;
        }
        var items = [];
        for (var j = 0; j < lis.length; j++) items.push(rt_listItem(lis[j], false, j + 1, 0));
        parts.push(items.join('\n'));
        continue;
      }
      // Bare table-internal nodes (selection inside a table that lost its
      // <table> wrapper) — reconstruct a Markdown table.
      if (k.nodeType === 1 && /^(thead|tbody|tr)$/.test(k.tagName.toLowerCase())) {
        var trows = [];
        while (i < kids.length) {
          var tk = kids[i];
          if (tk.nodeType === 1 && /^(thead|tbody|tr)$/.test(tk.tagName.toLowerCase())) { trows.push(tk); i++; }
          else if (tk.nodeType === 3 && !(tk.nodeValue || '').trim()) { i++; }
          else break;
        }
        parts.push(rt_tableFromParts(trows));
        continue;
      }
      var s = rt_blockNode(k);
      if (s && s.replace(/\s/g, '') !== '') parts.push(s.replace(/\s+$/, ''));
      i++;
    }
    return parts.join('\n\n');
  }

  function rt_blockNode(node) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      return (t && t.trim()) ? t.replace(/\s+/g, ' ').trim() : '';
    }
    if (node.nodeType !== 1) return '';
    var dm = rt_attr(node, 'data-md');
    if (dm != null) return dm;
    if (node.classList) {
      if (node.classList.contains('katex-display')) {
        var k = node.querySelector ? node.querySelector('.katex') : null;
        return rt_katex(k || node, true);
      }
      if (node.classList.contains('mermaid')) return '{{mermaid\n' + (node.textContent || '').trim() + '\n}}';
    }
    var tag = node.tagName.toLowerCase();
    var hm = tag.match(/^h([1-6])$/);
    if (hm) return rt_repeat('#', parseInt(hm[1], 10)) + ' ' + rt_inlineChildren(node).trim();
    switch (tag) {
      case 'p': return rt_inlineChildren(node).trim();
      case 'ul': return rt_list(node, false, 0);
      case 'ol': return rt_list(node, true, 0);
      case 'pre': return rt_codeBlock(node);
      case 'blockquote': return rt_blockquote(node);
      case 'table': return rt_table(node);
      case 'hr': return '---';
      case 'li': return rt_inlineChildren(node).trim();
      case 'figure': case 'div': case 'section': case 'article': case 'details': case 'summary':
        return rt_blockChildren(node);
      default: return rt_inlineNode(node).trim();
    }
  }

  function elementToMarkdown(root) {
    if (!root) return '';
    var hasBlock = false;
    var kids = root.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      if (rt_isBlockElement(kids[i])) { hasBlock = true; break; }
    }
    var out = hasBlock ? rt_blockChildren(root) : rt_inlineChildren(root);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
  }

  function rt_isEditable(node) {
    while (node) {
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return true;
        if (node.isContentEditable) return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function rt_isCopyRoot(node) {
    return node.nodeType === 1 && node.classList &&
      (node.classList.contains('markdown-body') || rt_attr(node, 'data-orz-copy') != null);
  }
  function rt_withinCopyRoot(node) {
    while (node) {
      if (rt_isCopyRoot(node)) return true;
      node = node.parentNode;
    }
    return false;
  }

  // When a selection sits entirely within one table/blockquote/pre, copy that
  // whole block: a partial table/quote/code fragment isn't valid Markdown, and
  // browsers often clone such selections without the wrapping element.
  function rt_promotableBlock(node) {
    while (node && !rt_isCopyRoot(node)) {
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase();
        if (tag === 'table' || tag === 'blockquote' || tag === 'pre') return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function onCopy(event) {
    if (!global.document) return;
    var sel = global.getSelection ? global.getSelection()
      : (global.document.getSelection ? global.document.getSelection() : null);
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    if (rt_isEditable(sel.anchorNode) || rt_isEditable(sel.focusNode)) return;
    if (!rt_withinCopyRoot(sel.anchorNode) && !rt_withinCopyRoot(sel.focusNode)) return;

    var md;
    var range0 = sel.getRangeAt(0);
    var common = range0.commonAncestorContainer;
    var promoted = rt_promotableBlock(common.nodeType === 1 ? common : common.parentNode);
    if (promoted && sel.rangeCount === 1) {
      var pwrap = global.document.createElement('div');
      pwrap.appendChild(promoted.cloneNode(true));
      md = elementToMarkdown(pwrap);
    } else {
      var container = global.document.createElement('div');
      for (var i = 0; i < sel.rangeCount; i++) container.appendChild(sel.getRangeAt(i).cloneContents());
      md = elementToMarkdown(container);
    }
    if (!md) return;
    var cd = event.clipboardData || global.clipboardData;
    if (cd && cd.setData) {
      cd.setData('text/plain', md);
      if (event.preventDefault) event.preventDefault();
    }
  }

  function bindGlobalHandlers() {
    if (!global.document || global.__orzMarkdownRuntimeBound) return;
    global.__orzMarkdownRuntimeBound = true;

    global.document.addEventListener('click', function (event) {
      if (expandedQr && !expandedQr.contains(event.target)) {
        collapseQr();
      }
    });

    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        collapseQr();
      }
    });

    // Copy rendered selections as Markdown source.
    global.document.addEventListener('copy', onCopy);
  }

  global.OrzMarkdownRuntime = Object.assign({}, global.OrzMarkdownRuntime, {
    init: init,
    initQrCodes: initQrCodes,
    initTabs: initTabs,
    collapseQr: collapseQr,
    elementToMarkdown: elementToMarkdown,
  });

  bindGlobalHandlers();

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () {
        init(global.document);
      }, { once: true });
    } else {
      init(global.document);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;
function getBrowserRuntimeScript() {
    return exports.browserRuntimeScript;
}
//# sourceMappingURL=runtime.js.map