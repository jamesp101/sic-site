<script lang="ts">
  import LogOut from '@lucide/svelte/icons/log-out';
  import Settings from '@lucide/svelte/icons/settings';
  import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
  } from '@/components/ui/dropdown-menu';
  import UserInfo from '@/components/UserInfo.svelte';
  import type { AdminUser } from '@/components/admin/types';
  import { authClient } from '@/lib/auth-client';

  let {
    user,
  }: {
    user: Pick<AdminUser, 'name' | 'email'>;
  } = $props();

  async function logout() {
    await authClient.signOut();
    window.location.assign('/login');
  }
</script>

<DropdownMenuLabel class="p-0 font-normal">
  <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
    <UserInfo {user} showEmail />
  </div>
</DropdownMenuLabel>
<DropdownMenuSeparator />
<DropdownMenuGroup>
  <DropdownMenuItem asChild>
    {#snippet children(props)}
      <a class={props.class} href="/settings/profile" onclick={props.onClick}>
        <Settings class="mr-2 h-4 w-4" />
        Settings
      </a>
    {/snippet}
  </DropdownMenuItem>
</DropdownMenuGroup>
<DropdownMenuSeparator />
<DropdownMenuItem asChild>
  {#snippet children(props)}
    <button type="button" class={props.class} onclick={() => { props.onClick?.(); void logout(); }} data-test="logout-button">
      <LogOut class="mr-2 h-4 w-4" />
      Log out
    </button>
  {/snippet}
</DropdownMenuItem>
