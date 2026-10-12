<script lang="ts">
  import { ArrowUpDown, Pencil, Search, User } from '@lucide/svelte';
  import DeleteMemberButton from './DeleteMemberButton.svelte';
  import { inputClass } from '../shared/form-utils';

  interface Row {
    id: number;
    name: string;
    role: string;
    parentId: number | null;
    order: number;
    imageUrl: string | null;
  }

  let { departmentId, members }: { departmentId: number; members: Row[] } = $props();

  type SortField = 'name' | 'role' | 'parent' | 'order';
  let query = $state('');
  let sortField = $state<SortField>('order');
  let direction = $state<'asc' | 'desc'>('asc');

  const names = $derived(new Map(members.map((member) => [member.id, member.name])));

  const rows = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? members.filter((member) => member.name.toLowerCase().includes(needle) || member.role.toLowerCase().includes(needle))
      : [...members];
    const key = (member: Row): string | number =>
      sortField === 'parent' ? (member.parentId ? (names.get(member.parentId) ?? '') : '') : member[sortField];
    return filtered.sort((a, b) => {
      const left = key(a);
      const right = key(b);
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return direction === 'asc' ? result : -result;
    });
  });

  function toggle(field: SortField) {
    if (sortField === field) direction = direction === 'asc' ? 'desc' : 'asc';
    else {
      sortField = field;
      direction = 'asc';
    }
  }

  function ariaSort(field: SortField): 'ascending' | 'descending' | 'none' {
    return sortField === field ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
  }
</script>

<div class="space-y-4">
  <div class="relative w-full md:max-w-xs">
    <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <input type="search" bind:value={query} placeholder="Search name or role…" aria-label="Search members" class={[inputClass, 'pl-9']} />
  </div>

  <div class="overflow-hidden rounded-xl border border-border bg-card shadow-brand-sm">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-border bg-surface-alt text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <th scope="col" class="w-20 px-6 py-4">Photo</th>
            {#each [['name', 'Full name'], ['role', 'Role / position'], ['parent', 'Reports to'], ['order', 'Order']] as [field, title] (field)}
              <th scope="col" class="px-6 py-4" aria-sort={ariaSort(field as SortField)}>
                <button type="button" onclick={() => toggle(field as SortField)} class="inline-flex items-center gap-1 uppercase tracking-wider hover:text-link">
                  {title} <ArrowUpDown class="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
            {/each}
            <th scope="col" class="w-28 px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each rows as member (member.id)}
            <tr class="hover:bg-surface-alt/60">
              <td class="px-6 py-3">
                <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-alt text-muted-foreground">
                  {#if member.imageUrl}
                    <img src={member.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                  {:else}
                    <User class="h-5 w-5" aria-hidden="true" />
                  {/if}
                </div>
              </td>
              <td class="px-6 py-3 font-semibold text-foreground">{member.name}</td>
              <td class="px-6 py-3 text-foreground">{member.role}</td>
              <td class="px-6 py-3 text-xs">
                {#if member.parentId && names.has(member.parentId)}
                  <span class="font-medium text-link">{names.get(member.parentId)}</span>
                {:else}
                  <span class="italic text-muted-foreground">None (top level)</span>
                {/if}
              </td>
              <td class="px-6 py-3 font-mono text-xs">#{member.order}</td>
              <td class="px-6 py-3">
                <div class="flex justify-end gap-1.5">
                  <a
                    href={`/admin/departments/${departmentId}/members/${member.id}/edit`}
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
                    aria-label={`Edit ${member.name}`}
                    title="Edit member"
                  >
                    <Pencil class="h-4 w-4" aria-hidden="true" />
                  </a>
                  <DeleteMemberButton {departmentId} id={member.id} name={member.name} />
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-6 py-12 text-center italic text-muted-foreground">No members match your criteria.</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
