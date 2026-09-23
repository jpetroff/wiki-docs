<script lang="ts">
  import { getContext } from 'svelte';
  import { documentUrl, entryTitle, type DirectoryNode } from '$lib/shared/navigation';
  import { navigationKey, type NavigationState } from './navigation.svelte';
  import CreateMenu from './create-menu.svelte';
  let { directory, title, canEdit }: { directory: DirectoryNode; title: string; canEdit: boolean } = $props();
  const navigation = getContext<NavigationState>(navigationKey);
</script>

<section data-documentation-mode="files" class="space-y-6">
  <div class="flex items-center justify-between gap-4">
    <h1 class="break-words text-3xl font-semibold">{entryTitle(directory, title)}</h1>
    {#if canEdit}<CreateMenu path={directory.path} name={entryTitle(directory, title)} />{/if}
  </div>
  {#if directory.hasIndex}<a class="inline-block underline" href={documentUrl(directory.path)}>Read folder overview</a>{/if}
  {#if directory.children?.length}
    <ul class="divide-y rounded-lg border">
      {#each directory.children as entry (entry.path)}
        <li class="flex items-center gap-3 px-4 py-3">
          <span class="w-16 shrink-0 text-xs text-muted-foreground">{entry.kind === 'directory' ? 'Folder' : 'Document'}</span>
          <a class="min-w-0 flex-1 break-words hover:underline" href={documentUrl(entry.path)} onclick={() => { if (entry.kind === 'directory' && entry.hasChildren) void navigation.expand(entry.path); }}>{entryTitle(entry)}</a>
          {#if canEdit && entry.kind === 'directory'}<CreateMenu path={entry.path} name={entryTitle(entry)} />{/if}
        </li>
      {/each}
    </ul>
  {:else}<p class="text-muted-foreground">This folder has no documents or folders to display.</p>{/if}
</section>
