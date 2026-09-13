/** Progressive enhancement: rendered code stays readable without JavaScript. */
export function copyCode(article: HTMLElement, _html: string) {
  let revision = 0;
  let cleanups: Array<() => void> = [];

  function refresh() {
    const current = ++revision;
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    // Svelte may replace the HTML during the same update; enhance the final DOM.
    queueMicrotask(() => {
      if (current !== revision) return;
      for (const pre of article.querySelectorAll<HTMLPreElement>('pre')) {
        const code = pre.querySelector('code');
        if (!code) continue;
        const wrapper = document.createElement('div');
        wrapper.className = 'code-snippet';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-code';
        button.textContent = 'Copy';
        button.setAttribute('aria-label', 'Copy code to clipboard');
        const status = document.createElement('span');
        status.className = 'sr-only';
        status.setAttribute('role', 'status');
        pre.before(wrapper);
        wrapper.append(button, status, pre);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const copy = async () => {
          button.disabled = true;
          clearTimeout(timer);
          let copied = false;
          try {
            const text = code.textContent ?? '';
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(text);
              copied = true;
            } else {
              // Support documentation served over HTTP without the Clipboard API.
              const input = document.createElement('textarea');
              input.value = text;
              input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
              document.body.append(input);
              try { input.select(); copied = document.execCommand('copy'); }
              finally { input.remove(); button.focus({ preventScroll: true }); }
            }
          } catch { /* Report failure without claiming the clipboard changed. */ }
          if (current !== revision) return;
          button.disabled = false;
          button.textContent = copied ? 'Copied!' : 'Copy failed';
          status.textContent = copied ? 'Code copied to clipboard.' : 'Unable to copy. Select and copy the code manually.';
          timer = setTimeout(() => { button.textContent = 'Copy'; status.textContent = ''; }, 2500);
        };
        button.addEventListener('click', copy);
        cleanups.push(() => {
          clearTimeout(timer);
          button.removeEventListener('click', copy);
          wrapper.replaceWith(pre);
        });
      }
    });
  }
  refresh();
  return {
    update: refresh,
    destroy() { ++revision; cleanups.forEach((cleanup) => cleanup()); }
  };
}
