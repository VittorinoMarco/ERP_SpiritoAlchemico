<script lang="ts">
  export let label = 'Caricamento…';
  export let className = 'py-16';
</script>

<div class="flex items-center justify-center gap-3 text-sm text-[#6B7280] {className}" role="status">
  <span
    class="h-5 w-5 rounded-full border-2 border-[#F5D547] border-t-[#1A1A1A] animate-spin"
    aria-hidden="true"
  ></span>
  {label}
</div>
