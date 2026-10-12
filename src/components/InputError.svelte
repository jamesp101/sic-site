<script lang="ts">
    let {
        message = '',
        class: className = '',
    }: {
        message?: string;
        class?: string;
    } = $props();
</script>

{#if message}
    <div class={className}>
        <p class="text-sm text-destructive">{message}</p>
    </div>
{/if}
