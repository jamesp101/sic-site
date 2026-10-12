<script lang="ts">
  import { Avatar, AvatarFallback } from '@/components/ui/avatar';
  import type { AdminUser } from '@/components/admin/types';
  import { getInitials } from '@/lib/initials';

  let {
    user,
    showEmail = false,
  }: {
    user: Pick<AdminUser, 'name' | 'email'>;
    showEmail?: boolean;
  } = $props();
</script>

<Avatar class="h-8 w-8 overflow-hidden rounded-lg">
  <AvatarFallback class="rounded-lg bg-secondary font-semibold text-secondary-foreground">
    {getInitials(user.name)}
  </AvatarFallback>
</Avatar>

<div class="grid flex-1 text-left text-sm leading-tight">
  <span class="truncate font-medium">{user.name}</span>
  {#if showEmail}
    <span class="truncate text-xs text-muted-foreground">{user.email}</span>
  {/if}
</div>
