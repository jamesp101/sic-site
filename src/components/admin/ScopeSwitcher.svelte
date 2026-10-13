<script lang="ts" module>
  /** Last open request served; module scope so a remounted switcher (mobile sheet) does not reopen. */
  let handledSignal = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Home from '@lucide/svelte/icons/house';
  import Layers from '@lucide/svelte/icons/layers';
  import type { ScopeOption, ScopeSummary } from '@/components/admin/types';
  import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
  import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
  import { getInitials } from '@/lib/initials';
  import { reloadView } from '@/lib/navigation';

  let {
    scope,
    departments,
    locked,
    openSignal = 0,
  }: {
    scope: ScopeSummary;
    departments: ScopeOption[];
    /** Department users: static label, no switching. */
    locked: boolean;
    /** Incremented by the page "change" links to open the menu. */
    openSignal?: number;
  } = $props();

  const SEARCH_MIN = 6;
  const { isMobile, state: sidebarState } = useSidebar();

  let open = $state(false);
  let query = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLElement | null>(null);

  const currentValue = $derived(scope.kind === 'department' ? String(scope.id) : scope.kind);
  const currentDepartment = $derived(departments.find((d) => d.id === scope.id) ?? null);
  const shown = $derived(
    departments.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const collapsed = $derived($sidebarState === 'collapsed' && !$isMobile);

  $effect(() => {
    if (openSignal > handledSignal) {
      handledSignal = openSignal;
      open = true;
    }
  });

  $effect(() => {
    if (!open) return;
    query = '';
    void tick().then(() => {
      const target = searchEl ?? listEl?.querySelector<HTMLElement>('[aria-checked="true"]') ?? listEl?.querySelector<HTMLElement>('[role="menuitemradio"]');
      target?.focus();
    });
  });

  async function choose(value: string) {
    open = false;
    if (value === currentValue) return;
    document.cookie = `admin_scope=${value}; path=/; max-age=31536000; SameSite=Lax`;
    await reloadView();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      void tick().then(() => document.querySelector<HTMLElement>('[data-scope-trigger]')?.focus());
      return;
    }
    const items = [...(listEl?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
    else if (event.key === 'Home' && index >= 0) next = 0;
    else if (event.key === 'End' && index >= 0) next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  }

  const optionClass =
    'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground';
</script>

{#snippet badge(kind: ScopeSummary['kind'], name: string, logoUrl: string | null)}
  <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground" aria-hidden="true">
    {#if logoUrl}
      <img src={logoUrl} alt="" class="size-full object-cover" />
    {:else if kind === 'all'}
      <Layers class="size-4" />
    {:else if kind === 'main'}
      <Home class="size-4" />
    {:else}
      {getInitials(name)}
    {/if}
  </span>
{/snippet}

{#snippet label(text: string, hint: string)}
  <span class="grid min-w-0 flex-1 text-left text-sm leading-tight">
    <span class="truncate font-medium">{text}</span>
    <span class="truncate text-xs text-muted-foreground">{hint}</span>
  </span>
{/snippet}

<SidebarMenu>
  <SidebarMenuItem>
    {#if locked}
      <div
        class="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
        data-testid="scope-static"
        title={scope.label}
        role="group"
        aria-label={`Department: ${scope.label}`}
      >
        {@render badge(scope.kind, scope.label, currentDepartment?.logoUrl ?? null)}
        <span class="group-data-[collapsible=icon]:hidden grid min-w-0 flex-1 text-left text-sm leading-tight">
          <span class="truncate font-medium">{scope.label}</span>
          <span class="truncate text-xs text-muted-foreground">Your department</span>
        </span>
      </div>
    {:else}
      <DropdownMenu class="w-full" bind:open>
        <DropdownMenuTrigger asChild>
          {#snippet children(props)}
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={`Scope: ${scope.label}`}
              class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {#snippet children(buttonProps)}
                <!-- The tooltip trigger owns `onclick`; run both handlers. -->
                <button
                  {...buttonProps}
                  type="button"
                  data-scope-trigger=""
                  data-testid="scope-switcher"
                  aria-haspopup="menu"
                  aria-label={`Department scope: ${scope.label}. Change`}
                  aria-expanded={props['aria-expanded']}
                  data-state={props['data-state']}
                  onclick={(event: MouseEvent) => {
                    buttonProps.onclick?.(event);
                    props.onclick?.(event);
                  }}
                >
                  {@render badge(scope.kind, scope.label, currentDepartment?.logoUrl ?? null)}
                  <span class="group-data-[collapsible=icon]:hidden grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-medium">{scope.label}</span>
                    <span class="truncate text-xs text-muted-foreground">Department scope</span>
                  </span>
                  <ChevronsUpDown class="ml-auto size-4 group-data-[collapsible=icon]:hidden" aria-hidden="true" />
                </button>
              {/snippet}
            </SidebarMenuButton>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-72 max-w-[calc(100vw-2rem)] rounded-lg"
          side={collapsed ? 'right' : 'bottom'}
          align="start"
          sideOffset={4}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div onkeydown={onKeydown} bind:this={listEl} data-testid="scope-menu">
            {#if departments.length >= SEARCH_MIN}
              <input
                bind:this={searchEl}
                bind:value={query}
                type="search"
                placeholder="Find department…"
                aria-label="Find department"
                class="mb-1 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-ring/40"
              />
            {/if}
            <div role="menu" aria-label="Department scope" class="flex max-h-72 flex-col overflow-y-auto">
              <button type="button" role="menuitemradio" aria-checked={currentValue === 'all'} class={optionClass} onclick={() => choose('all')}>
                {@render badge('all', 'All departments', null)}
                <span class="min-w-0 flex-1 truncate">All departments</span>
                {#if currentValue === 'all'}<Check class="size-4" aria-hidden="true" />{/if}
              </button>
              <button type="button" role="menuitemradio" aria-checked={currentValue === 'main'} class={optionClass} onclick={() => choose('main')}>
                {@render badge('main', 'Main page', null)}
                <span class="grid min-w-0 flex-1 leading-tight">
                  <span class="truncate">Main page</span>
                  <span class="truncate text-xs text-muted-foreground">General content</span>
                </span>
                {#if currentValue === 'main'}<Check class="size-4" aria-hidden="true" />{/if}
              </button>
              <div class="my-1 h-px bg-border" role="separator"></div>
              {#each shown as department (department.id)}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={currentValue === String(department.id)}
                  class={optionClass}
                  onclick={() => choose(String(department.id))}
                >
                  {@render badge('department', department.name, department.logoUrl)}
                  <span class="min-w-0 flex-1 truncate">{department.name}</span>
                  {#if currentValue === String(department.id)}<Check class="size-4" aria-hidden="true" />{/if}
                </button>
              {/each}
              {#if shown.length === 0}
                <p class="px-2 py-1.5 text-xs text-muted-foreground">No departments match.</p>
              {/if}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    {/if}
  </SidebarMenuItem>
</SidebarMenu>
