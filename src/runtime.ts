export const browserRuntimeScript = String.raw`
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

  function init(root) {
    initQrCodes(root || global.document);
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
  }

  global.OrzMarkdownRuntime = Object.assign({}, global.OrzMarkdownRuntime, {
    init: init,
    initQrCodes: initQrCodes,
    collapseQr: collapseQr,
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

export function getBrowserRuntimeScript(): string {
  return browserRuntimeScript;
}