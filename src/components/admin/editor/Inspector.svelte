<script lang="ts">
  import { BLOCK_META, LIMITS, type Block } from '../../../lib/blocks/types';
  import { parseVideoUrl, safeHref } from '../../../lib/blocks/urls';
  import { inputClass, secondaryButtonClass } from '../shared/form-utils';
  import AddButton from './inspector/AddButton.svelte';
  import CheckField from './inspector/CheckField.svelte';
  import Group from './inspector/Group.svelte';
  import ImageEditor from './inspector/ImageEditor.svelte';
  import ItemToolbar from './inspector/ItemToolbar.svelte';
  import { joinDateTime, moveItem, removeItem, replaceItem, splitDateTime } from './inspector/list-utils';
  import {
    ALIGN_OPTIONS,
    BACKGROUND_OPTIONS,
    BUTTON_VARIANT_OPTIONS,
    CALLOUT_TONE_OPTIONS,
    COLUMN_COUNT_OPTIONS,
    CROSS_ALIGN_OPTIONS,
    DIRECTION_OPTIONS,
    DIVIDER_OPTIONS,
    GAP_OPTIONS,
    GRID_COLUMN_OPTIONS,
    HEADING_LEVEL_OPTIONS,
    JUSTIFY_OPTIONS,
    RATIO_OPTIONS,
    SPACER_OPTIONS,
    TEXT_SIZE_OPTIONS,
    TEXT_TONE_OPTIONS,
  } from './inspector/options';
  import RichTextField from './inspector/RichTextField.svelte';
  import SelectField from './inspector/SelectField.svelte';
  import StringListEditor from './inspector/StringListEditor.svelte';
  import TableEditor from './inspector/TableEditor.svelte';
  import TextField from './inspector/TextField.svelte';
  import Field from '../shared/Field.svelte';

  let {
    block,
    onupdate,
    idPrefix,
    onconvert,
  }: {
    block: Block | null;
    onupdate: (id: string, patch: Record<string, unknown>) => void;
    idPrefix?: string;
    /** Shown only for markdown blocks: converts the legacy source into blocks. */
    onconvert?: (id: string) => void;
  } = $props();

  function set(patch: Record<string, unknown>) {
    if (block) onupdate(block.id, patch);
  }

  /** Unique control id for the selected block. */
  function fid(field: string): string {
    return `${idPrefix ?? 'insp'}-${block?.id ?? 'none'}-${field}`;
  }

  function linkError(href: string): string {
    return href.trim() && !safeHref(href) ? 'Use https://…, /path, mailto: or tel: links only.' : '';
  }
</script>

<div class="space-y-4 text-sm">
  {#if !block}
    <p class="text-sm text-muted-foreground">Select an element on the canvas or in Layers to edit its properties.</p>
  {:else}
    <h3 class="text-sm font-bold text-foreground">{BLOCK_META[block.type].label} properties</h3>

    {#if block.type === 'section'}
      <Group title="Appearance">
        <SelectField id={fid('background')} label="Background" value={block.props.background} options={BACKGROUND_OPTIONS} onchange={(v) => set({ background: v })} />
        <SelectField id={fid('padding')} label="Padding" value={block.props.padding} options={GAP_OPTIONS} onchange={(v) => set({ padding: v })} />
        <SelectField id={fid('align')} label="Text alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
      </Group>
    {:else if block.type === 'row'}
      <Group title="Layout">
        <SelectField id={fid('direction')} label="Direction" value={block.props.direction} options={DIRECTION_OPTIONS} onchange={(v) => set({ direction: v })} />
        <SelectField id={fid('gap')} label="Gap" value={block.props.gap} options={GAP_OPTIONS} onchange={(v) => set({ gap: v })} />
        <SelectField id={fid('align')} label="Align items" value={block.props.align} options={CROSS_ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
        <SelectField id={fid('justify')} label="Justify" value={block.props.justify} options={JUSTIFY_OPTIONS} onchange={(v) => set({ justify: v })} />
        <CheckField id={fid('wrap')} label="Wrap items" checked={block.props.wrap} onchange={(v) => set({ wrap: v })} />
      </Group>
    {:else if block.type === 'grid'}
      <Group title="Layout">
        <SelectField id={fid('columns')} label="Columns" value={block.props.columns} options={GRID_COLUMN_OPTIONS} onchange={(v) => set({ columns: Number(v) })} />
        <SelectField id={fid('gap')} label="Gap" value={block.props.gap} options={GAP_OPTIONS} onchange={(v) => set({ gap: v })} />
      </Group>
    {:else if block.type === 'columns'}
      <Group title="Layout">
        <SelectField id={fid('count')} label="Number of columns" value={block.props.count} options={COLUMN_COUNT_OPTIONS} onchange={(v) => set({ count: Number(v) })} />
        <SelectField id={fid('ratio')} label="Column widths" value={block.props.ratio} options={RATIO_OPTIONS} hint="Unequal widths apply to two columns only." onchange={(v) => set({ ratio: v })} />
        <SelectField id={fid('gap')} label="Gap" value={block.props.gap} options={GAP_OPTIONS} onchange={(v) => set({ gap: v })} />
      </Group>
    {:else if block.type === 'spacer'}
      <Group title="Spacing">
        <SelectField id={fid('size')} label="Size" value={block.props.size} options={SPACER_OPTIONS} onchange={(v) => set({ size: v })} />
      </Group>
    {:else if block.type === 'divider'}
      <Group title="Appearance">
        <SelectField id={fid('tone')} label="Style" value={block.props.tone} options={DIVIDER_OPTIONS} onchange={(v) => set({ tone: v })} />
      </Group>
    {:else if block.type === 'heading'}
      <Group title="Content">
        <TextField id={fid('text')} label="Heading text" value={block.props.text} maxlength={LIMITS.label} oninput={(v) => set({ text: v })} />
      </Group>
      <Group title="Appearance">
        <SelectField id={fid('level')} label="Heading level" value={block.props.level} options={HEADING_LEVEL_OPTIONS} onchange={(v) => set({ level: Number(v) })} />
        <SelectField id={fid('align')} label="Text alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
      </Group>
    {:else if block.type === 'paragraph'}
      <Group title="Content">
        <RichTextField id={fid('text')} label="Text" value={block.props.text} hint="A blank line starts a new paragraph." oninput={(v) => set({ text: v })} />
      </Group>
      <Group title="Appearance">
        <SelectField id={fid('size')} label="Text size" value={block.props.size} options={TEXT_SIZE_OPTIONS} onchange={(v) => set({ size: v })} />
        <SelectField id={fid('tone')} label="Text colour" value={block.props.tone} options={TEXT_TONE_OPTIONS} onchange={(v) => set({ tone: v })} />
        <SelectField id={fid('align')} label="Text alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
      </Group>
    {:else if block.type === 'list'}
      <Group title="Content">
        <CheckField id={fid('ordered')} label="Numbered list" checked={block.props.ordered} onchange={(v) => set({ ordered: v })} />
        <StringListEditor idBase={fid('item')} legend="Items" noun="item" items={block.props.items} max={LIMITS.listItems} onchange={(items) => set({ items })} />
      </Group>
    {:else if block.type === 'quote'}
      <Group title="Content">
        <RichTextField id={fid('text')} label="Quote text" value={block.props.text} oninput={(v) => set({ text: v })} />
        <TextField id={fid('cite')} label="Attribution" value={block.props.cite} maxlength={LIMITS.label} oninput={(v) => set({ cite: v })} />
      </Group>
    {:else if block.type === 'button'}
      <Group title="Content">
        <TextField id={fid('label')} label="Button label" value={block.props.label} maxlength={LIMITS.label} oninput={(v) => set({ label: v })} />
        <TextField
          id={fid('href')}
          label="Button link"
          value={block.props.href}
          maxlength={LIMITS.url}
          hint="Accepted: https://…, /path, mailto: or tel:"
          error={linkError(block.props.href)}
          oninput={(v) => set({ href: v })}
        />
      </Group>
      <Group title="Appearance">
        <SelectField id={fid('variant')} label="Button style" value={block.props.variant} options={BUTTON_VARIANT_OPTIONS} onchange={(v) => set({ variant: v })} />
        <SelectField id={fid('align')} label="Alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
      </Group>
    {:else if block.type === 'badges'}
      <Group title="Content">
        <StringListEditor idBase={fid('badge')} legend="Badges" noun="badge" items={block.props.items} max={LIMITS.badgeItems} maxlength={LIMITS.label} onchange={(items) => set({ items })} />
      </Group>
    {:else if block.type === 'card'}
      <Group title="Content">
        <TextField id={fid('title')} label="Card title" value={block.props.title} maxlength={LIMITS.label} oninput={(v) => set({ title: v })} />
        <RichTextField id={fid('body')} label="Card text" value={block.props.body} hint="A blank line starts a new paragraph." oninput={(v) => set({ body: v })} />
      </Group>
      <Group title="Image">
        <ImageEditor
          idBase={fid('image')}
          ownerKey={block.id}
          src={block.props.imageUrl}
          urlLabel="Card image URL"
          onupload={(image) => set({ imageUrl: image.url })}
          ontype={(url) => set({ imageUrl: url })}
        />
        <TextField id={fid('imageAlt')} label="Card image description" value={block.props.imageAlt} maxlength={LIMITS.label} hint="Leave empty if the image is only decorative." oninput={(v) => set({ imageAlt: v })} />
      </Group>
      <Group title="Link">
        <TextField id={fid('linkLabel')} label="Card link label" value={block.props.linkLabel} maxlength={LIMITS.label} oninput={(v) => set({ linkLabel: v })} />
        <TextField id={fid('linkHref')} label="Card link URL" value={block.props.linkHref} maxlength={LIMITS.url} hint="Accepted: https://…, /path, mailto: or tel:" error={linkError(block.props.linkHref)} oninput={(v) => set({ linkHref: v })} />
      </Group>
      <p class="text-xs text-muted-foreground">Drop elements into the card in the canvas or Layers panel.</p>
    {:else if block.type === 'image'}
      <Group title="Image">
        <ImageEditor
          idBase={fid('image')}
          ownerKey={block.id}
          src={block.props.src}
          onupload={(image) => set({ src: image.url, width: image.width, height: image.height })}
          ontype={(url) => set({ src: url, width: null, height: null })}
        />
      </Group>
      <Group title="Accessibility">
        <CheckField id={fid('decorative')} label="Decorative image (no alt text)" checked={block.props.decorative} onchange={(v) => set({ decorative: v })} />
        <TextField
          id={fid('alt')}
          label="Alt text"
          value={block.props.alt}
          maxlength={LIMITS.label}
          required={!block.props.decorative}
          disabled={block.props.decorative}
          error={!block.props.decorative && !block.props.alt.trim() ? 'Describe the image, or mark it as decorative.' : ''}
          oninput={(v) => set({ alt: v })}
        />
      </Group>
      <Group title="Caption">
        <TextField id={fid('caption')} label="Caption" value={block.props.caption} maxlength={LIMITS.label} oninput={(v) => set({ caption: v })} />
      </Group>
    {:else if block.type === 'table'}
      <Group title="Table">
        <CheckField id={fid('header')} label="First row is a header" checked={block.props.header} onchange={(v) => set({ header: v })} />
        <TextField id={fid('caption')} label="Table caption" value={block.props.caption} maxlength={LIMITS.label} oninput={(v) => set({ caption: v })} />
      </Group>
      <Group title="Cells">
        <TableEditor idBase={fid('cell')} rows={block.props.rows} onchange={(rows) => set({ rows })} />
      </Group>
    {:else if block.type === 'accordion'}
      <Group title="Items">
        {#each block.props.items as item, index (index)}
          {@const items = block.props.items}
          <fieldset class="space-y-2 rounded-lg border border-border bg-surface p-3">
            <legend class="px-1 text-xs font-semibold text-muted-foreground">Item {index + 1}</legend>
            <div class="flex items-end gap-1">
              <div class="min-w-0 flex-1">
                <TextField id={fid(`q-${index}`)} label={`Question ${index + 1}`} value={item.title} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, title: v }) })} />
              </div>
              <ItemToolbar noun="item" n={index + 1} count={items.length} onmove={(d) => set({ items: moveItem(items, index, index + d) })} onremove={() => set({ items: removeItem(items, index) })} />
            </div>
            <RichTextField id={fid(`a-${index}`)} label={`Answer ${index + 1}`} value={item.body} rows={3} oninput={(v) => set({ items: replaceItem(items, index, { ...item, body: v }) })} />
          </fieldset>
        {/each}
        <AddButton label="Add item" disabled={block.props.items.length >= LIMITS.accordionItems} onclick={() => set({ items: [...(block?.type === 'accordion' ? block.props.items : []), { title: '', body: '' }] })} />
      </Group>
    {:else if block.type === 'callout'}
      <Group title="Content">
        <SelectField id={fid('tone')} label="Tone" value={block.props.tone} options={CALLOUT_TONE_OPTIONS} onchange={(v) => set({ tone: v })} />
        <TextField id={fid('title')} label="Callout title" value={block.props.title} maxlength={LIMITS.label} oninput={(v) => set({ title: v })} />
        <RichTextField id={fid('text')} label="Callout text" value={block.props.text} oninput={(v) => set({ text: v })} />
      </Group>
    {:else if block.type === 'stats'}
      <Group title="Stats">
        {#each block.props.items as item, index (index)}
          {@const items = block.props.items}
          <fieldset class="space-y-2 rounded-lg border border-border bg-surface p-3">
            <legend class="px-1 text-xs font-semibold text-muted-foreground">Stat {index + 1}</legend>
            <div class="flex justify-end">
              <ItemToolbar noun="stat" n={index + 1} count={items.length} onmove={(d) => set({ items: moveItem(items, index, index + d) })} onremove={() => set({ items: removeItem(items, index) })} />
            </div>
            <TextField id={fid(`value-${index}`)} label={`Value ${index + 1}`} value={item.value} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, value: v }) })} />
            <TextField id={fid(`label-${index}`)} label={`Label ${index + 1}`} value={item.label} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, label: v }) })} />
            <TextField id={fid(`hint-${index}`)} label={`Note ${index + 1} (optional)`} value={item.hint} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, hint: v }) })} />
          </fieldset>
        {/each}
        <AddButton label="Add stat" disabled={block.props.items.length >= LIMITS.statItems} onclick={() => set({ items: [...(block?.type === 'stats' ? block.props.items : []), { value: '', label: '', hint: '' }] })} />
      </Group>
    {:else if block.type === 'video'}
      <Group title="Video">
        <TextField
          id={fid('url')}
          label="Video URL"
          value={block.props.url}
          maxlength={LIMITS.url}
          hint="A YouTube or Vimeo link."
          error={block.props.url.trim() && !parseVideoUrl(block.props.url) ? 'Use a YouTube or Vimeo link.' : ''}
          oninput={(v) => set({ url: v })}
        />
        <TextField
          id={fid('title')}
          label="Video title"
          value={block.props.title}
          maxlength={LIMITS.label}
          required
          hint="Read aloud by screen readers to describe the video."
          error={block.props.url.trim() && !block.props.title.trim() ? 'Add a short title for the video.' : ''}
          oninput={(v) => set({ title: v })}
        />
        <TextField id={fid('caption')} label="Caption" value={block.props.caption} maxlength={LIMITS.label} oninput={(v) => set({ caption: v })} />
      </Group>
    {:else if block.type === 'event'}
      {@const start = splitDateTime(block.props.start)}
      {@const end = splitDateTime(block.props.end)}
      <Group title="Event">
        <TextField id={fid('title')} label="Event title (optional)" value={block.props.title} maxlength={LIMITS.label} oninput={(v) => set({ title: v })} />
      </Group>
      <Group title="Start">
        <TextField id={fid('start-date')} type="date" label="Start date" value={start.date} oninput={(v) => set({ start: joinDateTime(v, start.time) })} />
        <TextField id={fid('start-time')} type="time" label="Start time (optional)" value={start.time} oninput={(v) => set({ start: joinDateTime(start.date, v) })} hint={start.date ? '' : 'Choose a start date first; a time alone is not saved.'} />
      </Group>
      <Group title="End">
        <TextField id={fid('end-date')} type="date" label="End date (optional)" value={end.date} oninput={(v) => set({ end: joinDateTime(v, end.time) })} />
        <TextField id={fid('end-time')} type="time" label="End time (optional)" value={end.time} oninput={(v) => set({ end: joinDateTime(end.date, v) })} hint={end.date ? '' : 'Choose an end date first; a time alone is not saved.'} />
      </Group>
      <Group title="Details">
        <TextField id={fid('location')} label="Location" value={block.props.location} maxlength={LIMITS.label} oninput={(v) => set({ location: v })} />
        <RichTextField id={fid('note')} label="Details" value={block.props.note} oninput={(v) => set({ note: v })} />
      </Group>
    {:else if block.type === 'markdown'}
      <Group title="Source">
        <Field label="Markdown source" id={fid('source')}>
          <textarea
            id={fid('source')}
            rows={14}
            maxlength={LIMITS.markdown}
            value={block.props.source}
            class={[inputClass, 'resize-y font-mono']}
            oninput={(event) => set({ source: event.currentTarget.value })}
          ></textarea>
        </Field>
      </Group>
      <div class="space-y-2 rounded-lg border-2 border-gold-500 bg-surface-alt p-3" role="group" aria-labelledby={fid('legacy')}>
        <h4 id={fid('legacy')} class="text-sm font-bold text-foreground">Legacy content</h4>
        <p class="text-xs text-muted-foreground">
          This content was written in Markdown before the visual editor. It still displays correctly. Convert it to blocks to edit it visually; you can undo the conversion.
        </p>
        {#if onconvert}
          <button type="button" class={[secondaryButtonClass, 'px-3! py-1.5!']} onclick={() => block && onconvert(block.id)}>
            Convert to blocks
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</div>
