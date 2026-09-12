<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  let { data, form } = $props();
</script>

<div class="max-w-2xl space-y-6">
  <h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
  <Card.Root>
    <Card.Header>
      <Card.Title>Service setup</Card.Title>
      <Card.Description>Settings is a placeholder. Account management is not implemented.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-5">
      <dl class="space-y-4 text-sm">
        <div class="flex flex-wrap justify-between gap-2 border-b pb-3">
          <dt class="text-muted-foreground">Site title</dt><dd>{data.config.siteTitle}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2 border-b pb-3">
          <dt class="text-muted-foreground">Documentation folder</dt>
          <dd>{data.config.documentationConfigured ? 'Configured; access unavailable' : 'Not configured'}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <dt class="text-muted-foreground">Accounts</dt><dd>Not implemented</dd>
        </div>
      </dl>
      <Button disabled>Create account — unavailable</Button>
      {#if form?.status === 'not-implemented'}
        <p role="status" class="text-sm text-muted-foreground">{form.message}</p>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
