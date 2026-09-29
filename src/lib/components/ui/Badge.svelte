<script lang="ts">
  export let colore: 'default' | 'giallo' | 'verde' | 'rosso' | 'blu' | 'arancio' = 'default';
  export let className = '';

  const colors = {
    default: 'bg-[#F3F4F6] text-[#374151]',
    giallo: 'bg-[#F5D547]/90 text-[#1A1A1A]',
    verde: 'bg-emerald-100 text-emerald-800',
    rosso: 'bg-rose-100 text-rose-800',
    blu: 'bg-blue-100 text-blue-800',
    arancio: 'bg-orange-100 text-orange-800'
  } as const;
</script>

<span
  class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${colors[colore]} ${className}`}
>
  <slot />
</span>
