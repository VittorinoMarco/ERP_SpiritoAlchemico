<script lang="ts">
  export let id: string | undefined = undefined;
  export let label: string | undefined = undefined;
  export let type = 'text';
  export let placeholder = '';
  export let value: string | number | null = '';
  export let disabled = false;
  export let required = false;
  export let error: string | null = null;
</script>

<div class="space-y-1.5">
  {#if label}
    <label for={id} class="block text-sm font-medium text-[#1A1A1A]">
      {label}
    </label>
  {/if}

  <input
    {id}
    {type}
    class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
    {placeholder}
    bind:value
    {disabled}
    {required}
    aria-invalid={error ? 'true' : 'false'}
    aria-describedby={error ? `${id}-error` : undefined}
  />

  {#if error}
    <p id={`${id}-error`} class="text-xs text-rose-600">
      {error}
    </p>
  {/if}
</div>

