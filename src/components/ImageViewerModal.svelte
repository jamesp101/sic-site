<script lang="ts">
    import { X, ZoomIn, Download } from '@lucide/svelte';

    let {
        isOpen = false,
        imageSrc = null,
        title = 'Image Preview',
        onClose,
    }: {
        isOpen: boolean;
        imageSrc: string | null;
        title?: string;
        onClose: () => void;
    } = $props();
</script>

{#if isOpen && imageSrc}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
        <div class="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-neutral-950 overflow-hidden shadow-2xl border border-neutral-800">
            <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-850 bg-neutral-900/50">
                <div class="flex items-center gap-2 text-white font-semibold text-sm">
                    <ZoomIn class="h-4 w-4 text-gold-500" />
                    <span>{title}</span>
                </div>
                <div class="flex items-center gap-2">
                    <a 
                        href={imageSrc} 
                        download="uploaded-image.jpg"
                        target="_blank" 
                        class="rounded-lg p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800"
                        title="Open/Download original"
                    >
                        <Download class="h-4 w-4" />
                    </a>
                    <button 
                        type="button" 
                        onclick={onClose}
                        class="rounded-lg p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800"
                        title="Close preview"
                    >
                        <X class="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950/80">
                <img 
                    src={imageSrc} 
                    alt={title} 
                    class="max-h-[75vh] w-auto rounded-xl object-contain shadow-lg border border-neutral-850"
                />
            </div>
        </div>
    </div>
{/if}
