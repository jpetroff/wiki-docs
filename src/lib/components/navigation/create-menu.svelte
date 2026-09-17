<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { documentUrl } from '$lib/shared/navigation';
  import { navigationKey, type NavigationState } from './navigation.svelte';
  let { path, name }: { path: string; name: string } = $props();
  const navigation = getContext<NavigationState>(navigationKey);
  let menu: HTMLDetailsElement;
  let dialog: HTMLDialogElement;
  let trigger: HTMLElement;
  let folderName = $state('');
  let problem = $state('');
  let busy = $state(false);
  function closeMenu() { menu.open = false; trigger.focus(); }
  function newFolder() {
    closeMenu(); folderName = ''; problem = ''; dialog.showModal();
  }
  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true; problem = '';
    try {
      const response = await fetch('/_/api/folders', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentPath: path, name: folderName })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'ok') throw new Error(result.message ?? 'Unable to create folder');
      dialog.close();
      await navigation.reveal(path);
      await goto(documentUrl(result.value.path));
    } catch (error) { problem = error instanceof Error ? error.message : 'Unable to create folder'; }
    finally { busy = false; }
  }
</script>

<svelte:window onkeydown={(event) => {
  if (event.key === 'Escape' && menu.open && menu.contains(event.target as Node)) { event.preventDefault(); closeMenu(); }
}} onclick={(event) => { if (menu.open && !menu.contains(event.target as Node)) menu.open = false; }} />
<details bind:this={menu} class="create-menu relative shrink-0">
  <summary bind:this={trigger} aria-label={`Create in ${name}`} class="flex size-7 cursor-pointer list-none items-center justify-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">+</summary>
  <div class="absolute right-0 top-full z-30 min-w-44 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
    <button type="button" class="block w-full rounded px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent" onclick={newFolder}>New folder</button>
    <a class="block rounded px-3 py-2 hover:bg-accent focus-visible:bg-accent" href={`/_/new?${new URLSearchParams({ parent: path })}`} onclick={() => { menu.open = false; }}>New document</a>
  </div>
</details>
<dialog bind:this={dialog} class="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/60" aria-label="New folder" oncancel={(event) => { if (busy) event.preventDefault(); }} onclose={() => trigger.focus()}>
  <form onsubmit={create} class="space-y-4">
    <h2 class="text-xl font-semibold">New folder</h2>
    <p class="break-all text-sm text-muted-foreground">Inside {path || name}</p>
    <label class="block space-y-2"><span>Folder name</span><input bind:value={folderName} required disabled={busy} class="w-full rounded-md border bg-background px-3 py-2" /></label>
    {#if problem}<p role="alert" class="text-sm text-destructive">{problem}</p>{/if}
    <div class="flex justify-end gap-2">
      <Button type="button" variant="outline" disabled={busy} onclick={() => dialog.close()}>Cancel</Button>
      <Button type="submit" disabled={busy || !folderName.trim()}>{busy ? 'Creating…' : 'Create folder'}</Button>
    </div>
  </form>
</dialog>

<style>summary::-webkit-details-marker { display: none; }</style>
