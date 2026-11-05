<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getContext } from 'svelte';
    import { DIALOG_CONTEXT, type DialogContext } from './context';

    let { children }: { children?: Snippet } = $props();

    const { titleId } = getContext<DialogContext>(DIALOG_CONTEXT);
</script>

<h2 id={titleId} class="text-lg font-semibold leading-none tracking-tight">
    {@render children?.()}
</h2>
