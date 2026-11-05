/**
 * Prints every accordion (`<details>`) open: `beforeprint` opens the closed ones, `afterprint` closes them again.
 * Without JavaScript the `@media print` rule in `app.css` does the same for browsers that support
 * `::details-content`.
 */
let opened: HTMLDetailsElement[] = [];

window.addEventListener('beforeprint', () => {
    opened = [...document.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
    for (const details of opened) details.open = true;
});

window.addEventListener('afterprint', () => {
    for (const details of opened) details.open = false;
    opened = [];
});
