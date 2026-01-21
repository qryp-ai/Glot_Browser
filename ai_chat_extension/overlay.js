(function () {
  const ID = 'glot-ai-overlay';
  const IFRAME_ID = 'glot-ai-overlay-iframe';
  const HANDLE_ID = 'glot-ai-overlay-resizer';
  const DEFAULT_WIDTH = parseInt(localStorage.getItem('glot_ai_overlay_width') || '380', 10);

  function toggle() {
    const existing = document.getElementById(ID);
    if (existing) {
      // remove
      existing.remove();
      document.documentElement.style.removeProperty('--glot-ai-overlay-width');
      document.documentElement.classList.remove('glot-ai-overlay-open');
      document.body.style.marginRight = '';
      return;
    }

    const width = Math.max(280, Math.min(720, DEFAULT_WIDTH));
    inject(width);
  }

  function inject(initialWidth) {
    const container = document.createElement('div');
    container.id = ID;
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.right = '0';
    container.style.height = '100vh';
    container.style.width = initialWidth + 'px';
    container.style.zIndex = '2147483645';
    container.style.background = '#0f1115';
    container.style.borderLeft = '1px solid #262d3a';
    container.style.boxShadow = 'rgba(0,0,0,.4) -6px 0 18px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    // Resizer handle
    const handle = document.createElement('div');
    handle.id = HANDLE_ID;
    handle.style.position = 'absolute';
    handle.style.left = '-6px';
    handle.style.top = '0';
    handle.style.width = '6px';
    handle.style.height = '100%';
    handle.style.cursor = 'ew-resize';
    handle.style.background = 'transparent';
    handle.style.zIndex = '2';

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('panel.html');
    iframe.style.border = '0';
    iframe.style.flex = '1 1 auto';
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    container.appendChild(handle);
    container.appendChild(iframe);
    document.body.appendChild(container);

    // Shift page content so overlay doesn't cover it
    document.body.style.transition = 'margin-right .12s ease';
    document.body.style.marginRight = initialWidth + 'px';

    // Drag to resize
    let startX = 0;
    let startW = initialWidth;
    function onMove(e) {
      const dx = e.clientX - startX;
      const newW = Math.max(280, Math.min(720, startW - dx));
      container.style.width = newW + 'px';
      document.body.style.marginRight = newW + 'px';
    }
    function onUp(e) {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      const w = parseInt(container.style.width, 10) || initialWidth;
      try { localStorage.setItem('glot_ai_overlay_width', String(w)); } catch (e) {}
    }
    handle.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startW = parseInt(container.style.width, 10) || initialWidth;
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
  }

  try { toggle(); } catch (e) { console.warn('Glot overlay failed:', e); }
})();
