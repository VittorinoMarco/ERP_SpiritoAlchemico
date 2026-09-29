<script lang="ts">
  export let id: string | undefined = undefined;
  export let label: string | undefined = undefined;
  export let type = 'text';
  export let placeholder = '';
  export let value: string | number | null = '';
  export let disabled = false;
  export let required = false;
  export let error: string | null = null;
  export let hint: string | undefined = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export let autocomplete: any = undefined;
  // step, min, max, inputmode… vengono inoltrati all'<input> tramite $$restProps
</script>

<div class="space-y-1.5">
  {#if label}
    <label for={id} class="block text-sm font-medium text-[#1A1A1A]">
      {label}
      {#if required}<span class="text-rose-500" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <input
    {...$$restProps}
    {id}
    {type}
    class="field {error ? '!border-rose-300' : ''}"
    {placeholder}
    bind:value
    {disabled}
    {required}
    {autocomplete}
    aria-invalid={error ? 'true' : 'false'}
    aria-describedby={error ? `${id}-error` : undefined}
  />

  {#if error}
    <p id={`${id}-error`} class="text-xs text-rose-600">{error}</p>
  {:else if hint}
    <p class="text-xs text-[#9CA3AF]">{hint}</p>
  {/if}
</div>
