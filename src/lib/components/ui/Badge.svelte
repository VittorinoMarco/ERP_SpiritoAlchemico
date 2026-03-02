<script lang="ts">
  export let colore: 'default' | 'giallo' | 'verde' | 'rosso' = 'default';
  export let className = '';
</script>

<span
  class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
    colore === 'default'
      ? 'bg-[#F3F4F6] text-[#1F2933]'
      : colore === 'giallo'
      ? 'bg-[#F5D547]/90 text-[#1A1A1A]'
      : colore === 'verde'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-rose-100 text-rose-800'
  } ${className}`}
>
  <slot />
</span>

