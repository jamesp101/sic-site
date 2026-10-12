<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import { cn } from '@/lib/utils';

  let { href, class: className = '', children, ...rest }: HTMLAnchorAttributes & { children?: Snippet } = $props();
</script>

<a {href} class={cn('text-link underline decoration-border-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-current', className)} {...rest}>
  {@render children?.()}
</a>
