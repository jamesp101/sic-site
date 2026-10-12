<script lang="ts">
  import { ChevronDown, ExternalLink, Eye, EyeOff, School } from '@lucide/svelte';

  let {
    label = 'Link Label',
    url = '/path',
    isActive = true,
    parentLabel = '',
  }: {
    label?: string;
    url?: string;
    isActive?: boolean;
    parentLabel?: string;
  } = $props();
</script>

<div class="space-y-3 rounded-xl border border-border-strong bg-surface p-4 shadow-brand-sm">
  <div class="flex items-center justify-between">
    <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live header preview</span>
    {#if isActive}
      <span class="inline-flex items-center gap-1 rounded-full bg-status-event-bg px-2 py-0.5 text-xs font-semibold text-status-event-fg">
        <Eye class="h-3 w-3" aria-hidden="true" /> Visible
      </span>
    {:else}
      <span class="inline-flex items-center gap-1 rounded-full bg-file-other-bg px-2 py-0.5 text-xs font-semibold text-file-other-fg">
        <EyeOff class="h-3 w-3" aria-hidden="true" /> Hidden
      </span>
    {/if}
  </div>

  <div class="rounded-lg border border-border bg-surface-alt p-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="flex h-7 w-7 items-center justify-center rounded bg-brand-800 text-white">
          <School class="h-4 w-4" aria-hidden="true" />
        </div>
        <span class="text-xs font-bold text-brand-800 dark:text-gold-400">San Isidro College</span>
      </div>

      <div class="flex items-center gap-4 text-xs">
        <span class="hidden text-muted-foreground sm:inline">Home</span>

        {#if parentLabel}
          <div class="relative flex items-center gap-1 border-b-2 border-gold-500 pb-0.5 font-semibold text-link">
            <span>{parentLabel}</span>
            <ChevronDown class="h-3 w-3" aria-hidden="true" />
            <div class="absolute left-0 top-full mt-1 w-36 rounded-md border border-border-strong bg-popover p-1.5 shadow-brand-md">
              <div class="flex items-center justify-between rounded bg-brand-50 px-2 py-1 text-xs font-bold text-brand-800">
                <span class="truncate">{label || 'Untitled'}</span>
                <ExternalLink class="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
              </div>
            </div>
          </div>
        {:else}
          <div class="flex items-center gap-1 border-b-2 border-gold-500 pb-0.5 font-bold text-brand-800 dark:text-gold-400">
            <span>{label || 'Untitled Link'}</span>
          </div>
        {/if}

        <span class="hidden text-muted-foreground sm:inline">Contact</span>
      </div>
    </div>
  </div>

  <div class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
    <span class="font-semibold">Target:</span>
    <span class="truncate text-link">{url || '/'}</span>
  </div>
</div>
