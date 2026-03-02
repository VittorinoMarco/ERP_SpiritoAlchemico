<script lang="ts">
  type Variant = 'default' | 'accent' | 'dark';

  export let variant: Variant = 'default';
  export let className = '';

  const base =
    'rounded-3xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 lg:p-7 transition-all duration-200';
</script>

<div
  class={`${base} ${className}`}
  class:bg-white={variant === 'default'}
  class:bg-[#FFF3CD]={variant === 'accent'}
  class:bg-[#1A1A1A]={variant === 'dark'}
  class:text-white={variant === 'dark'}
>
  <slot />
</div>

