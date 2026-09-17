<script lang="ts">
  import DocumentEditor from '$lib/components/editors/document-editor.svelte';
  import { documentUrl } from '$lib/shared/navigation';
  let { data } = $props();
</script>

<svelte:head><title>New document — {data.config.siteTitle}</title></svelte:head>
{#key data.parentPath}
  <DocumentEditor document={{ path: '', content: '', revision: '', kind: 'markdown' }}
    draftParent={data.parentPath} returnTo={documentUrl(data.parentPath)} />
{/key}
