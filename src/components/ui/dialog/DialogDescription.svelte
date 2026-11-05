<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getContext, onMount } from 'svelte';
    import { DIALOG_CONTEXT, type DialogContext } from './context';

    let { children }: { children?: Snippet } = $props();

    const { descriptionId, registerDescription } = getContext<DialogContext>(DIALOG_CONTEXT);

    onMount(registerDescription);
</script>

<p id={descriptionId} class="text-sm text-muted-foreground">
    {@render children?.()}
</p>
