<script lang="ts">
  let {
    id,
    label,
    checked,
    onchange,
  }: { id: string; label: string; checked: boolean; onchange: (checked: boolean) => void } = $props();
</script>

<div class="flex items-center gap-2">
  <input
    {id}
    type="checkbox"
    {checked}
    class="h-4 w-4 rounded border-border-strong accent-brand-700 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <label for={id} class="text-sm font-semibold text-foreground">{label}</label>
</div>
