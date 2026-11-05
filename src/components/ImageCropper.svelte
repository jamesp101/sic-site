<script lang="ts">
    import { untrack } from 'svelte';
    import { IMAGE_TARGETS, type ImageTarget } from '@/lib/image-compress';
    import { CropSession } from '@/lib/crop-session';
    import { createCropperjsAdapter } from '@/lib/cropperjs-adapter';
    import {
        ZoomIn,
        ZoomOut,
        RotateCcw,
        RotateCw,
        FlipHorizontal,
        FlipVertical,
        Maximize,
        Check,
        X,
        Loader2,
        SlidersHorizontal,
        Square,
        Monitor,
        Tv,
        Smartphone,
        Upload,
        AlertCircle
    } from '@lucide/svelte';

    let {
        imageSrc = null,
        aspectRatio = undefined,
        onCrop,
        onCancel,
        target = IMAGE_TARGETS.content,
        isUploading = false,
    }: {
        imageSrc: string | null;
        aspectRatio?: number;
        onCrop?: (file: File, previewUrl: string) => void;
        onCancel?: () => void;
        /** Output box and WebP quality for the cropped file. */
        target?: ImageTarget;
        isUploading?: boolean;
    } = $props();

    let imageEl = $state<HTMLImageElement | null>(null);
    let activeTab = $state<'transform' | 'aspect'>('transform');

    const session = new CropSession({ target: untrack(() => target), initialAspect: untrack(() => aspectRatio) });
    let view = $state(session.state);
    $effect(() => session.subscribe(() => (view = session.state)));
    $effect(() => {
        session.target = target;
    });
    $effect(() => {
        session.setUploading(isUploading);
    });

    // Preset Aspect Ratios
    const aspectPresets = [
        { label: 'Free', value: null, icon: SlidersHorizontal },
        { label: '1:1', value: 1, icon: Square },
        { label: '16:9', value: 16 / 9, icon: Tv },
        { label: '4:3', value: 4 / 3, icon: Monitor },
        { label: '3:2', value: 3 / 2, icon: Monitor },
        { label: '9:16', value: 9 / 16, icon: Smartphone },
    ];

    async function initCropper() {
        if (!imageEl || !imageSrc) return;
        session.begin();
        try {
            const { adapter, ready } = await createCropperjsAdapter(imageEl);
            if (!imageEl) {
                adapter.destroy();
                return;
            }
            session.attach(adapter);
            ready.then(() => session.markReady()).catch((err) => {
                console.error('Cropper image ready error:', err);
                session.fail();
            });
        } catch (err) {
            console.error('Cropper initialization error:', err);
            session.fail();
        }
    }

    function handleImageLoad() {
        requestAnimationFrame(() => {
            void initCropper();
        });
    }

    function handleImageError() {
        session.release();
        session.fail();
    }

    $effect(() => {
        const src = imageSrc;
        if (src) {
            untrack(() => {
                session.begin();
                if (imageEl && imageEl.complete && imageEl.naturalWidth > 0) {
                    handleImageLoad();
                }
            });
        }

        return () => {
            untrack(() => {
                session.release();
            });
        };
    });

    async function handleApplyCrop() {
        const result = await session.crop();
        if (result) onCrop?.(result.file, URL.createObjectURL(result.file));
    }
</script>

<div class="flex h-full w-full flex-col gap-4">
    <!-- Image Canvas Area -->
    <div class="cropper-container-wrapper relative h-[480px] w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/90 shadow-inner flex items-center justify-center">
        <!-- Error State -->
        {#if view.status === 'error'}
            <div class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-950/90 p-4 text-center gap-2">
                <AlertCircle class="h-8 w-8 text-red-500" />
                <span class="text-sm font-semibold text-neutral-200">Failed to load image</span>
                <span class="text-xs text-neutral-400">Please select a valid image file and try again.</span>
            </div>
        {:else if view.showOverlay}
            <!-- Loading State Overlay -->
            <div class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-950/80 backdrop-blur-sm gap-3 p-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 border border-gold-500/20 text-gold-500 shadow-lg">
                    {#if view.isUploading}
                        <Upload class="h-6 w-6 animate-bounce text-gold-400" />
                    {:else}
                        <Loader2 class="h-6 w-6 animate-spin text-gold-500" />
                    {/if}
                </div>
                <div class="flex flex-col items-center text-center">
                    <span class="text-sm font-semibold text-neutral-100">
                        {#if view.isUploading}
                            Uploading image...
                        {:else if view.isProcessing}
                            Processing cropped image...
                        {:else}
                            Loading image editor...
                        {/if}
                    </span>
                    <span class="text-xs text-neutral-400 mt-0.5">Please wait a moment</span>
                </div>
            </div>
        {/if}

        <img
            bind:this={imageEl}
            src={imageSrc || ''}
            alt="Target to crop"
            onload={handleImageLoad}
            onerror={handleImageError}
            class="max-h-full max-w-full block"
        />
    </div>

    <!-- Toolbar Controls -->
    <div class="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 backdrop-blur-md">
        <!-- Control Tabs & Main Controls Header -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5">
            <!-- Tabs -->
            <div class="flex items-center gap-1 rounded-lg bg-neutral-950 p-1 border border-neutral-800 text-xs">
                <button
                    type="button"
                    onclick={() => activeTab = 'transform'}
                    class="rounded-md px-2.5 py-1 font-medium transition-colors {activeTab === 'transform' ? 'bg-neutral-800 text-gold-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}"
                >
                    Transform & Fit
                </button>
                <button
                    type="button"
                    onclick={() => activeTab = 'aspect'}
                    class="rounded-md px-2.5 py-1 font-medium transition-colors {activeTab === 'aspect' ? 'bg-neutral-800 text-gold-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}"
                >
                    Aspect Ratio
                </button>
            </div>

            <!-- Fit & Reset Button -->
            <button
                type="button"
                onclick={() => session.fitReset()}
                disabled={view.busy}
                class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700/60 bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-50"
                title="Fit image and reset transforms"
            >
                <Maximize class="h-3.5 w-3.5 text-gold-500" />
                <span>Fit / Reset</span>
            </button>
        </div>

        {#if activeTab === 'transform'}
            <!-- Zoom & Rotate Controls Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <!-- Zoom Controls -->
                <div class="flex flex-col gap-1.5 rounded-lg bg-neutral-950/60 p-2.5 border border-neutral-800/60">
                    <div class="flex items-center justify-between text-neutral-300">
                        <span class="font-medium flex items-center gap-1 text-neutral-400">
                            <ZoomIn class="h-3.5 w-3.5 text-gold-400" /> Zoom
                        </span>
                        <span class="font-mono text-xs text-gold-400/90 bg-gold-500/10 px-1.5 py-0.5 rounded border border-gold-500/20">{view.zoom}%</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            onclick={() => session.zoomOut()}
                            disabled={view.busy}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut class="h-3.5 w-3.5" />
                        </button>
                        <input
                            type="range"
                            min="10"
                            max="300"
                            value={view.zoom}
                            oninput={(e) => session.zoomTo(Number(e.currentTarget.value))}
                            disabled={view.busy}
                            class="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-gold-500 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onclick={() => session.zoomIn()}
                            disabled={view.busy}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn class="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                <!-- Rotation & Flip Controls -->
                <div class="flex flex-col gap-1.5 rounded-lg bg-neutral-950/60 p-2.5 border border-neutral-800/60">
                    <div class="flex items-center justify-between text-neutral-300">
                        <span class="font-medium flex items-center gap-1 text-neutral-400">
                            <RotateCw class="h-3.5 w-3.5 text-gold-400" /> Rotate & Flip
                        </span>
                        <span class="font-mono text-xs text-gold-400/90 bg-gold-500/10 px-1.5 py-0.5 rounded border border-gold-500/20">{view.rotation}°</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button
                            type="button"
                            onclick={() => session.rotate(-90)}
                            disabled={view.busy}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Rotate 90° CCW"
                        >
                            <RotateCcw class="h-3.5 w-3.5" />
                        </button>
                        <input
                            type="range"
                            min="-180"
                            max="180"
                            value={view.rotation}
                            oninput={(e) => session.rotateTo(Number(e.currentTarget.value))}
                            disabled={view.busy}
                            class="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-gold-500 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onclick={() => session.rotate(90)}
                            disabled={view.busy}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Rotate 90° CW"
                        >
                            <RotateCw class="h-3.5 w-3.5" />
                        </button>
                        <div class="h-4 w-px bg-neutral-800 mx-0.5"></div>
                        <button
                            type="button"
                            onclick={() => session.flip('x')}
                            disabled={view.busy}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors {view.scaleX === -1 ? 'text-gold-400 bg-neutral-700' : ''}"
                            title="Flip Horizontal"
                        >
                            <FlipHorizontal class="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onclick={() => session.flip('y')}
                            disabled={view.busy}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors {view.scaleY === -1 ? 'text-gold-400 bg-neutral-700' : ''}"
                            title="Flip Vertical"
                        >
                            <FlipVertical class="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        {:else}
            <!-- Aspect Ratio Selector -->
            <div class="flex flex-wrap items-center gap-2 py-1 text-xs">
                {#each aspectPresets as preset}
                    {@const Icon = preset.icon}
                    <button
                        type="button"
                        onclick={() => session.setAspect(preset.value)}
                        disabled={view.busy}
                        class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition-all disabled:opacity-50 {view.aspect === preset.value ? 'border-gold-500/50 bg-gold-500/10 text-gold-400 shadow-sm' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'}"
                    >
                        <Icon class="h-3.5 w-3.5" />
                        <span>{preset.label}</span>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Bottom Actions -->
    <div class="flex items-center justify-end gap-3 pt-1">
        {#if onCancel}
            <button
                type="button"
                onclick={onCancel}
                disabled={view.isProcessing || view.isUploading}
                class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
            >
                <X class="h-4 w-4" />
                Cancel
            </button>
        {/if}

        <button
            type="button"
            onclick={handleApplyCrop}
            disabled={view.busy}
            class="inline-flex items-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2 text-xs font-semibold text-neutral-950 shadow-md hover:bg-gold-400 transition-colors disabled:opacity-50"
        >
            {#if view.isUploading}
                <Loader2 class="h-4 w-4 animate-spin text-neutral-950" />
                Uploading...
            {:else if view.isProcessing}
                <Loader2 class="h-4 w-4 animate-spin text-neutral-950" />
                Processing...
            {:else}
                <Check class="h-4 w-4" />
                Apply Crop
            {/if}
        </button>
    </div>
</div>

<style>
    :global(.cropper-container-wrapper cropper-canvas) {
        width: 100% !important;
        height: 100% !important;
        --theme-color: var(--gold-500);
    }
</style>

