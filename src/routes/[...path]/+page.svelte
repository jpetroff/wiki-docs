<script lang="ts">
  import { copyCode } from '$lib/actions/copy-code';
  let { data } = $props();
</script>

<svelte:head><title>{data.result.status === 'ok' ? `${data.result.value.title} — ` : ''}{data.config.siteTitle}</title></svelte:head>
{#if data.result.status === 'ok'}
  <section data-documentation-mode="view">
    <p class="mb-6 break-all font-mono text-xs text-muted-foreground">/{data.result.value.sourcePath}</p>
    <article class="markdown-body" aria-label={data.result.value.title} use:copyCode={data.result.value.html}>
      {@html data.result.value.html}
    </article>
  </section>
{:else if data.result.status === 'not-implemented'}
  <section data-documentation-mode={data.request.mode} class="space-y-4">
    <h1 class="text-3xl font-semibold">{data.request.mode === 'files' ? 'File browser preview' : 'Editor preview'}</h1>
    <p>{data.result.message}</p>
    <a class="underline" href={data.request.pathname}>Read document</a>
  </section>
{/if}
