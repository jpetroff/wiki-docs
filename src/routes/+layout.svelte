<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { setContext, untrack } from 'svelte';
  import Sidebar from '$lib/components/navigation/sidebar.svelte';
  import { NavigationState, navigationKey } from '$lib/components/navigation/navigation.svelte';
  import { parentPath } from '$lib/shared/navigation';
  let { data, children } = $props();
  const navigation = setContext(navigationKey, new NavigationState(untrack(() => data.navigation)));
  const showNavigation = $derived(!page.url.pathname.startsWith('/_/') || page.url.pathname === '/_/new');
  const activePath = $derived.by(() => {
    const content = page.data.result;
    const path = page.data.directory?.path ?? page.data.edit?.path ??
      (content?.status === 'ok' ? content.value.sourcePath : undefined) ??
      (page.url.pathname === '/_/new' ? page.data.parentPath : undefined) ??
      page.url.pathname.slice(1).split('/').map((part) => { try { return decodeURIComponent(part); } catch { return part; } }).join('/').replace(/\/$/, '');
    return path === 'README.md' || path.endsWith('/README.md') ? parentPath(path) : path;
  });
</script>

<svelte:head>
  <title>{data.config.siteTitle}</title>
  <meta name="description" content="Project documentation." />
</svelte:head>

<div class="flex min-h-screen flex-col bg-background text-foreground">
  <a class="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-background focus:p-3" href="#content">Skip to content</a>
  <header class="border-b">
    <div class="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <a href="/" class="flex items-center gap-3 font-semibold tracking-tight">
        <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">W</span>
        {data.config.siteTitle}
      </a>
      <nav aria-label="Main navigation" class="flex flex-wrap gap-1">
        <Button href="/" variant="ghost" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Documentation</Button>
        {#if data.user?.role === 'admin'}
          <Button href="/_/settings" variant="ghost" aria-current={page.url.pathname === '/_/settings' ? 'page' : undefined}>Settings</Button>
        {/if}
        {#if data.user}
          <Button href="/_/publish" variant="ghost" aria-current={page.url.pathname === '/_/publish' ? 'page' : undefined}>Publish</Button>
          <span class="self-center px-3 text-sm text-muted-foreground">{data.user.login}</span>
          <form method="POST" action="/_/logout"><Button type="submit" variant="outline">Log out</Button></form>
        {:else}
          <Button href={`/_/login?returnTo=${encodeURIComponent(page.url.pathname + page.url.search)}`} variant="outline" aria-current={page.url.pathname === '/_/login' ? 'page' : undefined}>Log in</Button>
        {/if}
      </nav>
    </div>
  </header>
  <div class="mx-auto w-full max-w-screen-2xl flex-1 md:flex">
    {#if showNavigation}<Sidebar title={data.config.siteTitle} canEdit={data.canCreate} {activePath} />{/if}
    <main id="content" class="mx-auto min-w-0 w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
      {@render children()}
    </main>
  </div>
  <footer class="mx-auto max-w-5xl px-5 pb-8 text-sm text-muted-foreground sm:px-8">
    Project documentation
  </footer>
</div>
