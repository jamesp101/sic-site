<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getContext } from 'svelte';
    import { cn } from '@/lib/utils';
    import { DIALOG_CONTEXT, type DialogContext } from './context';
    import { focusScope } from './focus-scope';

    let { class: className = '', children }: { class?: string; children?: Snippet } = $props();

    const { open, setOpen } = getContext<DialogContext>(DIALOG_CONTEXT);

    const close = () => setOpen(false);
</script>

{#if open()}
    <div class="fixed inset-0 z-50 flex items-center justify-center">
        <button
            type="button"
            class="fixed inset-0 bg-black/50"
            tabindex="-1"
            aria-label="Close"
            onclick={close}
        ></button>
        <div
            class={cn(
                'relative z-10 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg',
                className,
            )}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            use:focusScope
        >
            {@render children?.()}
        </div>
    </div>
{/if}
