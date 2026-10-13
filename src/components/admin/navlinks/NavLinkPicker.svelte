<script lang="ts">
  import type { LinkSuggestion } from '@/lib/nav-tree';
  import { inputClass } from '../shared/form-utils';

  let {
    id,
    value = $bindable(''),
    suggestions,
    invalid = false,
    describedBy,
    onpick,
  }: {
    id: string;
    value: string;
    suggestions: LinkSuggestion[];
    invalid?: boolean;
    describedBy?: string;
    onpick: (suggestion: LinkSuggestion) => void;
  } = $props();

  const listId = $derived(`${id}-listbox`);
  const optionId = (index: number) => `${id}-option-${index}`;

  let open = $state(false);
  let active = $state(-1);
  let list = $state<HTMLElement | null>(null);

  const results = $derived.by(() => {
    const query = value.trim().toLowerCase();
    return query
      ? suggestions.filter((s) => s.label.toLowerCase().includes(query) || s.url.toLowerCase().includes(query))
      : suggestions;
  });
  /** Flat option order equals the visual order: groups appear in first-seen order. */
  const groups = $derived.by(() => {
    const order: LinkSuggestion['group'][] = [];
    for (const s of results) if (!order.includes(s.group)) order.push(s.group);
    let index = 0;
    return order.map((name) => ({
      name,
      items: results.filter((s) => s.group === name).map((s) => ({ ...s, index: index++ })),
    }));
  });
  const flat = $derived(groups.flatMap((g) => g.items));
  const expanded = $derived(open && flat.length > 0);

  function pick(suggestion: LinkSuggestion) {
    value = suggestion.url;
    onpick(suggestion);
    open = false;
    active = -1;
  }

  function move(delta: 1 | -1) {
    if (flat.length === 0) return;
    const last = flat.length - 1;
    if (!open || active === -1) active = delta === 1 ? 0 : last;
    else active = (active + delta + flat.length) % flat.length;
    open = true;
    queueMicrotask(() => list?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' }));
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter':
        if (expanded && active >= 0 && flat[active]) {
          event.preventDefault();
          pick(flat[active]);
        }
        break;
      case 'Escape':
        if (open) {
          // Close the list first; a second Escape reaches the form and cancels it.
          event.preventDefault();
          event.stopPropagation();
          open = false;
          active = -1;
        }
        break;
      case 'Tab':
        open = false;
        break;
    }
  }
</script>

<div class="relative">
  <input
    {id}
    type="text"
    required
    maxlength="255"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    role="combobox"
    aria-autocomplete="list"
    aria-haspopup="listbox"
    aria-expanded={expanded}
    aria-controls={listId}
    aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
    aria-invalid={invalid || undefined}
    aria-describedby={describedBy}
    bind:value
    class={inputClass}
    placeholder="/posts, or start typing a page, department or post"
    oninput={() => {
      open = true;
      active = -1;
    }}
    onfocus={() => (open = true)}
    onclick={() => (open = true)}
    onblur={() => {
      open = false;
      active = -1;
    }}
    onkeydown={onKeydown}
  />
  <!-- Options keep input focus: mousedown is cancelled so blur does not close the list before the click. -->
  <div
    id={listId}
    bind:this={list}
    role="listbox"
    aria-label="Suggestions"
    hidden={!expanded}
    class="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-popover p-1 text-popover-foreground shadow-brand-lg"
  >
    {#each groups as group (group.name)}
      <div role="group" aria-labelledby={`${id}-group-${group.name}`}>
        <div id={`${id}-group-${group.name}`} class="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {group.name}
        </div>
        {#each group.items as item (item.url)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id={optionId(item.index)}
            role="option"
            tabindex="-1"
            aria-selected={active === item.index}
            class="flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm {active === item.index
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-surface-alt'}"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => pick(item)}
          >
            <span class="min-w-0 truncate font-medium">{item.label}</span>
            <span class="shrink-0 font-mono text-xs text-muted-foreground">{item.url}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
