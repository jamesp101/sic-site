<script lang="ts">
    import { untrack } from 'svelte';
    // cropperjs defines custom elements at import time; load it in the browser only (SSR has no HTMLElement).
    import type Cropper from 'cropperjs';
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
        outputType = 'image/jpeg',
        outputQuality = 0.9,
        isUploading = false,
    }: {
        imageSrc: string | null;
        aspectRatio?: number;
        onCrop?: (file: File, previewUrl: string) => void;
        onCancel?: () => void;
        outputType?: string;
        outputQuality?: number;
        isUploading?: boolean;
    } = $props();

    let imageEl = $state<HTMLImageElement | null>(null);
    let isReady = $state(false);
    let isProcessing = $state(false);
    let imageLoadError = $state(false);

    // Use a constant object reference container for the CropperJS instance
    // to completely prevent Svelte 5 compiler from wrapping it in $.get() signals.
    const cropperRef = { instance: null as Cropper | null };

    let currentZoom = $state(100);
    let currentRotation = $state(0);
    let scaleX = $state(1);
    let scaleY = $state(1);
    let activeAspectRatio = $state<number | null>(untrack(() => aspectRatio ?? null));
    let activeTab = $state<'transform' | 'aspect'>('transform');

    // Preset Aspect Ratios
    const aspectPresets = [
        { label: 'Free', value: null, icon: SlidersHorizontal },
        { label: '1:1', value: 1, icon: Square },
        { label: '16:9', value: 16 / 9, icon: Tv },
        { label: '4:3', value: 4 / 3, icon: Monitor },
        { label: '3:2', value: 3 / 2, icon: Monitor },
        { label: '9:16', value: 9 / 16, icon: Smartphone },
    ];

    function destroyCropper() {
        if (cropperRef.instance) {
            cropperRef.instance.destroy();
            cropperRef.instance = null;
        }
        isReady = false;
    }

    async function initCropper() {
        if (!imageEl || !imageSrc) return;

        destroyCropper();

        currentZoom = 100;
        currentRotation = 0;
        scaleX = 1;
        scaleY = 1;

        try {
            const { default: CropperClass } = await import('cropperjs');
            if (!imageEl) return;
            const cropper = new CropperClass(imageEl, {
                container: imageEl.parentElement ?? undefined,
            });
            cropperRef.instance = cropper;

            const cropperCanvas = cropper.getCropperCanvas();
            if (cropperCanvas) {
                cropperCanvas.themeColor = getComputedStyle(document.documentElement).getPropertyValue('--gold-500').trim();
            }

            const cropperSelection = cropper.getCropperSelection();
            if (cropperSelection) {
                if (activeAspectRatio !== null && activeAspectRatio !== undefined && !isNaN(activeAspectRatio)) {
                    cropperSelection.aspectRatio = activeAspectRatio;
                } else {
                    cropperSelection.aspectRatio = 0;
                }
            }

            const cropperImage = cropper.getCropperImage();
            if (cropperImage) {
                cropperImage.$ready().then(() => {
                    isReady = true;
                }).catch((err) => {
                    console.error('Cropper image ready error:', err);
                    imageLoadError = true;
                });
            } else {
                isReady = true;
            }
        } catch (err) {
            console.error('Cropper initialization error:', err);
            imageLoadError = true;
        }
    }

    function handleImageLoad() {
        imageLoadError = false;
        requestAnimationFrame(() => {
            void initCropper();
        });
    }

    function handleImageError() {
        imageLoadError = true;
        isReady = false;
    }

    $effect(() => {
        const src = imageSrc;
        if (src) {
            untrack(() => {
                isReady = false;
                imageLoadError = false;
                if (imageEl && imageEl.complete && imageEl.naturalWidth > 0) {
                    handleImageLoad();
                }
            });
        }

        return () => {
            untrack(() => {
                destroyCropper();
            });
        };
    });

    // Synchronize aspect ratio when selection changes
    $effect(() => {
        const ratio = activeAspectRatio;
        if (isReady && cropperRef.instance) {
            untrack(() => {
                const selection = cropperRef.instance?.getCropperSelection();
                if (selection) {
                    selection.aspectRatio = (ratio !== null && ratio !== undefined && !isNaN(ratio)) ? ratio : 0;
                }
            });
        }
    });

    // Zoom handlers
    function handleZoomIn() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                img.$zoom(0.1);
                currentZoom = Math.round(currentZoom * 1.1);
            }
        }
    }

    function handleZoomOut() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                img.$zoom(-0.1);
                currentZoom = Math.max(10, Math.round(currentZoom * 0.9));
            }
        }
    }

    function handleZoomSliderChange(e: Event) {
        const val = Number((e.target as HTMLInputElement).value);
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                const delta = (val - currentZoom) / currentZoom;
                img.$zoom(delta);
                currentZoom = val;
            }
        }
    }

    // Rotation handlers
    function handleRotateCcw() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                img.$rotate('-90deg');
                currentRotation = (currentRotation - 90) % 360;
            }
        }
    }

    function handleRotateCw() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                img.$rotate('90deg');
                currentRotation = (currentRotation + 90) % 360;
            }
        }
    }

    function handleRotateSliderChange(e: Event) {
        const deg = Number((e.target as HTMLInputElement).value);
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                const diff = deg - currentRotation;
                img.$rotate(`${diff}deg`);
                currentRotation = deg;
            }
        }
    }

    // Flip handlers
    function handleFlipH() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                scaleX = scaleX === 1 ? -1 : 1;
                img.$scale(-1, 1);
            }
        }
    }

    function handleFlipV() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            if (img) {
                scaleY = scaleY === 1 ? -1 : 1;
                img.$scale(1, -1);
            }
        }
    }

    // Fit / Reset handler
    function handleFitReset() {
        if (cropperRef.instance && isReady) {
            const img = cropperRef.instance.getCropperImage();
            const selection = cropperRef.instance.getCropperSelection();
            if (img) {
                img.$resetTransform();
                img.$center();
            }
            if (selection) {
                selection.$reset();
                selection.aspectRatio = (activeAspectRatio !== null && activeAspectRatio !== undefined && !isNaN(activeAspectRatio)) ? activeAspectRatio : 0;
            }
            scaleX = 1;
            scaleY = 1;
            currentRotation = 0;
            currentZoom = 100;
        }
    }

    // Aspect ratio handler
    function setAspectRatio(ratio: number | null) {
        activeAspectRatio = ratio;
    }

    // Apply crop & output File
    async function handleApplyCrop() {
        if (!cropperRef.instance || !isReady || isProcessing || isUploading) return;

        isProcessing = true;

        try {
            const selection = cropperRef.instance.getCropperSelection();
            if (!selection) {
                throw new Error('No crop selection found');
            }

            const canvas = await selection.$toCanvas();

            if (!canvas) {
                throw new Error('Failed to render cropped canvas');
            }

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        isProcessing = false;
                        return;
                    }

                    const ext = outputType === 'image/png' ? 'png' : 'jpg';
                    const file = new File([blob], `cropped_image_${Date.now()}.${ext}`, { type: outputType });
                    const previewUrl = URL.createObjectURL(blob);

                    isProcessing = false;
                    onCrop?.(file, previewUrl);
                },
                outputType,
                outputQuality
            );
        } catch (error) {
            console.error('Error during image cropping:', error);
            isProcessing = false;
        }
    }
</script>

<div class="flex h-full w-full flex-col gap-4">
    <!-- Image Canvas Area -->
    <div class="cropper-container-wrapper relative h-[480px] w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/90 shadow-inner flex items-center justify-center">
        <!-- Error State -->
        {#if imageLoadError}
            <div class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-950/90 p-4 text-center gap-2">
                <AlertCircle class="h-8 w-8 text-red-500" />
                <span class="text-sm font-semibold text-neutral-200">Failed to load image</span>
                <span class="text-xs text-neutral-400">Please select a valid image file and try again.</span>
            </div>
        {:else if !isReady || isUploading || isProcessing}
            <!-- Loading State Overlay -->
            <div class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-950/80 backdrop-blur-sm gap-3 p-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 border border-gold-500/20 text-gold-500 shadow-lg">
                    {#if isUploading}
                        <Upload class="h-6 w-6 animate-bounce text-gold-400" />
                    {:else}
                        <Loader2 class="h-6 w-6 animate-spin text-gold-500" />
                    {/if}
                </div>
                <div class="flex flex-col items-center text-center">
                    <span class="text-sm font-semibold text-neutral-100">
                        {#if isUploading}
                            Uploading image...
                        {:else if isProcessing}
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
                onclick={handleFitReset}
                disabled={!isReady || isUploading || isProcessing}
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
                        <span class="font-mono text-xs text-gold-400/90 bg-gold-500/10 px-1.5 py-0.5 rounded border border-gold-500/20">{currentZoom}%</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            onclick={handleZoomOut}
                            disabled={!isReady || isUploading || isProcessing}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut class="h-3.5 w-3.5" />
                        </button>
                        <input
                            type="range"
                            min="10"
                            max="300"
                            value={currentZoom}
                            oninput={handleZoomSliderChange}
                            disabled={!isReady || isUploading || isProcessing}
                            class="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-gold-500 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onclick={handleZoomIn}
                            disabled={!isReady || isUploading || isProcessing}
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
                        <span class="font-mono text-xs text-gold-400/90 bg-gold-500/10 px-1.5 py-0.5 rounded border border-gold-500/20">{currentRotation}°</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button
                            type="button"
                            onclick={handleRotateCcw}
                            disabled={!isReady || isUploading || isProcessing}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Rotate 90° CCW"
                        >
                            <RotateCcw class="h-3.5 w-3.5" />
                        </button>
                        <input
                            type="range"
                            min="-180"
                            max="180"
                            value={currentRotation}
                            oninput={handleRotateSliderChange}
                            disabled={!isReady || isUploading || isProcessing}
                            class="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-gold-500 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onclick={handleRotateCw}
                            disabled={!isReady || isUploading || isProcessing}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                            title="Rotate 90° CW"
                        >
                            <RotateCw class="h-3.5 w-3.5" />
                        </button>
                        <div class="h-4 w-px bg-neutral-800 mx-0.5"></div>
                        <button
                            type="button"
                            onclick={handleFlipH}
                            disabled={!isReady || isUploading || isProcessing}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors {scaleX === -1 ? 'text-gold-400 bg-neutral-700' : ''}"
                            title="Flip Horizontal"
                        >
                            <FlipHorizontal class="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onclick={handleFlipV}
                            disabled={!isReady || isUploading || isProcessing}
                            class="rounded-md p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors {scaleY === -1 ? 'text-gold-400 bg-neutral-700' : ''}"
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
                        onclick={() => setAspectRatio(preset.value)}
                        disabled={!isReady || isUploading || isProcessing}
                        class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition-all disabled:opacity-50 {activeAspectRatio === preset.value ? 'border-gold-500/50 bg-gold-500/10 text-gold-400 shadow-sm' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'}"
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
                disabled={isProcessing || isUploading}
                class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
            >
                <X class="h-4 w-4" />
                Cancel
            </button>
        {/if}

        <button
            type="button"
            onclick={handleApplyCrop}
            disabled={!isReady || isProcessing || isUploading}
            class="inline-flex items-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2 text-xs font-semibold text-neutral-950 shadow-md hover:bg-gold-400 transition-colors disabled:opacity-50"
        >
            {#if isUploading}
                <Loader2 class="h-4 w-4 animate-spin text-neutral-950" />
                Uploading...
            {:else if isProcessing}
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

