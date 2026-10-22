<script lang="ts">
  let {
    class: className = '',
    ...rest
  }: {
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<img src="/sic-seal-96.webp" alt="San Isidro College seal" width="96" height="96" class={className} {...rest} />
