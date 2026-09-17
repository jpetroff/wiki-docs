<script lang="ts">
  import { copyCode } from '$lib/actions/copy-code';
  import { renderMermaid } from '$lib/actions/mermaid';
  import { Button } from '$lib/components/ui/button';
  import DocumentEditor from '$lib/components/editors/document-editor.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.edit ? `Edit ${data.edit.path} — ` : data.result?.status === 'ok' ? `${data.result.value.title} — ` : ''}{data.config.siteTitle}</title></svelte:head>
{#if data.edit}
  {#key data.edit.path + data.edit.revision}
    <DocumentEditor document={data.edit} returnTo={data.request.pathname} />
  {/key}
{:else if data.result?.status === 'ok'}
  <section data-documentation-mode="view">
    <div class="mb-6 flex items-center justify-between gap-4">
      <p class="break-all font-mono text-xs text-muted-foreground">/{data.result.value.sourcePath}</p>
      {#if data.canEdit}<Button href={`${data.request.pathname}?edit`} variant="outline" data-edit-page>Edit</Button>{/if}
    </div>
    <article class="markdown-body" aria-label={data.result.value.title} use:copyCode={data.result.value.html} use:renderMermaid={data.result.value.html}>
      {@html data.result.value.html}
    </article>
  </section>
{:else if data.result?.status === 'not-implemented'}
  <section data-documentation-mode={data.request.mode} class="space-y-4">
    <h1 class="text-3xl font-semibold">{data.request.mode === 'files' ? 'File browser preview' : 'Editor preview'}</h1>
    <p>{data.result.message}</p>
    <a class="underline" href={data.request.pathname}>Read document</a>
  </section>
{/if}
