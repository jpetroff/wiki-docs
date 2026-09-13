<script lang="ts">
  import { page } from '$app/state';
</script>
<svelte:head><title>{page.status} — Documentation</title></svelte:head>
<section class="space-y-4">
  <h1 class="text-3xl font-semibold">{page.status === 404 ? 'Page not found' : page.status === 503 ? 'Documentation unavailable' : 'Unable to load documentation'}</h1>
  <p>{page.error?.message}</p>
  <a class="underline" href="/">Documentation home</a>
</section>
