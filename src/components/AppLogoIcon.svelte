<script lang="ts">
  let {
    class: className = '',
    ...rest
  }: {
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<img src="/sic-seal.png" alt="San Isidro College seal" class={className} {...rest} />
