<script lang="ts">
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import type { EditorAdapter } from './types';

  let { document, returnTo }: {
    document: { path: string; content: string; revision: string; kind: string };
    returnTo: string;
  } = $props();
  let holder: HTMLDivElement;
  let adapter: EditorAdapter | undefined;
  let ready = $state(false);
  let dirty = $state(false);
  let busy = $state(false);
  let sourceMode = $state(false);
  let message = $state('');
  let problem = $state('');
  let revision = '';
  let saved = '';
  let disposed = false;
  let recovery = $state('');

  beforeNavigate((navigation) => {
    if (!dirty && !busy) return;
    if (navigation.willUnload) return; // Native beforeunload handles full navigations.
    if (busy || !window.confirm('Discard your unsaved changes?')) navigation.cancel();
  });

  function changed() { dirty = true; message = ''; }
  async function mount(content: string, asSource: boolean) {
    recovery = content;
    ready = false;
    problem = '';
    let next: EditorAdapter | null = null;
    try {
      if (!asSource) {
        const { mountBlok } = await import('./blok');
        if (disposed) return;
        next = await mountBlok(holder, content, changed);
        if (!next) message = 'This page contains Markdown that needs source editing to preserve its content.';
      }
      if (disposed) { next?.destroy(); return; }
      sourceMode = asSource || !next;
      if (!next) {
        const { mountMonaco } = await import('./monaco');
        if (disposed) return;
        next = mountMonaco(holder, content, document.path, changed);
      }
      adapter = next;
      ready = true;
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Unable to load editor. Reload to try again.';
    }
  }

  onMount(() => {
    revision = document.revision;
    saved = document.content;
    void mount(saved, document.kind !== 'markdown');
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty || busy) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => { disposed = true; adapter?.destroy(); window.removeEventListener('beforeunload', protect); };
  });

  async function switchMode() {
    if (!adapter || busy) return;
    busy = true;
    try {
      const content = await adapter.getValue();
      adapter.destroy(); adapter = undefined;
      holder.replaceChildren();
      await mount(content, !sourceMode);
    } catch (error) { problem = error instanceof Error ? error.message : 'Unable to change editor'; }
    finally { busy = false; }
  }

  async function save() {
    if (!adapter || busy) return;
    busy = true; problem = ''; message = '';
    try {
      const content = await adapter.getValue();
      const response = await fetch('/_/api/documents', {
        method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ path: document.path, content, originalRevision: revision })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'ok') throw new Error(result.message ?? 'Unable to save. Your edits are still here.');
      revision = result.value.revision;
      saved = content;
      dirty = (await adapter.getValue()) !== saved;
      message = dirty ? 'Saved. You have newer unsaved changes.' : 'Saved locally. Changes are visible to readers.';
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Unable to save. Your edits are still here.';
    } finally { busy = false; }
  }
</script>

<section data-documentation-mode="edit" class="space-y-5">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold">Edit page</h1>
      <p class="break-all font-mono text-xs text-muted-foreground">/{document.path}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if document.kind === 'markdown'}
        <Button variant="outline" onclick={switchMode} disabled={!ready || busy}>{sourceMode ? 'Visual editor' : 'Markdown source'}</Button>
      {/if}
      <Button href={returnTo} variant="outline">{dirty ? 'Cancel' : 'Back to page'}</Button>
      <Button onclick={save} disabled={!ready || busy || !dirty}>{busy ? 'Working…' : 'Save changes'}</Button>
    </div>
  </div>
  <p class="text-sm text-muted-foreground">{sourceMode ? 'Monaco source editor' : 'Blok Markdown editor'} · {dirty ? 'Unsaved changes' : 'No unsaved changes'}</p>
  <p class="text-sm text-muted-foreground">Saving updates this site immediately. Repository changes are pushed manually.</p>
  {#if message}<p role="status" class="text-sm">{message}</p>{/if}
  {#if problem}
    <p role="alert" class="text-sm text-destructive">{problem}</p>
    {#if !ready}
      <Button variant="outline" onclick={() => mount(recovery, true)}>Retry source editor</Button>
      <textarea readonly value={recovery} aria-label="Recover your source" class="min-h-48 w-full rounded-lg border p-3 font-mono text-sm"></textarea>
    {/if}
  {/if}
  {#if !ready && !problem}<p role="status" class="text-sm">Loading editor…</p>{/if}
  <noscript><p>Enable JavaScript to edit this page.</p></noscript>
  <div bind:this={holder} inert={!ready} aria-busy={!ready} data-editor={sourceMode ? 'monaco' : 'blok'} class="editor-surface overflow-hidden rounded-lg border" class:source={sourceMode}></div>
</section>

<style>
  .editor-surface { min-height: 26rem; }
  .editor-surface:not(.source) { padding: 2rem 3.5rem; }
  .editor-surface.source { height: 60vh; }
  @media (max-width: 640px) { .editor-surface:not(.source) { padding: 1rem 2rem; } }
</style>
