<script lang="ts">
  type Variant = 'default' | 'accent' | 'dark' | 'yellow' | 'orange' | 'blue' | 'muted';

  export let variant: Variant = 'default';
  export let className = '';
  /** Alias di className (molte pagine usano `class=`). */
  let klass = '';
  export { klass as class };

  // Le pagine passano spesso `p-0` / `!p-0` per le tabelle a filo: qui lo rispettiamo davvero
  // (altrimenti `p-6` e `p-0` si contendono la stessa proprietà).
  $: flush = /(^|\s)!?p-0(\s|$)/.test(`${className} ${klass}`);

  const variants: Record<Variant, string> = {
    default:
      'bg-white/90 border border-white text-[#1A1A1A] shadow-[0_1px_2px_rgba(16,16,16,0.04),0_12px_32px_-16px_rgba(16,16,16,0.12)]',
    accent: 'bg-[#FFF3CD] border border-[#F5D547]/30 text-[#1A1A1A]',
    yellow: 'bg-[#F5D547] text-[#1A1A1A] shadow-[0_12px_32px_-16px_rgba(245,213,71,0.7)]',
    orange: 'bg-[#FF9F43] text-[#1A1A1A] shadow-[0_12px_32px_-16px_rgba(255,159,67,0.7)]',
    blue: 'bg-[#3B6CFF] text-white shadow-[0_12px_32px_-16px_rgba(59,108,255,0.7)]',
    dark: 'bg-[#1A1A1A] text-white shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]',
    muted: 'bg-white/55 border border-white/70 text-[#1A1A1A] backdrop-blur'
  };
</script>

<div
  class={`rounded-[28px] transition-shadow duration-200 ${flush ? '' : 'p-5 lg:p-6'} ${variants[variant]} ${className} ${klass}`}
>
  <slot />
</div>
