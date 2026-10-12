<script lang="ts">
  import { actions } from 'astro:actions';
  import { Info, Loader2, Save } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import MarkdownEditor from '@/components/MarkdownEditor.svelte';
  import { parseActionError, primaryButtonClass } from '@/components/admin/shared/form-utils';
  import { cardClass } from '@/components/admin/ui';

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
      error = parseActionError(result.error).message;
      return;
    }
    // The action queued a flash message; reloading shows it as a toast.
    window.location.reload();
  }
</script>

<form onsubmit={submit} class="space-y-6">
  <div class="{cardClass} space-y-6 p-6">
    <div class="space-y-2 rounded-xl border border-gold-500/30 bg-gold-500/10 p-4 text-xs text-foreground">
      <p class="flex items-center gap-1.5 font-bold">
        <Info class="h-4 w-4 text-gold-600" aria-hidden="true" /> MDX component guide
      </p>
      <p>Embed rich layout components directly in the hero content:</p>
      <ul class="list-disc space-y-1 pl-5 font-mono">
        <li><strong>&lt;Card title="My Title"&gt;Content&lt;/Card&gt;</strong> – stylised content card.</li>
        <li><strong>&lt;Center&gt;Content&lt;/Center&gt;</strong> – centres nested text and elements.</li>
        <li><strong>&lt;Flex&gt;Content&lt;/Flex&gt;</strong> – responsive column-to-row layout.</li>
        <li><strong>&lt;Accordion title="Summary"&gt;Content&lt;/Accordion&gt;</strong> – expand/collapse block.</li>
        <li><strong>&lt;Badges&gt;Tag1, Tag2, Tag3&lt;/Badges&gt;</strong> – horizontal row of badges.</li>
      </ul>
    </div>

    <MarkdownEditor
      bind:value={content}
      id="welcome_hero_content"
      label="Hero content (Markdown / MDX)"
      placeholder="Enter welcome hero content…"
    />
  </div>

  {#if error}
    <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>
  {/if}
  <div class="flex justify-end">
    <button type="submit" disabled={processing} class={primaryButtonClass}>
      {#if processing}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…{:else}<Save class="h-4 w-4" aria-hidden="true" /> Save settings{/if}
    </button>
  </div>
</form>
