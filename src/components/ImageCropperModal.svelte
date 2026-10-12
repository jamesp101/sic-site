<script lang="ts">
    import ImageCropper from './ImageCropper.svelte';
    import { Crop, X } from '@lucide/svelte';

    let {
        isOpen = false,
        imageSrc = null,
        aspectRatio = undefined,
        title = 'Crop Image',
        isUploading = false,
        onCrop,
        onCancel,
    }: {
        isOpen: boolean;
        imageSrc: string | null;
        aspectRatio?: number;
        title?: string;
        isUploading?: boolean;
        onCrop: (file: File, previewUrl: string) => void;
        onCancel: () => void;
    } = $props();

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && isOpen && !isUploading) {
            onCancel();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && imageSrc}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
        <div class="relative flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
            <!-- Modal Header -->
            <div class="flex items-center justify-between border-b border-neutral-800/80 bg-neutral-900/60 px-5 py-3.5 backdrop-blur-md">
                <div class="flex items-center gap-2.5 text-neutral-100 font-semibold text-sm">
                    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/10 text-gold-500 border border-gold-500/20">
                        <Crop class="h-4 w-4" />
                    </div>
                    <span>{title}</span>
                </div>
                <button
                    type="button"
                    onclick={onCancel}
                    disabled={isUploading}
                    class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
                    title="Close cropper"
                >
                    <X class="h-5 w-5" />
                </button>
            </div>

            <!-- Modal Body -->
            <div class="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 bg-neutral-950/80">
                <ImageCropper
                    {imageSrc}
                    {aspectRatio}
                    {isUploading}
                    {onCrop}
                    {onCancel}
                />
            </div>
        </div>
    </div>
{/if}
