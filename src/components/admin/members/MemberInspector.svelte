<script lang="ts" module>
  export interface MemberValues {
    name: string;
    role: string;
    parentId: number | null;
    order: number;
    image: File | null;
  }
</script>

<script lang="ts">
  import { Loader2, Save, Trash, X } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { parentOptions, type OrgMember } from '@/lib/org-tree';
  import Field from '../shared/Field.svelte';
  import ImageField from '../shared/ImageField.svelte';
  import { inputClass, primaryButtonClass, secondaryButtonClass, type FormErrors } from '../shared/form-utils';

  let {
    heading,
    description = '',
    members,
    member = null,
    defaults,
    autofocus = false,
    onsave,
    ondelete,
    onclose,
  }: {
    heading: string;
    description?: string;
    members: OrgMember[];
    /** The member being edited; `null` in create mode. */
    member?: OrgMember | null;
    /** Initial manager and order for a new member. */
    defaults: { parentId: number | null; order: number };
    autofocus?: boolean;
    /** Persists the values; resolves with field/general errors, or `null` on success. */
    onsave: (values: MemberValues) => Promise<FormErrors | null>;
    ondelete?: () => void;
    onclose: () => void;
  } = $props();

  const initial = untrack(() => member);
  let name = $state(initial?.name ?? '');
  let role = $state(initial?.role ?? '');
  let parentId = $state(String(initial ? (initial.parentId ?? '') : (untrack(() => defaults.parentId) ?? '')));
  let order = $state(String(initial?.order ?? untrack(() => defaults.order)));
  let image = $state<File | null>(null);
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');
  let nameInput = $state<HTMLInputElement | null>(null);

  const options = $derived(parentOptions(members, initial?.id));

  $effect(() => {
    if (autofocus) nameInput?.focus();
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    errors = {};
    message = '';
    const parsedOrder = Number(order);
    if (order.trim() === '' || !Number.isInteger(parsedOrder)) {
      errors = { order: 'The order must be a whole number.' };
      return;
    }
    processing = true;
    const result = await onsave({
      name,
      role,
      parentId: parentId === '' ? null : Number(parentId),
      order: parsedOrder,
      image,
    });
    processing = false;
    if (result) {
      errors = result.fields;
      message = result.message;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside
  aria-labelledby="member-inspector-heading"
  data-testid="member-inspector"
  class="max-h-full w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-brand-sm md:w-80"
  onkeydown={onKeydown}
>
  <div class="flex items-start justify-between gap-2">
    <div class="min-w-0">
      <h2 id="member-inspector-heading" class="font-sans text-base font-semibold text-foreground">{heading}</h2>
      {#if description}<p class="mt-0.5 text-xs text-muted-foreground">{description}</p>{/if}
    </div>
    <button
      type="button"
      onclick={onclose}
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
      aria-label="Close panel"
    >
      <X class="h-4 w-4" aria-hidden="true" />
    </button>
  </div>

  <form method="post" onsubmit={submit} class="mt-4 space-y-4">
    <ImageField
      bind:file={image}
      id="member-image"
      target="portrait"
      label="Photo"
      existingUrl={initial?.imageUrl ?? null}
      aspectRatio={1}
      cropTitle="Crop Profile Photo (1:1)"
      hint="PNG, JPG, WebP or GIF (max 2 MB)"
      fit="cover"
      error={errors.image}
    />

    <Field id="member-name" label="Full name" required error={errors.name}>
      <input
        id="member-name"
        type="text"
        required
        maxlength="255"
        bind:value={name}
        bind:this={nameInput}
        class={inputClass}
        placeholder="e.g. Juan Dela Cruz"
      />
    </Field>

    <Field id="member-role" label="Role / position title" required error={errors.role}>
      <input
        id="member-role"
        type="text"
        required
        maxlength="255"
        bind:value={role}
        class={inputClass}
        placeholder="e.g. Department Head"
      />
    </Field>

    <Field id="member-parent" label="Reports to" error={errors.parentId} hint="Leave empty for a top-level member.">
      <select id="member-parent" bind:value={parentId} class={inputClass}>
        <option value="">None (top level)</option>
        {#each options as option (option.id)}
          <option value={String(option.id)}>{'\u00a0\u00a0'.repeat(option.depth)}{option.name} — {option.role}</option>
        {/each}
      </select>
    </Field>

    <Field id="member-order" label="Display order" required error={errors.order} hint="Lower numbers appear first.">
      <input id="member-order" type="number" step="1" required bind:value={order} class={inputClass} />
    </Field>

    {#if message}
      <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{message}</p>
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
      {#if initial && ondelete}
        <button
          type="button"
          onclick={ondelete}
          class="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash class="h-4 w-4" aria-hidden="true" /> Delete
        </button>
      {:else}
        <button type="button" onclick={onclose} class={secondaryButtonClass}>Cancel</button>
      {/if}
      <button type="submit" disabled={processing} class={primaryButtonClass}>
        {#if processing}
          <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
        {:else}
          <Save class="h-4 w-4" aria-hidden="true" /> {initial ? 'Save changes' : 'Add member'}
        {/if}
      </button>
    </div>
  </form>
</aside>
