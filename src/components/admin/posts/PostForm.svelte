<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import MarkdownEditor from '@/components/MarkdownEditor.svelte';
  import Field from '@/components/admin/shared/Field.svelte';
  import FormActions from '@/components/admin/shared/FormActions.svelte';
  import ImageField from '@/components/admin/shared/ImageField.svelte';
  import { append, inputClass, parseActionError } from '@/components/admin/shared/form-utils';
  import { cardClass, selectClass } from '@/components/admin/ui';
  import { slugify } from '@/lib/server/slug';

  interface PostValues {
    id: number;
    title: string;
    slug: string;
    content: string;
    type: string;
    /** ISO strings */
    startDate: string | null;
    endDate: string | null;
    departmentId: number | null;
    isFeatured: boolean;
    highlightImageUrl: string | null;
  }

  let {
    departments,
    isSuperAdmin,
    post = null,
  }: {
    departments: { id: number; name: string }[];
    isSuperAdmin: boolean;
    post?: PostValues | null;
  } = $props();

  /** ISO instant -> `YYYY-MM-DDTHH:mm` in the browser's timezone for datetime-local inputs. */
  function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const initial = untrack(() => post);
  let title = $state(initial?.title ?? '');
  let slug = $state(initial?.slug ?? '');
  let content = $state(initial?.content ?? '');
  let type = $state(initial?.type ?? 'article');
  let startDate = $state(toLocalInput(initial?.startDate ?? null));
  let endDate = $state(toLocalInput(initial?.endDate ?? null));
  let departmentId = $state(initial?.departmentId ? String(initial.departmentId) : isSuperAdmin ? '' : String(untrack(() => departments)[0]?.id ?? ''));
  let isFeatured = $state(initial?.isFeatured ?? false);
  let highlightImage = $state<File | null>(null);
  let slugEdited = $state(initial !== null);

  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  $effect(() => {
    if (!slugEdited) slug = slugify(title);
  });

  const isoOrEmpty = (local: string) => (local ? new Date(local).toISOString() : '');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    errors = {};
    message = '';

    const form = new FormData();
    if (post) form.append('id', String(post.id));
    append(form, 'title', title);
    append(form, 'slug', slug);
    append(form, 'content', content);
    append(form, 'type', type);
    append(form, 'startDate', type === 'event' ? isoOrEmpty(startDate) : '');
    append(form, 'endDate', type === 'event' ? isoOrEmpty(endDate) : '');
    append(form, 'departmentId', departmentId);
    append(form, 'isFeatured', isFeatured);
    append(form, 'highlightImage', highlightImage);

    const { error } = await (post ? actions.posts.update(form) : actions.posts.create(form));
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    await navigate('/admin/posts');
  }
</script>

<form method="post" onsubmit={submit} class="grid gap-8 lg:grid-cols-3">
  <div class="space-y-6 lg:col-span-2">
    <div class="{cardClass} space-y-5 p-6">
      <Field label="Post title" id="title" error={errors.title} required>
        <input id="title" type="text" required bind:value={title} class={inputClass} placeholder="e.g. Enrollment details for first semester" aria-invalid={errors.title ? 'true' : undefined} />
      </Field>

      <Field
        label="Post slug (URL path)"
        id="slug"
        error={errors.slug}
        hint={post ? 'Leave empty to regenerate from the title.' : 'Generated from the title. Edit to customise.'}
      >
        <input
          id="slug"
          type="text"
          bind:value={slug}
          oninput={() => (slugEdited = true)}
          class={inputClass}
          placeholder="e.g. enrollment-details"
          aria-invalid={errors.slug ? 'true' : undefined}
        />
      </Field>

      <MarkdownEditor
        bind:value={content}
        id="content"
        label="Post content (Markdown / MDX)"
        error={errors.content}
        placeholder="Write your article, announcement or event description…"
      />
    </div>
  </div>

  <div class="space-y-6">
    <div class="{cardClass} space-y-5 p-6">
      <h2 class="font-sans text-base font-bold text-foreground">Post settings</h2>

      <Field label="Post type" id="type" error={errors.type}>
        <select id="type" bind:value={type} class="{selectClass} w-full">
          <option value="article">Article / Story</option>
          <option value="event">Campus Event</option>
          <option value="announcement">Official Announcement</option>
        </select>
      </Field>

      {#if type === 'event'}
        <div class="space-y-4 border-t border-border pt-4">
          <Field label="Event start" id="startDate" error={errors.startDate}>
            <input id="startDate" type="datetime-local" bind:value={startDate} class={inputClass} />
          </Field>
          <Field label="Event end" id="endDate" error={errors.endDate}>
            <input id="endDate" type="datetime-local" bind:value={endDate} class={inputClass} />
          </Field>
        </div>
      {/if}

      <Field label="Department" id="departmentId" error={errors.departmentId}>
        <select id="departmentId" bind:value={departmentId} class="{selectClass} w-full">
          {#if isSuperAdmin}<option value="">General landing page</option>{/if}
          {#each departments as dept (dept.id)}
            <option value={String(dept.id)}>{dept.name}</option>
          {/each}
        </select>
      </Field>

      <ImageField
        bind:file={highlightImage}
        id="highlightImage"
        label="Highlight image"
        existingUrl={initial?.highlightImageUrl ?? null}
        cropTitle="Crop highlight image"
        hint="PNG, JPG, WebP or GIF, up to 5 MB"
        error={errors.highlightImage}
        fit="cover"
      />

      <label class="flex cursor-pointer items-center gap-2 pt-1 text-sm font-semibold text-foreground">
        <input type="checkbox" bind:checked={isFeatured} class="h-4 w-4 rounded border-border-strong accent-brand-800" />
        Feature on landing page
      </label>
    </div>

    <FormActions cancelHref="/admin/posts" {processing} {message} submitLabel={post ? 'Save changes' : 'Publish post'} />
  </div>
</form>
