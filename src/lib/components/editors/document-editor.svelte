<script lang="ts">
  import { getContext, onMount, tick } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import type { EditorAdapter } from './types';
  import { documentUrl } from '$lib/shared/navigation';
  import { navigationKey, type NavigationState } from '$lib/components/navigation/navigation.svelte';

  let { document, returnTo, draftParent }: {
    document: { path: string; content: string; revision: string; kind: string };
    returnTo: string;
    draftParent?: string;
  } = $props();
  const navigation = getContext<NavigationState | undefined>(navigationKey);
  let workingPath = $state('');
  let creating = $state(false);
  let transferring = $state(false);
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
    if (transferring && navigation.to?.url.pathname === documentUrl(workingPath)) return;
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
        next = mountMonaco(holder, content, workingPath || 'untitled.md', changed);
      }
      adapter = next;
      ready = true;
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Unable to load editor. Reload to try again.';
    }
  }

  onMount(() => {
    workingPath = document.path;
    creating = draftParent !== undefined;
    revision = document.revision;
    saved = document.content;
    const pending = navigation?.pendingEdit;
    if (pending?.path === document.path) {
      navigation!.pendingEdit = undefined;
      revision = pending.revision;
      saved = pending.saved;
      dirty = pending.content !== saved;
      void mount(pending.content, document.kind !== 'markdown');
    } else void mount(saved, document.kind !== 'markdown');
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
      const wasCreating = creating;
      const response = await fetch(wasCreating ? '/_/api/documents/create' : '/_/api/documents', {
        method: wasCreating ? 'POST' : 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(wasCreating ? { parentPath: draftParent, content } : { path: workingPath, content, originalRevision: revision })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'ok') throw new Error(result.message ?? 'Unable to save. Your edits are still here.');
      revision = result.value.revision;
      if (wasCreating) {
        workingPath = result.value.path;
        creating = false;
      }
      saved = content;
      dirty = (await adapter.getValue()) !== saved;
      message = dirty ? 'Saved. You have newer unsaved changes.' : 'Saved locally. Document content is live; navigation updates after a manual scan and reload.';
      if (wasCreating && navigation) {
        // Carry newer input through the real route change without sending it to disk.
        transferring = true;
        await tick();
        navigation.pendingEdit = { path: workingPath, content: await adapter.getValue(), saved, revision };
        void navigation.reveal(draftParent!);
        await goto(documentUrl(workingPath) + '?edit', { replaceState: true });
      }
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Unable to save. Your edits are still here.';
    } finally { busy = false; transferring = false; }
  }
</script>

<svelte:head>
  {#if draftParent !== undefined}<title>{workingPath ? `Edit ${workingPath}` : 'New document'} — {page.data.config.siteTitle}</title>{/if}
</svelte:head>
<section data-documentation-mode="edit" class="space-y-5">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold">{draftParent !== undefined && !workingPath ? 'New document' : 'Edit page'}</h1>
      <p class="break-all font-mono text-xs text-muted-foreground">/{workingPath || document.path || draftParent || ''}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if document.kind === 'markdown'}
        <Button variant="outline" onclick={switchMode} disabled={!ready || busy}>{sourceMode ? 'Visual editor' : 'Markdown source'}</Button>
      {/if}
      <Button href={draftParent !== undefined && workingPath ? documentUrl(workingPath) : returnTo} variant="outline">{dirty || creating ? 'Cancel' : 'Back to page'}</Button>
      <Button onclick={save} disabled={!ready || busy || !dirty}>{busy ? 'Working…' : 'Save changes'}</Button>
    </div>
  </div>
  {#if draftParent !== undefined && !workingPath}<p class="text-sm text-muted-foreground">Add a front matter title or a level-one heading. The front matter title takes precedence for the filename when you save. Nothing is created until then.</p>{/if}
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
  <div bind:this={holder} inert={!ready || transferring} aria-busy={!ready || transferring} data-editor={sourceMode ? 'monaco' : 'blok'} class="editor-surface overflow-hidden rounded-lg border" class:source={sourceMode}></div>
</section>

<style>
  .editor-surface { min-height: 26rem; }
  .editor-surface:not(.source) { padding: 2rem 3.5rem; }
  .editor-surface.source { height: 60vh; }
  @media (max-width: 640px) { .editor-surface:not(.source) { padding: 1rem 2rem; } }
</style>
