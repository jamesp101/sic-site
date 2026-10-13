<script lang="ts">
    import { untrack } from 'svelte';
    import { parseMarkdown } from '@/lib/markdown';
    import { compressImage } from '@/lib/image-compress';
    import { themeState } from '@/lib/theme.svelte';
    import { EditorView, basicSetup } from 'codemirror';
    import { EditorState, Compartment } from '@codemirror/state';
    import { markdown } from '@codemirror/lang-markdown';
    import { oneDark } from '@codemirror/theme-one-dark';
    import { Bold, Italic, Heading1, Heading2, Heading3, Quote, Code, Link as LinkIcon, Image as ImageIcon, Eye, Edit3 } from '@lucide/svelte';

    let {
        value = $bindable(''),
        label = '',
        id = 'markdown-editor',
        rows = 12,
        error = '',
        placeholder = 'Supports markdown and MDX...',
    }: {
        value: string;
        label?: string;
        id?: string;
        rows?: number;
        error?: string;
        placeholder?: string;
    } = $props();

    const { appearance } = themeState();
    let activeTab = $state<'write' | 'preview'>('write');
    let containerRef = $state<HTMLDivElement | null>(null);
    let isUploading = $state(false);

    let editorView: EditorView | null = null;
    let lastDoc = untrack(() => value || '');
    const themeCompartment = new Compartment();

    // Initialize CodeMirror editor
    $effect(() => {
        if (!containerRef) return;

        const isDark = appearance.value === 'dark' || document.documentElement.classList.contains('dark');
        const initialDoc = untrack(() => value || '');
        lastDoc = initialDoc;

        const state = EditorState.create({
            doc: initialDoc,
            extensions: [
                basicSetup,
                markdown(),
                EditorView.lineWrapping,
                // Ties the visible <label for={id}> to the editable region for assistive tech.
                EditorView.contentAttributes.of({ id, 'aria-label': label || 'Markdown content' }),
                themeCompartment.of(isDark ? oneDark : []),
                EditorView.theme({
                    '&': {
                        height: `${rows * 24}px`,
                        maxHeight: '600px',
                        minHeight: '200px',
                        fontSize: '14px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        borderRadius: '0 0 0.75rem 0.75rem',
                        backgroundColor: 'transparent',
                    },
                    '.cm-content': {
                        padding: '12px 16px',
                    },
                    '.cm-scroller': {
                        overflow: 'auto',
                    },
                    '&.cm-focused': {
                        outline: 'none',
                    },
                    '.cm-gutters': {
                        backgroundColor: 'transparent',
                        borderRight: '1px solid rgba(120, 120, 120, 0.15)',
                    },
                }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        const newDoc = update.state.doc.toString();
                        lastDoc = newDoc;
                        value = newDoc;
                    }
                }),
            ],
        });

        editorView = new EditorView({
            state,
            parent: containerRef,
        });

        return () => {
            if (editorView) {
                editorView.destroy();
                editorView = null;
            }
        };
    });

    // Sync external value changes to CodeMirror
    $effect(() => {
        const val = value || '';
        if (editorView && val !== lastDoc) {
            lastDoc = val;
            untrack(() => {
                const currentDoc = editorView!.state.doc.toString();
                if (currentDoc !== val) {
                    editorView!.dispatch({
                        changes: { from: 0, to: currentDoc.length, insert: val },
                    });
                }
            });
        }
    });

    // Sync theme mode to CodeMirror
    $effect(() => {
        if (editorView) {
            const isDark = appearance.value === 'dark' || document.documentElement.classList.contains('dark');
            editorView.dispatch({
                effects: themeCompartment.reconfigure(isDark ? oneDark : []),
            });
        }
    });

    function insertAtCursor(before: string, after: string = '') {
        if (!editorView) return;

        const { main } = editorView.state.selection;
        const selected = editorView.state.sliceDoc(main.from, main.to);
        const replacement = before + selected + after;

        editorView.dispatch({
            changes: { from: main.from, to: main.to, insert: replacement },
            selection: {
                anchor: main.from + before.length,
                head: main.from + before.length + selected.length,
            },
        });
        editorView.focus();
    }

    function handleHeading(level: number) {
        insertAtCursor('#'.repeat(level) + ' ', '');
    }

    async function handleImageUpload(e: Event) {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        isUploading = true;
        const formData = new FormData();
        formData.append('image', await compressImage(file, 'content'));

        try {
            const response = await fetch('/api/admin/uploads/image', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                insertAtCursor(`![${file.name}](${data.url})`, '');
            } else {
                const data = await response.json().catch(() => null);
                alert(data?.message ?? 'Failed to upload image. Max size 5MB.');
            }
        } catch (error) {
            console.error(error);
            alert('An error occurred during image upload.');
        } finally {
            isUploading = false;
            target.value = '';
        }
    }

    const previewHtml = $derived(parseMarkdown(value));

    const toolClass = 'rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
    const tabClass = 'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors';
</script>

<div class="w-full space-y-1.5">
    {#if label}
        <label for={id} class="block text-sm font-semibold text-foreground">{label}</label>
    {/if}

    <div class="overflow-hidden rounded-xl border border-border-strong bg-surface shadow-brand-sm">
        <!-- Toolbar & tabs -->
        <div class="flex flex-wrap items-center justify-between border-b border-border bg-surface-alt p-2">
            <div class="flex flex-wrap items-center gap-1 {activeTab !== 'write' ? 'pointer-events-none opacity-40' : ''}">
                <button type="button" onclick={() => insertAtCursor('**', '**')} class={toolClass} title="Bold" aria-label="Bold">
                    <Bold class="h-4 w-4" />
                </button>
                <button type="button" onclick={() => insertAtCursor('*', '*')} class={toolClass} title="Italic" aria-label="Italic">
                    <Italic class="h-4 w-4" />
                </button>
                <div class="mx-1 h-4 w-px bg-border-strong"></div>
                <button type="button" onclick={() => handleHeading(1)} class={toolClass} title="Heading 1" aria-label="Heading 1">
                    <Heading1 class="h-4 w-4" />
                </button>
                <button type="button" onclick={() => handleHeading(2)} class={toolClass} title="Heading 2" aria-label="Heading 2">
                    <Heading2 class="h-4 w-4" />
                </button>
                <button type="button" onclick={() => handleHeading(3)} class={toolClass} title="Heading 3" aria-label="Heading 3">
                    <Heading3 class="h-4 w-4" />
                </button>
                <div class="mx-1 h-4 w-px bg-border-strong"></div>
                <button type="button" onclick={() => insertAtCursor('> ', '')} class={toolClass} title="Blockquote" aria-label="Blockquote">
                    <Quote class="h-4 w-4" />
                </button>
                <button type="button" onclick={() => insertAtCursor('```\n', '\n```')} class={toolClass} title="Code block" aria-label="Code block">
                    <Code class="h-4 w-4" />
                </button>
                <button type="button" onclick={() => insertAtCursor('[', '](url)')} class={toolClass} title="Add link" aria-label="Add link">
                    <LinkIcon class="h-4 w-4" />
                </button>

                <label class="{toolClass} flex cursor-pointer items-center justify-center" title="Insert image file">
                    <ImageIcon class="h-4 w-4" />
                    <span class="sr-only">Insert image file</span>
                    <input type="file" accept="image/*" onchange={handleImageUpload} class="hidden" disabled={isUploading} />
                </label>
                {#if isUploading}
                    <span class="animate-pulse text-xs font-semibold text-muted-foreground" role="status">Uploading image…</span>
                {/if}
            </div>

            <div class="ml-auto flex gap-1 rounded-lg border border-border-strong bg-surface p-0.5">
                <button
                    type="button"
                    onclick={() => (activeTab = 'write')}
                    aria-pressed={activeTab === 'write'}
                    class="{tabClass} {activeTab === 'write' ? 'bg-primary text-primary-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}"
                >
                    <Edit3 class="h-3 w-3" /> Edit
                </button>
                <button
                    type="button"
                    onclick={() => (activeTab = 'preview')}
                    aria-pressed={activeTab === 'preview'}
                    class="{tabClass} {activeTab === 'preview' ? 'bg-primary text-primary-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}"
                >
                    <Eye class="h-3 w-3" /> Preview
                </button>
            </div>
        </div>

        <!-- CodeMirror editor and preview -->
        <div class="relative w-full">
            <div
                bind:this={containerRef}
                {id}
                class="w-full font-mono text-sm leading-relaxed {activeTab === 'write' ? 'block' : 'hidden'}"
            ></div>

            {#if activeTab === 'preview'}
                <div class="max-h-[600px] min-h-[250px] overflow-y-auto bg-surface p-5 leading-relaxed">
                    <div class="prose prose-neutral dark:prose-invert max-w-none text-sm">
                        {#if value}
                            {@html previewHtml}
                        {:else}
                            <p class="text-xs italic text-muted-foreground">Nothing to preview yet. Start writing some markdown content.</p>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>

    {#if error}
        <p class="text-xs text-destructive" role="alert">{error}</p>
    {/if}
</div>
