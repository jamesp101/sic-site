<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import { actionForm } from '@/components/admin/shared/action-form.svelte';
  import BlockEditor from '@/components/admin/editor/BlockEditor.svelte';
  import Field from '@/components/admin/shared/Field.svelte';
  import FormActions from '@/components/admin/shared/FormActions.svelte';
  import ImageField from '@/components/admin/shared/ImageField.svelte';
  import { append, inputClass } from '@/components/admin/shared/form-utils';
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
    defaultDepartmentId = null,
    post = null,
  }: {
    departments: { id: number; name: string }[];
    isSuperAdmin: boolean;
    /** Admin scope's department, preselected when creating (superadmins may change it). */
    defaultDepartmentId?: number | null;
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
  let departmentId = $state(initial?.departmentId ? String(initial.departmentId) : isSuperAdmin ? (initial ? '' : String(untrack(() => defaultDepartmentId) ?? '')) : String(untrack(() => departments)[0]?.id ?? ''));
  let isFeatured = $state(initial?.isFeatured ?? false);
  let highlightImage = $state<File | null>(null);
  let slugEdited = $state(initial !== null);


  $effect(() => {
    if (!slugEdited) slug = slugify(title);
  });

  const isoOrEmpty = (local: string) => (local ? new Date(local).toISOString() : '');

  const form = actionForm({
    run() {
      const data = new FormData();
      if (post) data.append('id', String(post.id));
      append(data, 'title', title);
      append(data, 'slug', slug);
      append(data, 'content', content);
      append(data, 'type', type);
      append(data, 'startDate', type === 'event' ? isoOrEmpty(startDate) : '');
      append(data, 'endDate', type === 'event' ? isoOrEmpty(endDate) : '');
      append(data, 'departmentId', departmentId);
      append(data, 'isFeatured', isFeatured);
      append(data, 'highlightImage', highlightImage);
      return post ? actions.posts.update(data) : actions.posts.create(data);
    },
    onSuccess: () => navigate('/admin/posts'),
  });
</script>

<form method="post" onsubmit={form.submit} class="space-y-6">
  <div class="{cardClass} grid gap-8 p-6 lg:grid-cols-3">
    <div class="space-y-5 lg:col-span-2">
      <Field label="Post title" id="title" error={form.errors.title} required>
        <input id="title" type="text" required bind:value={title} class={inputClass} placeholder="e.g. Enrollment details for first semester" aria-invalid={form.errors.title ? 'true' : undefined} />
      </Field>

      <Field
        label="Post slug (URL path)"
        id="slug"
        error={form.errors.slug}
        hint={post ? 'Leave empty to regenerate from the title.' : 'Generated from the title. Edit to customise.'}
      >
        <input
          id="slug"
          type="text"
          bind:value={slug}
          oninput={() => (slugEdited = true)}
          class={inputClass}
          placeholder="e.g. enrollment-details"
          aria-invalid={form.errors.slug ? 'true' : undefined}
        />
      </Field>

      <div class="grid gap-5 md:grid-cols-2">
        <Field label="Post type" id="type" error={form.errors.type}>
          <select id="type" bind:value={type} class="{selectClass} w-full">
            <option value="article">Article / Story</option>
            <option value="event">Campus Event</option>
            <option value="announcement">Official Announcement</option>
          </select>
        </Field>

        <Field label="Department" id="departmentId" error={form.errors.departmentId}>
          <select id="departmentId" bind:value={departmentId} class="{selectClass} w-full">
            {#if isSuperAdmin}<option value="">General landing page</option>{/if}
            {#each departments as dept (dept.id)}
              <option value={String(dept.id)}>{dept.name}</option>
            {/each}
          </select>
        </Field>
      </div>

      {#if type === 'event'}
        <div class="grid gap-5 border-t border-border pt-4 md:grid-cols-2">
          <Field label="Event start" id="startDate" error={form.errors.startDate}>
            <input id="startDate" type="datetime-local" bind:value={startDate} class={inputClass} />
          </Field>
          <Field label="Event end" id="endDate" error={form.errors.endDate}>
            <input id="endDate" type="datetime-local" bind:value={endDate} class={inputClass} />
          </Field>
        </div>
      {/if}
    </div>

    <div class="space-y-5">
      <ImageField
        bind:file={highlightImage}
        id="highlightImage"
        target="highlight"
        label="Highlight image"
        existingUrl={initial?.highlightImageUrl ?? null}
        cropTitle="Crop highlight image"
        hint="PNG, JPG, WebP or GIF, up to 5 MB"
        error={form.errors.highlightImage}
        fit="cover"
      />

      <label class="flex cursor-pointer items-center gap-2 pt-1 text-sm font-semibold text-foreground">
        <input type="checkbox" bind:checked={isFeatured} class="h-4 w-4 rounded border-border-strong accent-brand-800" />
        Feature on landing page
      </label>
    </div>
  </div>

  <BlockEditor bind:value={content} id="content" label="Post content" error={form.errors.content} context="post" />

  <FormActions cancelHref="/admin/posts" processing={form.processing} message={form.message} submitLabel={post ? 'Save changes' : 'Publish post'} />
</form>
