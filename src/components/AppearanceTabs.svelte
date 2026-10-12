<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { initializeTheme, themeState } from '@/lib/theme.svelte';
  import type { Appearance } from '@/types';

  const { appearance, updateAppearance } = themeState();

  const tabs: { value: Appearance; Icon: typeof Sun; label: string }[] = [
    { value: 'light', Icon: Sun, label: 'Light' },
    { value: 'dark', Icon: Moon, label: 'Dark' },
    { value: 'system', Icon: Monitor, label: 'System' },
  ];

  onMount(() => initializeTheme());
</script>

<div role="radiogroup" aria-label="Theme" class="inline-flex gap-1 rounded-lg bg-muted p-1">
  {#each tabs as { value, Icon, label } (value)}
    <button
      type="button"
      role="radio"
      aria-checked={appearance.value === value}
      onclick={() => updateAppearance(value)}
      class="flex items-center rounded-md px-3.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {appearance.value ===
      value
        ? 'bg-card text-card-foreground shadow-brand-sm'
        : 'text-muted-foreground hover:text-foreground'}"
    >
      <Icon class="size-4" aria-hidden="true" />
      <span class="ml-1.5">{label}</span>
    </button>
  {/each}
</div>
