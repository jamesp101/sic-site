<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';
  import { Input } from '@/components/ui/input';
  import { cn } from '@/lib/utils';

  let { class: className = '', value = $bindable(''), ...rest } = $props();

  let showPassword = $state(false);
</script>

<div class="relative">
  <Input type={showPassword ? 'text' : 'password'} class={cn('pr-10', className)} bind:value {...rest} />
  <button
    type="button"
    onclick={() => (showPassword = !showPassword)}
    class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
    aria-label={showPassword ? 'Hide password' : 'Show password'}
    aria-pressed={showPassword}
  >
    {#if showPassword}
      <EyeOff class="size-4" aria-hidden="true" />
    {:else}
      <Eye class="size-4" aria-hidden="true" />
    {/if}
  </button>
</div>
