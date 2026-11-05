// Runs inline in <head> (BaseLayout) before first paint so a dark theme never flashes light.
// astro.config.mjs hashes this exact file for the CSP `script-src`; keep it self-contained.
(() => {
    const apply = (root) => {
        const stored = localStorage.getItem('appearance');
        const value = stored === 'light' || stored === 'dark' ? stored : 'system';
        const dark = value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
        root.classList.toggle('dark', dark);
        root.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply(document.documentElement);
    // ClientRouter (admin) swaps in a server-rendered <html> without the theme class; set it before the swap.
    if (!window.__sicThemeSwap) {
        window.__sicThemeSwap = true;
        document.addEventListener('astro:before-swap', (event) => apply(event.newDocument.documentElement));
    }
})();
