<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
  import { Loader2, Save } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { actionForm } from '@/components/admin/shared/action-form.svelte';
  import BlockEditor from '@/components/admin/editor/BlockEditor.svelte';
  import { primaryButtonClass } from '@/components/admin/shared/form-utils';

  let { welcomeHeroContent = '' }: { welcomeHeroContent?: string } = $props();

  let content = $state(untrack(() => welcomeHeroContent));
  const form = actionForm({
    run: () => actions.settings.updateLanding({ welcomeHeroContent: content }),
    // The action queued a flash message; re-rendering the view shows it as a toast.
    onSuccess: () => reloadView(),
  });
  const error = $derived(form.message || form.errors.welcomeHeroContent || '');
</script>

<form method="post" onsubmit={form.submit} class="space-y-6">
  <BlockEditor bind:value={content} id="welcome_hero_content" label="Welcome hero content" context="section" />

  {#if error}
    <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>
  {/if}
  <div class="flex justify-end">
    <button type="submit" disabled={form.processing} class={primaryButtonClass}>
      {#if form.processing}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…{:else}<Save class="h-4 w-4" aria-hidden="true" /> Save settings{/if}
    </button>
  </div>
</form>
