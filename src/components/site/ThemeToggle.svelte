<script lang="ts">
  import { Moon, Sun } from '@lucide/svelte';
  import { onMount } from 'svelte';

  let mounted = $state(false);
  let dark = $state(false);

  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
    mounted = true;

    // Follow OS changes while the visitor has not chosen explicitly.
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const stored = localStorage.getItem('appearance');
      if (stored === 'light' || stored === 'dark') return;
      apply(media.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  });

  function apply(next: boolean) {
    dark = next;
    document.documentElement.classList.toggle('dark', next);
    document.documentElement.style.colorScheme = next ? 'dark' : 'light';
  }

  function toggle() {
    apply(!dark);
    localStorage.setItem('appearance', dark ? 'dark' : 'light');
  }
</script>

<button
  type="button"
  onclick={toggle}
  aria-label="Dark mode"
  aria-pressed={mounted ? dark : undefined}
  inert={!mounted}
  class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white transition-colors hover:bg-white/10 hover:text-gold-300"
  class:invisible={!mounted}
>
  <Sun class="hidden h-[18px] w-[18px] dark:block" aria-hidden="true" />
  <Moon class="h-[18px] w-[18px] dark:hidden" aria-hidden="true" />
</button>
