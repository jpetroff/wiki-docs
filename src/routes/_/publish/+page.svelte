<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  let { form } = $props();
</script>

<div class="max-w-2xl space-y-6">
  <h1 class="text-3xl font-semibold tracking-tight">Publish changes</h1>
  <Card.Root>
    <Card.Header>
      <Card.Title>Git publishing is coming later</Card.Title>
      <Card.Description>Publishing is not implemented. No repository status has been checked.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-5">
      <p class="text-sm text-muted-foreground">Once available, editors will review saved wiki changes here before committing and pushing them together.</p>
      <Button disabled>Publish — unavailable</Button>
      {#if form?.status === 'not-implemented'}
        <p role="status" class="text-sm text-muted-foreground">{form.message}</p>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
