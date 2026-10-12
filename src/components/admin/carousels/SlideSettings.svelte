<script lang="ts">
  import ImageField from '../shared/ImageField.svelte';
  import { inputClass } from '../shared/form-utils';

  let {
    file = $bindable(null),
    savedImageUrl,
    imageError = '',
    showOnMain,
    departmentId,
    departments,
    superadmin,
    busy = false,
    onplacement,
  }: {
    /** Replacement image (already cropped to 16:9). */
    file: File | null;
    savedImageUrl: string | null;
    imageError?: string;
    showOnMain: boolean;
    departmentId: number | null;
    departments: { id: number; name: string }[];
    superadmin: boolean;
    busy?: boolean;
    onplacement: (patch: { showOnMain?: boolean; departmentId?: number | null }) => void;
  } = $props();
</script>

<section aria-label="Slide settings" class="space-y-4">
  <h3 class="text-sm font-bold text-foreground">Slide</h3>

  <ImageField
    bind:file
    id="slide-image"
    label="Slide image"
    required={!savedImageUrl}
    existingUrl={savedImageUrl}
    aspectRatio={16 / 9}
    cropTitle="Crop Slide Image (16:9)"
    hint="PNG, JPG, WebP or GIF (max 5 MB)"
    fit="cover"
    error={imageError}
  />

  <fieldset class="space-y-3 rounded-lg border border-border bg-surface-alt p-3">
    <legend class="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Where it appears</legend>
    <label class="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={showOnMain}
        disabled={busy}
        onchange={(event) => onplacement({ showOnMain: event.currentTarget.checked })}
        class="mt-0.5 h-4 w-4 rounded border-border-strong accent-brand-800"
      />
      <span class="flex flex-col">
        <span class="text-sm font-semibold text-foreground">Display on the main page</span>
        <span class="text-xs text-muted-foreground">Show this slide in the home page carousel.</span>
      </span>
    </label>
    <div>
      <label for="slide-department" class="mb-1 block text-sm font-semibold text-foreground">Department page</label>
      <select
        id="slide-department"
        class={inputClass}
        value={departmentId === null ? '' : String(departmentId)}
        disabled={!superadmin || busy}
        onchange={(event) => onplacement({ departmentId: event.currentTarget.value ? Number(event.currentTarget.value) : null })}
      >
        {#if superadmin}<option value="">None (main page only)</option>{/if}
        {#each departments as department (department.id)}
          <option value={String(department.id)}>{department.name}</option>
        {/each}
      </select>
    </div>
  </fieldset>
</section>
