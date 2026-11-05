<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import { actionForm } from '../shared/action-form.svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import { inputClass } from '../shared/form-utils';

  export interface UserFormValues {
    id: number;
    name: string;
    email: string;
    role: 'superadmin' | 'department_user';
    departmentId: number | null;
  }

  let { user = null, departments = [] }: { user?: UserFormValues | null; departments?: { id: number; name: string }[] } = $props();

  const initial = untrack(() => user);
  let name = $state(initial?.name ?? '');
  let email = $state(initial?.email ?? '');
  let password = $state('');
  let role = $state<'superadmin' | 'department_user'>(initial?.role ?? 'department_user');
  let departmentId = $state(initial?.departmentId != null ? String(initial.departmentId) : '');

  const form = actionForm({
    conflictField: 'email',
    run() {
      const payload = {
        name,
        email,
        role,
        departmentId: role === 'department_user' && departmentId ? Number(departmentId) : null,
      };
      return initial
        ? actions.users.update({ id: initial.id, ...payload, password: password || null })
        : actions.users.create({ ...payload, password });
    },
    onSuccess: () => navigate('/admin/users'),
  });
</script>

<form method="post" onsubmit={form.submit} class="space-y-6 rounded-xl border border-border bg-card p-6 shadow-brand-sm">
  <div class="grid gap-6 md:grid-cols-2">
    <Field id="name" label="Full name" required error={form.errors.name}>
      <input id="name" type="text" required maxlength="255" autocomplete="name" bind:value={name} class={inputClass} />
    </Field>
    <Field id="email" label="Email address" required error={form.errors.email}>
      <input id="email" type="email" required maxlength="255" autocomplete="off" bind:value={email} class={inputClass} />
    </Field>
    <Field
      id="password"
      label={initial ? 'New password' : 'Password'}
      required={!initial}
      error={form.errors.password}
      hint={initial ? 'Leave empty to keep the current password. Minimum 8 characters.' : 'Minimum 8 characters.'}
    >
      <input id="password" type="password" required={!initial} minlength="8" autocomplete="new-password" bind:value={password} class={inputClass} />
    </Field>
    <Field id="role" label="Role" required error={form.errors.role}>
      <select id="role" bind:value={role} class={inputClass}>
        <option value="department_user">Department editor</option>
        <option value="superadmin">Super admin</option>
      </select>
    </Field>
    {#if role === 'department_user'}
      <Field id="departmentId" label="Department" required error={form.errors.departmentId} class="md:col-span-2">
        <select id="departmentId" required bind:value={departmentId} class={inputClass}>
          <option value="">Select a department</option>
          {#each departments as department (department.id)}
            <option value={String(department.id)}>{department.name}</option>
          {/each}
        </select>
      </Field>
    {/if}
  </div>

  <FormActions cancelHref="/admin/users" processing={form.processing} submitLabel={initial ? 'Save changes' : 'Create user'} message={form.message} />
</form>
