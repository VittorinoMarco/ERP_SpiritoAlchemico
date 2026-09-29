<script lang="ts">
  import type { SvelteComponent } from 'svelte';

  export let label: string;
  export let valore: string;
  export let trend: 'up' | 'down' | 'flat' | null = null;
  export let trendLabel: string | null = null;
  // Tipizzato in modo ampio per supportare icone come lucide-svelte
  export let icon: typeof SvelteComponent<any> | null = null;
  export let tone: 'default' | 'yellow' | 'orange' | 'dark' | 'blue' = 'default';

  const tones = {
    default: {
      box: 'bg-white/90 border border-white text-[#1A1A1A] shadow-[0_1px_2px_rgba(16,16,16,0.04),0_12px_32px_-16px_rgba(16,16,16,0.12)]',
      label: 'text-[#6B7280]',
      icon: 'bg-[#1A1A1A] text-[#F5D547]',
      pill: 'bg-[#F3F4F6] text-[#374151]'
    },
    yellow: {
      box: 'bg-[#F5D547] text-[#1A1A1A] shadow-[0_12px_32px_-16px_rgba(245,213,71,0.8)]',
      label: 'text-[#1A1A1A]/70',
      icon: 'bg-[#1A1A1A] text-[#F5D547]',
      pill: 'bg-black/10 text-[#1A1A1A]'
    },
    orange: {
      box: 'bg-[#FF9F43] text-[#1A1A1A] shadow-[0_12px_32px_-16px_rgba(255,159,67,0.8)]',
      label: 'text-[#1A1A1A]/70',
      icon: 'bg-[#1A1A1A] text-white',
      pill: 'bg-black/10 text-[#1A1A1A]'
    },
    blue: {
      box: 'bg-[#3B6CFF] text-white shadow-[0_12px_32px_-16px_rgba(59,108,255,0.8)]',
      label: 'text-white/75',
      icon: 'bg-white text-[#3B6CFF]',
      pill: 'bg-white/20 text-white'
    },
    dark: {
      box: 'bg-[#1A1A1A] text-white shadow-[0_12px_32px_-16px_rgba(0,0,0,0.55)]',
      label: 'text-white/60',
      icon: 'bg-[#F5D547] text-[#1A1A1A]',
      pill: 'bg-white/10 text-white/80'
    }
  } as const;

  $: t = tones[tone];
</script>

<div class="rounded-[28px] p-5 lg:p-6 flex items-start justify-between gap-3 min-w-0 {t.box}">
  <div class="min-w-0">
    <p class="text-[11px] font-semibold uppercase tracking-wider {t.label}">
      {label}
    </p>
    <p class="mt-2 text-2xl sm:text-3xl font-bold tracking-tight truncate">
      {valore}
    </p>

    {#if trend !== null && trendLabel}
      <div class="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium {t.pill}">
        {#if trend === 'up'}
          <span class="text-emerald-500">▲</span>
        {:else if trend === 'down'}
          <span class="text-rose-500">▼</span>
        {:else}
          <span class="opacity-50">■</span>
        {/if}
        <span class="truncate">{trendLabel}</span>
      </div>
    {/if}
  </div>

  {#if icon}
    <div class="h-11 w-11 flex-shrink-0 rounded-2xl flex items-center justify-center {t.icon}">
      <svelte:component this={icon} class="h-5 w-5" />
    </div>
  {/if}
</div>
