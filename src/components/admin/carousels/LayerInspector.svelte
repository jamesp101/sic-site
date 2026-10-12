<script lang="ts">
  import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    ArrowDown,
    ArrowUp,
    Check,
    ChevronsDown,
    ChevronsUp,
    Copy,
    Trash2,
  } from '@lucide/svelte';
  import type { ZMove } from '@/lib/carousel-editor';
  import {
    ALIGNS,
    BG_COLOR_CLASS,
    BUTTON_VARIANTS,
    COLORS,
    COLOR_LABEL,
    RADII,
    ROLES,
    ROLE_LABEL,
    SIZES,
    SIZE_LABEL,
    TYPE_LABEL,
    safeHref,
    type Align,
    type ColorKey,
    type Layer,
  } from '@/lib/carousel-overlay';
  import { inputClass, secondaryButtonClass } from '../shared/form-utils';

  let {
    layer,
    index,
    total,
    onchange,
    onmove,
    onduplicate,
    ondelete,
  }: {
    layer: Layer;
    index: number;
    total: number;
    /** `key` coalesces rapid edits of the same property into one undo step. */
    onchange: (patch: Partial<Layer>, key?: string) => void;
    onmove: (move: ZMove) => void;
    onduplicate: () => void;
    ondelete: () => void;
  } = $props();

  const set = (patch: object, key?: string) => onchange(patch as unknown as Partial<Layer>, key);
  const label = 'mb-1 block text-xs font-semibold text-foreground';
  const numberInput = `${inputClass} !px-2 !py-1.5`;
  const iconButton = `${secondaryButtonClass} !px-2 !py-1.5`;
  const alignIcons = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

  const hrefInvalid = $derived(layer.type === 'button' && layer.href !== '' && safeHref(layer.href) === null);

  function num(event: Event, fallback: number): number {
    const value = parseFloat((event.currentTarget as HTMLInputElement).value);
    return Number.isFinite(value) ? value : fallback;
  }
  function geometry(field: 'x' | 'y' | 'w' | 'h' | 'rotation', event: Event) {
    const current = (layer as unknown as Record<string, number>)[field];
    set({ [field]: num(event, current) }, field);
  }
  const radiusLabel = { none: 'Square', sm: 'Slightly rounded', md: 'Rounded', lg: 'Very rounded', full: 'Pill / circle' } as const;
</script>

{#snippet swatches(current: ColorKey, field: string)}
  <div role="group" aria-label={field} class="flex flex-wrap gap-1.5">
    {#each COLORS as color (color)}
      <button
        type="button"
        title={COLOR_LABEL[color]}
        aria-label={COLOR_LABEL[color]}
        aria-pressed={current === color}
        onclick={() => set({ color })}
        class="relative flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong {BG_COLOR_CLASS[color]} {current === color ? 'ring-2 ring-ring ring-offset-2 ring-offset-surface' : ''}"
      >
        {#if current === color}
          <Check class="h-4 w-4 {color === 'white' || color === 'gold' || color === 'sky' || color === 'surface' ? 'text-brand-950' : 'text-white'}" aria-hidden="true" />
        {/if}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet sizeSelect(current: string)}
  <div>
    <label for="layer-size" class={label}>Size</label>
    <select id="layer-size" value={current} class={inputClass} onchange={(e) => set({ size: e.currentTarget.value })}>
      {#each SIZES as size (size)}
        <option value={size}>{SIZE_LABEL[size]}</option>
      {/each}
    </select>
  </div>
{/snippet}

<section aria-label="{TYPE_LABEL[layer.type]} properties" class="space-y-4">
  <div class="flex items-center justify-between gap-2">
    <h3 class="text-sm font-bold text-foreground">{TYPE_LABEL[layer.type]}</h3>
    <div class="flex gap-1">
      <button type="button" class={iconButton} onclick={onduplicate} aria-label="Duplicate layer" title="Duplicate (Ctrl/Cmd+D)">
        <Copy class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class="{iconButton} !text-destructive" onclick={ondelete} aria-label="Delete layer" title="Delete (Delete)">
        <Trash2 class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>

  {#if layer.type === 'text'}
    <div>
      <label for="layer-text" class={label}>Text</label>
      <textarea
        id="layer-text"
        rows="3"
        maxlength="500"
        value={layer.text}
        class={inputClass}
        oninput={(e) => set({ text: e.currentTarget.value }, 'text')}
      ></textarea>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="layer-role" class={label}>Role</label>
        <select id="layer-role" value={layer.role} class={inputClass} onchange={(e) => set({ role: e.currentTarget.value })}>
          {#each ROLES as role (role)}
            <option value={role}>{ROLE_LABEL[role]}</option>
          {/each}
        </select>
      </div>
      {@render sizeSelect(layer.size)}
    </div>
    {#if layer.role === 'heading'}
      <div>
        <label for="layer-font" class={label}>Font</label>
        <select id="layer-font" value={layer.font} class={inputClass} onchange={(e) => set({ font: e.currentTarget.value })}>
          <option value="serif">Serif display</option>
          <option value="sans">Sans</option>
        </select>
      </div>
    {/if}
    <div>
      <span class={label} id="layer-align-label">Alignment</span>
      <div role="group" aria-labelledby="layer-align-label" class="flex gap-1">
        {#each ALIGNS as align (align)}
          {@const Icon = alignIcons[align as Align]}
          <button
            type="button"
            aria-label="Align {align}"
            aria-pressed={layer.align === align}
            onclick={() => set({ align })}
            class="{iconButton} {layer.align === align ? '!border-brand-600 !bg-accent' : ''}"
          >
            <Icon class="h-4 w-4" aria-hidden="true" />
          </button>
        {/each}
      </div>
    </div>
    <div>
      <span class={label}>Colour</span>
      {@render swatches(layer.color, 'Text colour')}
    </div>
  {:else if layer.type === 'button'}
    <div>
      <label for="layer-label" class={label}>Label</label>
      <input id="layer-label" type="text" maxlength="80" value={layer.label} class={inputClass} oninput={(e) => set({ label: e.currentTarget.value }, 'label')} />
    </div>
    <div>
      <label for="layer-href" class={label}>Link</label>
      <input
        id="layer-href"
        type="text"
        maxlength="500"
        value={layer.href}
        placeholder="/posts or https://…"
        class={inputClass}
        aria-invalid={hrefInvalid ? 'true' : undefined}
        aria-describedby={hrefInvalid ? 'layer-href-error' : undefined}
        oninput={(e) => set({ href: e.currentTarget.value }, 'href')}
      />
      {#if hrefInvalid}
        <p id="layer-href-error" class="mt-1 text-xs text-destructive" role="alert">Use a path such as /posts, an https:// link, mailto: or tel:.</p>
      {/if}
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="layer-variant" class={label}>Style</label>
        <select id="layer-variant" value={layer.variant} class={inputClass} onchange={(e) => set({ variant: e.currentTarget.value })}>
          {#each BUTTON_VARIANTS as variant (variant)}
            <option value={variant}>{variant === 'solid' ? 'Solid' : 'Outline'}</option>
          {/each}
        </select>
      </div>
      {@render sizeSelect(layer.size)}
    </div>
    <div>
      <span class={label}>Colour</span>
      {@render swatches(layer.color, 'Button colour')}
    </div>
  {:else if layer.type === 'badge'}
    <div>
      <label for="layer-badge" class={label}>Label</label>
      <input id="layer-badge" type="text" maxlength="80" value={layer.text} class={inputClass} oninput={(e) => set({ text: e.currentTarget.value }, 'text')} />
    </div>
    {@render sizeSelect(layer.size)}
    <div>
      <span class={label}>Colour</span>
      {@render swatches(layer.color, 'Badge colour')}
    </div>
  {:else if layer.type === 'shape'}
    <p class="text-xs text-muted-foreground">Use a panel as a scrim behind text so it stays readable on any photo.</p>
    <div>
      <span class={label}>Colour</span>
      {@render swatches(layer.color, 'Panel colour')}
    </div>
    <div>
      <label for="layer-radius" class={label}>Corners</label>
      <select id="layer-radius" value={layer.radius} class={inputClass} onchange={(e) => set({ radius: e.currentTarget.value })}>
        {#each RADII as radius (radius)}
          <option value={radius}>{radiusLabel[radius]}</option>
        {/each}
      </select>
    </div>
  {:else if layer.type === 'image'}
    <div>
      <label for="layer-alt" class={label}>Alt text <span class="text-destructive" aria-hidden="true">*</span></label>
      <input
        id="layer-alt"
        type="text"
        maxlength="200"
        required
        value={layer.alt}
        placeholder="Describe the image for screen readers"
        class={inputClass}
        aria-invalid={layer.alt.trim() === '' ? 'true' : undefined}
        oninput={(e) => set({ alt: e.currentTarget.value }, 'alt')}
      />
      {#if layer.alt.trim() === ''}
        <p class="mt-1 text-xs text-destructive">Required. Describe the logo or image.</p>
      {/if}
    </div>
    <div>
      <label for="layer-radius" class={label}>Corners</label>
      <select id="layer-radius" value={layer.radius} class={inputClass} onchange={(e) => set({ radius: e.currentTarget.value })}>
        {#each RADII as radius (radius)}
          <option value={radius}>{radiusLabel[radius]}</option>
        {/each}
      </select>
    </div>
  {/if}

  <fieldset class="space-y-3 rounded-lg border border-border bg-surface-alt p-3">
    <legend class="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Position &amp; size (%)</legend>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="layer-x" class={label}>X</label>
        <input id="layer-x" type="number" min="0" max="100" step="0.5" value={Math.round(layer.x * 10) / 10} class={numberInput} oninput={(e) => geometry('x', e)} />
      </div>
      <div>
        <label for="layer-y" class={label}>Y</label>
        <input id="layer-y" type="number" min="0" max="100" step="0.5" value={Math.round(layer.y * 10) / 10} class={numberInput} oninput={(e) => geometry('y', e)} />
      </div>
      {#if 'w' in layer}
        <div>
          <label for="layer-w" class={label}>Width</label>
          <input id="layer-w" type="number" min="1" max="100" step="0.5" value={Math.round(layer.w * 10) / 10} class={numberInput} oninput={(e) => geometry('w', e)} />
        </div>
      {/if}
      {#if 'h' in layer}
        <div>
          <label for="layer-h" class={label}>Height</label>
          <input id="layer-h" type="number" min="1" max="100" step="0.5" value={Math.round(layer.h * 10) / 10} class={numberInput} oninput={(e) => geometry('h', e)} />
        </div>
      {/if}
      <div>
        <label for="layer-rotation" class={label}>Rotation (°)</label>
        <input id="layer-rotation" type="number" min="-180" max="180" step="1" value={layer.rotation} class={numberInput} oninput={(e) => geometry('rotation', e)} />
      </div>
      <div>
        <label for="layer-opacity" class={label}>Opacity ({layer.opacity}%)</label>
        <input
          id="layer-opacity"
          type="range"
          min="10"
          max="100"
          step="5"
          value={layer.opacity}
          class="h-8 w-full accent-brand-800"
          oninput={(e) => onchange({ opacity: Math.round(num(e, layer.opacity)) }, 'opacity')}
        />
      </div>
    </div>
  </fieldset>

  <div>
    <span class={label} id="layer-order-label">Stacking order</span>
    <div role="group" aria-labelledby="layer-order-label" class="grid grid-cols-4 gap-1">
      <button type="button" class={iconButton} onclick={() => onmove('front')} disabled={index === total - 1} aria-label="Bring to front" title="Bring to front">
        <ChevronsUp class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={iconButton} onclick={() => onmove('forward')} disabled={index === total - 1} aria-label="Bring forward" title="Bring forward">
        <ArrowUp class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={iconButton} onclick={() => onmove('backward')} disabled={index === 0} aria-label="Send backward" title="Send backward">
        <ArrowDown class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={iconButton} onclick={() => onmove('back')} disabled={index === 0} aria-label="Send to back" title="Send to back">
        <ChevronsDown class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</section>
