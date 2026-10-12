<script lang="ts">
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from '@/components/ui/breadcrumb';
  import type { BreadcrumbItem as BreadcrumbItemType } from '@/components/admin/types';

  let {
    breadcrumbs = [],
  }: {
    breadcrumbs: BreadcrumbItemType[];
  } = $props();
</script>

<Breadcrumb>
  <BreadcrumbList>
    {#each breadcrumbs as item, index (index)}
      <BreadcrumbItem>
        {#if index === breadcrumbs.length - 1 || !item.href}
          <BreadcrumbPage>{item.title}</BreadcrumbPage>
        {:else}
          <BreadcrumbLink href={item.href}>{item.title}</BreadcrumbLink>
        {/if}
      </BreadcrumbItem>
      {#if index !== breadcrumbs.length - 1}
        <BreadcrumbSeparator />
      {/if}
    {/each}
  </BreadcrumbList>
</Breadcrumb>
