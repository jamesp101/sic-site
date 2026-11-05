/**
 * Album lightbox for public pages. Albums render as plain links to the full images (`data-album` grid,
 * `a[data-album-item]`), so everything works without JavaScript; this script upgrades a click to a modal
 * `<dialog>` with previous/next, "n of m" counter, caption, keyboard (Esc, ←, →) and touch swipe.
 * The native modal dialog traps focus, makes the page inert and returns focus on close; the Tab handler and
 * the explicit focus restore below only cover browsers that do less.
 */

// Module scope: keeps this file's top-level names from merging with DOM globals (`close`, `open`, …).
export {};

const ITEM = 'a[data-album-item]';
const SWIPE_DISTANCE = 50;

const BUTTON =
    'inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-900 shadow-brand-sm transition-colors hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

interface Slide {
    href: string;
    alt: string;
    caption: string;
}

let dialog: HTMLDialogElement | null = null;
let image: HTMLImageElement;
let caption: HTMLElement;
let counter: HTMLElement;
let previous: HTMLButtonElement;
let next: HTMLButtonElement;
let closeButton: HTMLButtonElement;

let slides: Slide[] = [];
let index = 0;
let trigger: HTMLElement | null = null;

function button(label: string, glyph: string, extra = ''): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `${BUTTON} ${extra}`.trim();
    element.setAttribute('aria-label', label);
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = glyph;
    element.append(icon);
    return element;
}

function build(): HTMLDialogElement {
    const root = document.createElement('dialog');
    root.setAttribute('aria-label', 'Image viewer');
    root.className =
        'fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-brand-50 backdrop:bg-brand-950/90';

    const frame = document.createElement('div');
    frame.className = 'flex h-full w-full flex-col items-center justify-center gap-3 p-4';
    frame.dataset.lightboxFrame = '';

    const figure = document.createElement('figure');
    figure.className = 'flex min-h-0 max-w-full flex-1 flex-col items-center justify-center gap-3';
    figure.style.touchAction = 'pan-y';
    image = document.createElement('img');
    image.className =
        'max-h-full min-h-0 max-w-full rounded-lg object-contain motion-safe:transition-opacity motion-safe:duration-200';
    caption = document.createElement('figcaption');
    caption.className = 'max-w-prose text-center text-sm text-brand-50';
    figure.append(image, caption);

    const bar = document.createElement('div');
    bar.className = 'flex items-center gap-4';
    previous = button('Previous image', '‹');
    counter = document.createElement('p');
    counter.className = 'min-w-16 text-center text-sm font-semibold text-brand-50';
    counter.setAttribute('aria-live', 'polite');
    next = button('Next image', '›');
    bar.append(previous, counter, next);

    closeButton = button('Close image viewer', '×', 'absolute top-4 right-4');

    frame.append(figure, bar);
    root.append(frame, closeButton);

    previous.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    closeButton.addEventListener('click', () => root.close());
    // A click on the dimmed area (not the image, caption or buttons) closes the viewer.
    root.addEventListener('click', (event) => {
        if (event.target === root || event.target === frame) root.close();
    });
    root.addEventListener('keydown', onKey);
    root.addEventListener('close', onClose);
    swipe(figure);

    document.body.append(root);
    return root;
}

function show(target: number): void {
    if (slides.length === 0) return;
    index = (target + slides.length) % slides.length;
    const slide = slides[index];
    image.src = slide.href;
    image.alt = slide.alt;
    caption.textContent = slide.caption;
    caption.hidden = slide.caption === '';
    counter.textContent = `${index + 1} of ${slides.length}`;
    const single = slides.length < 2;
    // `display` rather than `hidden`: the button's `inline-flex` utility would override the attribute.
    previous.style.display = single ? 'none' : '';
    next.style.display = single ? 'none' : '';
    // Warm the neighbours so stepping through is instant.
    for (const neighbour of [
        slides[(index + 1) % slides.length],
        slides[(index - 1 + slides.length) % slides.length],
    ]) {
        new Image().src = neighbour.href;
    }
}

function onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + 1);
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(index - 1);
    } else if (event.key === 'Tab' && dialog) {
        const controls = [previous, next, closeButton].filter((control) => control.style.display !== 'none');
        const first = controls[0];
        const last = controls[controls.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }
}

function onClose(): void {
    image.removeAttribute('src');
    const target = trigger;
    trigger = null;
    if (target?.isConnected) target.focus();
}

function swipe(target: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    target.addEventListener(
        'touchstart',
        (event) => {
            startX = event.changedTouches[0].clientX;
            startY = event.changedTouches[0].clientY;
        },
        { passive: true },
    );
    target.addEventListener(
        'touchend',
        (event) => {
            const dx = event.changedTouches[0].clientX - startX;
            const dy = event.changedTouches[0].clientY - startY;
            if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            show(index + (dx < 0 ? 1 : -1));
        },
        { passive: true },
    );
}

function open(link: HTMLAnchorElement): void {
    const album = link.closest('[data-album]');
    if (!album) return;
    const links = [...album.querySelectorAll<HTMLAnchorElement>(ITEM)];
    slides = links.map((item) => ({
        href: item.href,
        alt: item.querySelector('img')?.alt ?? '',
        caption: item.dataset.caption ?? '',
    }));
    trigger = link;
    dialog ??= build();
    show(links.indexOf(link));
    if (!dialog.open) dialog.showModal();
    closeButton.focus();
}

document.addEventListener('click', (event) => {
    if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return;
    }
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(ITEM);
    if (!link) return;
    event.preventDefault();
    open(link);
});
