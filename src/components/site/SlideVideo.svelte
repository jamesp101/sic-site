<script lang="ts">
  import type { SlideVideoView } from '@/lib/content-types';

  let {
    video,
    play,
  }: {
    video: SlideVideoView;
    /** Whether the video should be running: its slide is the active one and nothing paused it. */
    play: boolean;
  } = $props();

  const ORIGIN = 'https://www.youtube-nocookie.com';

  let el = $state<HTMLVideoElement | null>(null);
  let frame = $state<HTMLIFrameElement | null>(null);
  let frameLoaded = $state(false);
  /** The picture stays hidden (the slide photo is the poster) until the video is actually playing. */
  let ready = $state(false);

  // Uploaded file: play or pause with the carousel; a blocked autoplay simply leaves the poster up.
  $effect(() => {
    if (!el) return;
    if (play) el.play().catch(() => {});
    else el.pause();
  });

  const command = (func: string) =>
    frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: '' }), ORIGIN);

  // YouTube: the embed API is driven with postMessage (enablejsapi=1), no script is loaded.
  $effect(() => {
    if (!frameLoaded) return;
    command(play ? 'playVideo' : 'pauseVideo');
  });

  function onFrameLoad() {
    frameLoaded = true;
    // Ask the player to report its state so the poster can be dropped once it really plays.
    frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), ORIGIN);
  }

  function onmessage(event: MessageEvent) {
    if (event.origin !== ORIGIN || event.source !== frame?.contentWindow || typeof event.data !== 'string') return;
    try {
      const data = JSON.parse(event.data) as { event?: string; info?: unknown };
      const state =
        data.event === 'onStateChange'
          ? data.info
          : data.event === 'infoDelivery' && data.info && typeof data.info === 'object'
            ? (data.info as { playerState?: unknown }).playerState
            : undefined;
      if (state === 1) ready = true;
    } catch {
      // Not a player message.
    }
  }

  const embed = $derived(
    video.kind === 'youtube'
      ? `${ORIGIN}/embed/${video.id}?autoplay=1&mute=1&loop=1&playlist=${video.id}&controls=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&iv_load_policy=3&fs=0&enablejsapi=1`
      : ''
  );
</script>

<svelte:window {onmessage} />

<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 {ready ? 'opacity-100' : 'opacity-0'}">
  {#if video.kind === 'file'}
    <video
      bind:this={el}
      muted
      loop
      playsinline
      preload="metadata"
      disablepictureinpicture
      disableremoteplayback
      tabindex="-1"
      class="slide-vid absolute inset-0 h-full w-full object-cover"
      onplaying={() => (ready = true)}
    >
      <source src={video.src} type={video.mime} />
    </video>
  {:else}
    <iframe
      bind:this={frame}
      src={embed}
      title="Background video"
      tabindex="-1"
      allow="autoplay; encrypted-media"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin"
      class="slide-yt pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 border-0"
      onload={onFrameLoad}
    ></iframe>
  {/if}
</div>
