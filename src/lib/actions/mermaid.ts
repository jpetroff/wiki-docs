import type { Mermaid } from 'mermaid';

let instance: Promise<Mermaid> | undefined;
let renderQueue = Promise.resolve();
let nextId = 0;

function loadMermaid() {
  // Treat the official browser bundle as an asset so Vite does not rebuild its
  // entire dependency graph. Both the URL module and script load only on demand.
  return instance ??= import('mermaid/dist/mermaid.min.js?url').then(({ default: src }) => new Promise<Mermaid>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.remove();
      const mermaid = (window as Window & { mermaid?: Mermaid }).mermaid;
      if (mermaid) resolve(mermaid);
      else reject(new Error('The diagram renderer did not initialize. Reload the page to try again.'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Unable to load the diagram renderer. Reload the page to try again.'));
    };
    document.head.append(script);
  })).then((mermaid) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
      fontFamily: '"Roboto Variable", sans-serif',
      suppressErrorRendering: true,
      // Keep the site's appearance and all Mermaid security protections in place.
      secure: [...(mermaid.mermaidAPI.defaultConfig.secure ?? []), 'theme', 'fontFamily']
    });
    return mermaid;
  }).catch((error: unknown) => {
    instance = undefined;
    throw error;
  });
}

function showError(block: HTMLElement, error: unknown) {
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  const heading = document.createElement('strong');
  heading.textContent = 'Unable to render diagram';
  const message = document.createElement('pre');
  message.textContent = error instanceof Error && error.message.trim()
    ? error.message
    : typeof error === 'string' && error.trim()
      ? error
      : 'The diagram could not be rendered.';
  status.append(heading, message);
  block.replaceChildren(status);
  block.dataset.mermaidState = 'error';
}

/** Enhance sanitized placeholders; source remains readable without JavaScript. */
export function renderMermaid(article: HTMLElement, _html: string) {
  let revision = 0;
  const stages = new Set<HTMLElement>();

  function refresh() {
    const current = ++revision;
    queueMicrotask(() => {
      if (current !== revision) return;
      let renderer: Promise<Mermaid> | undefined;
      for (const block of article.querySelectorAll<HTMLElement>('.mermaid-block')) {
        const source = block.querySelector<HTMLPreElement>(':scope > pre');
        if (!source) continue;
        const definition = source.textContent ?? '';
        const active = () => current === revision && block.isConnected && article.contains(block);
        block.setAttribute('aria-busy', 'true');
        // Serialize across article updates as Mermaid uses shared rendering state.
        renderQueue = renderQueue.then(async () => {
          if (!active()) return;
          let stage: HTMLDivElement | undefined;
          try {
            const [mermaid] = await Promise.all([renderer ??= loadMermaid(), document.fonts.ready]);
            if (!active()) return;
            if (!definition.trim()) throw new Error('The diagram is empty.');
            // Measure in the document without exposing temporary or error SVGs.
            stage = document.createElement('div');
            stage.setAttribute('aria-hidden', 'true');
            stage.style.cssText = `position:absolute;left:-100000px;top:0;visibility:hidden;width:${article.clientWidth}px`;
            document.body.append(stage);
            stages.add(stage);
            const { svg } = await mermaid.render(`wiki-mermaid-${++nextId}`, definition, stage);
            if (!active()) return;
            block.innerHTML = svg;
            block.dataset.mermaidState = 'rendered';
          } catch (error) {
            if (active()) showError(block, error);
          } finally {
            if (stage) { stage.remove(); stages.delete(stage); }
            if (active()) block.removeAttribute('aria-busy');
          }
        });
      }
    });
  }

  refresh();
  return {
    update: refresh,
    destroy() {
      ++revision;
      stages.forEach((stage) => stage.remove());
      stages.clear();
    }
  };
}
