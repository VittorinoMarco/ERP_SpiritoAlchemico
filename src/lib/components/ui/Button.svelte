<script lang="ts">
  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md';

  export let variant: Variant = 'primary';
  export let size: Size = 'md';
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let disabled = false;
  export let className = '';
  /** Alias di className (molte pagine usano `class=`). */
  let klass = '';
  export { klass as class };
  /** @type {((e: MouseEvent) => void) | undefined} */
  export let onclick: ((e: MouseEvent) => void) | undefined = undefined;

  const sizeClasses: Record<Size, string> = {
    sm: 'min-h-[40px] px-4 py-2 text-sm',
    md: 'min-h-[44px] px-5 py-2.5 text-sm'
  };

  const variantClasses: Record<Variant, string> = {
    primary: 'bg-[#1A1A1A] text-white hover:bg-black shadow-sm',
    secondary: 'bg-[#F5D547] text-[#1A1A1A] hover:bg-[#EFCB31] shadow-sm',
    ghost: 'bg-white/80 text-[#1A1A1A] border border-black/[0.07] hover:bg-white',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
  };
</script>

<button
  {...$$restProps}
  {type}
  {onclick}
  {disabled}
  class={`inline-flex items-center justify-center gap-2 rounded-2xl font-medium whitespace-nowrap select-none transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F5D547] ${sizeClasses[size]} ${variantClasses[variant]} ${
    disabled ? 'opacity-50 pointer-events-none' : ''
  } ${className} ${klass}`}
>
  <slot />
</button>
