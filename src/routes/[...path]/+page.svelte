<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  let { data } = $props();

  const labels = { view: 'Documentation preview', edit: 'Editor preview', files: 'File browser preview' };
</script>

<section data-documentation-mode={data.request.mode} class="space-y-7">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0 space-y-2">
      <h1 class="text-3xl font-semibold tracking-tight">{labels[data.request.mode]}</h1>
      <p class="break-all font-mono text-sm text-muted-foreground">{data.request.pathname}</p>
    </div>
    <nav aria-label="Document view" class="flex gap-2">
      <Button href={data.request.pathname} variant={data.request.mode === 'view' ? 'secondary' : 'outline'}>Read</Button>
      <Button href={`${data.request.pathname}?files`} variant={data.request.mode === 'files' ? 'secondary' : 'outline'}>Files</Button>
      <Button href={`${data.request.pathname}?edit`} variant={data.request.mode === 'edit' ? 'secondary' : 'outline'}>Edit preview</Button>
    </nav>
  </div>
  <Card.Root>
    <Card.Header>
      <Card.Title>Ready for the next pass</Card.Title>
      <Card.Description>This is a placeholder. Documentation files are not read or changed.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4 text-sm">
      {#if data.result.status === 'not-implemented'}
        <p>{data.result.message}</p>
      {/if}
      {#if !data.config.documentationConfigured}
        <p class="rounded-lg border bg-muted/40 p-4">
          No documentation folder is configured. Set <code>DOCS_DIR</code> in your <code>.env</code> file when connecting a repository in the next pass.
        </p>
      {:else}
        <p>A documentation folder is configured. Access to it is not implemented yet.</p>
      {/if}
    </Card.Content>
  </Card.Root>
</section>
