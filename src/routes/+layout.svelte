<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  let { data, children } = $props();
</script>

<svelte:head>
  <title>{data.config.siteTitle}</title>
  <meta name="description" content="WikiDocs documentation engine — initial scaffold." />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <a class="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-background focus:p-3" href="#content">Skip to content</a>
  <header class="border-b">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <a href="/" class="flex items-center gap-3 font-semibold tracking-tight">
        <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">W</span>
        {data.config.siteTitle}
      </a>
      <nav aria-label="Main navigation" class="flex flex-wrap gap-1">
        <Button href="/" variant="ghost" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Documentation</Button>
        <Button href="/_/settings" variant="ghost" aria-current={page.url.pathname === '/_/settings' ? 'page' : undefined}>Settings</Button>
        <Button href="/_/publish" variant="ghost" aria-current={page.url.pathname === '/_/publish' ? 'page' : undefined}>Publish</Button>
        <Button href="/_/login" variant="outline" aria-current={page.url.pathname === '/_/login' ? 'page' : undefined}>Log in</Button>
      </nav>
    </div>
  </header>
  <main id="content" class="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
    <p class="mb-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">Initial scaffold</p>
    {@render children()}
  </main>
  <footer class="mx-auto max-w-5xl px-5 pb-8 text-sm text-muted-foreground sm:px-8">
    Reading, accounts, editing, and publishing will be added in later passes.
  </footer>
</div>
