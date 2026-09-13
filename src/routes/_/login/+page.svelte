<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  let { data, form } = $props();
  let submitting = $state(false);
</script>

<div class="max-w-md space-y-6">
  <h1 class="text-3xl font-semibold tracking-tight">Log in</h1>
  <Card.Root>
    <Card.Header>
      <Card.Title>Welcome back</Card.Title>
      <Card.Description>Log in with your account. Contact your administrator if you need access or a password reset.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form method="POST" action={`/_/login?returnTo=${encodeURIComponent(data.returnTo)}`} class="space-y-4" use:enhance={() => {
        submitting = true;
        return async ({ update, formElement }) => {
          try { await update(); } finally {
            const password = formElement.elements.namedItem('password');
            if (password instanceof HTMLInputElement) password.value = '';
            submitting = false;
          }
        };
      }}>
        <div class="space-y-2">
          <label for="login" class="text-sm font-medium">Username</label>
          <Input id="login" name="login" autocomplete="username" autocapitalize="none" spellcheck={false} value={form?.login ?? ''} required maxlength={64} aria-describedby={form?.message ? 'login-error' : undefined} />
        </div>
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">Password</label>
          <Input id="password" name="password" type="password" autocomplete="current-password" required aria-describedby={form?.message ? 'login-error' : undefined} />
        </div>
        {#if form?.message}<p id="login-error" role="alert" class="text-sm text-destructive">{form.message}</p>{/if}
        <Button type="submit" disabled={submitting} class="w-full">{submitting ? 'Logging in…' : 'Log in'}</Button>
      </form>
    </Card.Content>
  </Card.Root>
</div>
