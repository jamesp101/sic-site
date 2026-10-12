<script lang="ts">
  import { actions } from 'astro:actions';
  import { Info } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import MarkdownEditor from '@/components/MarkdownEditor.svelte';
  import Field from '@/components/admin/shared/Field.svelte';
  import FormActions from '@/components/admin/shared/FormActions.svelte';
  import { inputClass, parseActionError } from '@/components/admin/shared/form-utils';
  import { cardClass, selectClass } from '@/components/admin/ui';

  interface HeroValues {
    id: number;
    title: string | null;
    content: string;
    order: number;
    isActive: boolean;
    departmentId: number | null;
  }

  let {
    departments,
    isSuperAdmin,
    section = null,
  }: {
    departments: { id: number; name: string }[];
    isSuperAdmin: boolean;
    section?: HeroValues | null;
  } = $props();

  const initial = untrack(() => section);
  let title = $state(initial?.title ?? '');
  let content = $state(initial?.content ?? '');
  let order = $state(initial?.order ?? 0);
  let isActive = $state(initial?.isActive ?? true);
  let departmentId = $state(initial?.departmentId ? String(initial.departmentId) : isSuperAdmin ? '' : String(untrack(() => departments)[0]?.id ?? ''));

  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    errors = {};
    message = '';

    const input = {
      title: title.trim() || null,
      content,
      order: Number.isFinite(order) ? order : 0,
      isActive,
      departmentId: departmentId ? Number(departmentId) : null,
    };
    const { error } = await (section
      ? actions.heroSections.update({ id: section.id, ...input })
      : actions.heroSections.create(input));
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    window.location.assign('/admin/hero-sections');
  }
</script>

<form onsubmit={submit} class="space-y-6">
  <div class="{cardClass} space-y-6 p-6">
    <div class="space-y-2 rounded-xl border border-gold-500/30 bg-gold-500/10 p-4 text-xs text-foreground">
      <p class="flex items-center gap-1.5 font-bold">
        <Info class="h-4 w-4 text-gold-600" aria-hidden="true" /> Predefined MDX elements
      </p>
      <ul class="list-disc space-y-1 pl-5 font-mono">
        <li><strong>&lt;Card title="Title"&gt;Content&lt;/Card&gt;</strong> – contained info card.</li>
        <li><strong>&lt;Center&gt;Content&lt;/Center&gt;</strong> – centres nested content.</li>
        <li><strong>&lt;Flex&gt;Content&lt;/Flex&gt;</strong> – side-by-side on desktop.</li>
        <li><strong>&lt;Accordion title="Header"&gt;Content&lt;/Accordion&gt;</strong> – expandable block.</li>
        <li><strong>&lt;Badges&gt;Val1, Val2&lt;/Badges&gt;</strong> – comma-separated badges.</li>
      </ul>
    </div>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Field label="Page location" id="departmentId" error={errors.departmentId}>
        <select id="departmentId" bind:value={departmentId} class="{selectClass} w-full">
          {#if isSuperAdmin}<option value="">Welcome page (main landing)</option>{/if}
          {#each departments as dept (dept.id)}
            <option value={String(dept.id)}>{dept.name}</option>
          {/each}
        </select>
      </Field>

      <Field label="Administrative title" id="title" error={errors.title} hint="Only visible to administrators.">
        <input id="title" type="text" bind:value={title} class={inputClass} placeholder="e.g. Core values spotlight" />
      </Field>
    </div>

    <div class="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
      <Field label="Sort order" id="order" error={errors.order}>
        <input id="order" type="number" step="1" bind:value={order} class={inputClass} />
      </Field>
      <label class="flex cursor-pointer items-center gap-2.5 pt-6 text-sm font-semibold text-foreground">
        <input type="checkbox" bind:checked={isActive} class="h-4 w-4 rounded border-border-strong accent-brand-800" />
        Visible on page
      </label>
    </div>

    <MarkdownEditor
      bind:value={content}
      id="content"
      label="Hero content (Markdown / MDX)"
      error={errors.content}
      placeholder="# Header&#10;<Center>Text</Center>"
    />
  </div>

  <FormActions cancelHref="/admin/hero-sections" {processing} {message} submitLabel={section ? 'Save changes' : 'Create section'} />
</form>
