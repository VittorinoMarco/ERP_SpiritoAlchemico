<script lang="ts">
  type Variant = 'primary' | 'secondary' | 'ghost';
  type Size = 'sm' | 'md';

  export let variant: Variant = 'primary';
  export let size: Size = 'md';
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let disabled = false;
  export let className = '';

  const sizeClasses: Record<Size, string> = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm'
  };

  const variantClasses: Record<Variant, string> = {
    primary: 'bg-[#1A1A1A] text-white',
    secondary: 'bg-[#F5D547] text-[#1A1A1A]',
    ghost: 'bg-transparent text-[#1A1A1A] border border-black/5'
  };
</script>

<button
  {type}
  class={`inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F5D547] ${sizeClasses[size]} ${
    disabled ? 'opacity-60 pointer-events-none' : variantClasses[variant]
  } ${className}`}
  class:opacity-60={disabled}
  class:pointer-events-none={disabled}
  disabled={disabled}
>
  <slot />
</button>

