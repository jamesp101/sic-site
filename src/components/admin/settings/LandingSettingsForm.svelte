<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
  import { Loader2, Save } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import BlockEditor from '@/components/admin/editor/BlockEditor.svelte';
  import { parseActionError, primaryButtonClass } from '@/components/admin/shared/form-utils';

  let { welcomeHeroContent = '' }: { welcomeHeroContent?: string } = $props();

  let content = $state(untrack(() => welcomeHeroContent));
  let processing = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    const result = await actions.settings.updateLanding({ welcomeHeroContent: content });
    processing = false;
    if (result.error) {
      const parsed = parseActionError(result.error);
      error = parsed.message || parsed.fields.welcomeHeroContent || '';
      return;
    }
    // The action queued a flash message; re-rendering the view shows it as a toast.
    await reloadView();
  }
</script>

<form method="post" onsubmit={submit} class="space-y-6">
  <BlockEditor bind:value={content} id="welcome_hero_content" label="Welcome hero content" context="section" />

  {#if error}
    <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>
  {/if}
  <div class="flex justify-end">
    <button type="submit" disabled={processing} class={primaryButtonClass}>
      {#if processing}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…{:else}<Save class="h-4 w-4" aria-hidden="true" /> Save settings{/if}
    </button>
  </div>
</form>
