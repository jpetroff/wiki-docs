<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  let { form } = $props();
</script>

<div class="max-w-md space-y-6">
  <h1 class="text-3xl font-semibold tracking-tight">Log in</h1>
  <Card.Root>
    <Card.Header>
      <Card.Title>Accounts are coming later</Card.Title>
      <Card.Description>Login is not implemented. This form is a disabled preview and does not accept credentials.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form method="POST" class="space-y-4">
        <div class="space-y-2">
          <label for="login" class="text-sm font-medium">Login</label>
          <Input id="login" name="login" autocomplete="username" placeholder="Your login" disabled />
        </div>
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">Password</label>
          <Input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your password" disabled />
        </div>
        <Button type="submit" disabled class="w-full">Log in — unavailable</Button>
      </form>
      {#if form?.status === 'not-implemented'}
        <p role="status" class="mt-4 text-sm text-muted-foreground">{form.message}</p>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
