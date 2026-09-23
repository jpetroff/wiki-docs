<script lang="ts">
  import { getContext } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { documentUrl, entryTitle, type NavigationEntry } from '$lib/shared/navigation';
  import CreateMenu from './create-menu.svelte';
  import { navigationKey, type NavigationState } from './navigation.svelte';
  let { title, canEdit, activePath }: { title: string; canEdit: boolean; activePath: string } = $props();
  const navigation = getContext<NavigationState>(navigationKey);
  let mobileOpen = $state(false);
  afterNavigate(() => { mobileOpen = false; });
</script>

{#snippet entries(items: NavigationEntry[])}
  <ul class="space-y-1">
    {#each items as entry (entry.path)}
      <li>
        {#if entry.kind === 'directory'}
          {@const folder = navigation.folders[entry.path] ?? entry}
          <div class="flex min-h-9 items-center gap-1 rounded-md" class:bg-accent={activePath === folder.path}>
            {#if folder.hasChildren}
              <button type="button" class="size-7 shrink-0 rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${navigation.expanded[folder.path] ? 'Collapse' : 'Expand'} ${entryTitle(folder)}`} aria-expanded={!!navigation.expanded[folder.path]} onclick={() => {
                if (navigation.expanded[folder.path]) navigation.collapse(folder.path);
                else navigation.expand(folder.path);
              }}>{navigation.expanded[folder.path] ? '▾' : '▸'}</button>
            {:else}<span class="size-7 shrink-0" aria-hidden="true"></span>{/if}
            <a class="min-w-0 flex-1 break-words rounded py-1 pr-1 hover:underline" href={documentUrl(folder.path)} aria-current={activePath === folder.path ? 'page' : undefined} onclick={() => { if (folder.hasChildren) navigation.expand(folder.path); }}>{entryTitle(folder)}</a>
            {#if canEdit}<CreateMenu path={folder.path} name={entryTitle(folder)} />{/if}
          </div>
          {#if navigation.expanded[folder.path]}
            <div class="ml-3 border-l pl-3">
              {@render entries(folder.children ?? [])}
            </div>
          {/if}
        {:else}
          <a class="block break-words rounded-md py-2 pl-8 pr-2 hover:bg-accent" class:bg-accent={activePath === entry.path} href={documentUrl(entry.path)} aria-current={activePath === entry.path ? 'page' : undefined}>{entryTitle(entry)}</a>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<aside class="min-w-0 border-b md:w-64 md:shrink-0 md:border-b-0 md:border-r">
  <details class="md:hidden" bind:open={mobileOpen}>
    <summary class="cursor-pointer px-5 py-3 text-sm font-medium">Browse documentation</summary>
    <div class="px-3 pb-4">{@render tree()}</div>
  </details>
  <div class="hidden p-3 md:block">{@render tree()}</div>
</aside>

{#snippet tree()}
  <nav aria-label="Documentation tree" class="text-sm">
    <div class="mb-2 flex min-h-10 items-center gap-2 rounded-md px-2 font-semibold" class:bg-accent={activePath === ''}>
      <a href="/" class="min-w-0 flex-1 break-words hover:underline" aria-current={activePath === '' ? 'page' : undefined}>{navigation.folders[''] ? entryTitle(navigation.folders[''], title) : title}</a>
      {#if canEdit}<CreateMenu path="" name={navigation.folders[''] ? entryTitle(navigation.folders[''], title) : title} />{/if}
    </div>
    {#if !navigation.folders['']}<p role="status" class="p-2 text-xs text-muted-foreground">Navigation unavailable. Run the documentation scan and reload.</p>{/if}
    {@render entries(navigation.folders['']?.children ?? [])}
  </nav>
{/snippet}
