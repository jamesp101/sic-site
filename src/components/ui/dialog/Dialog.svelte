<script lang="ts">
    import type { Snippet } from 'svelte';
    import { setContext } from 'svelte';
    import { DIALOG_CONTEXT, type DialogContext } from './context';

    let {
        open = $bindable(false),
        onOpenChange,
        children,
    }: { open?: boolean; onOpenChange?: (value: boolean) => void; children?: Snippet } = $props();

    const id = $props.id();
    let descriptions = $state(0);

    const context: DialogContext = {
        open: () => open,
        setOpen: (value: boolean) => {
            open = value;
            onOpenChange?.(value);
        },
        titleId: `${id}-title`,
        descriptionId: `${id}-description`,
        hasDescription: () => descriptions > 0,
        registerDescription: () => {
            descriptions += 1;
            return () => {
                descriptions -= 1;
            };
        },
    };

    setContext(DIALOG_CONTEXT, context);
</script>

{@render children?.()}
