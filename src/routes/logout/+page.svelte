<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';

  onMount(() => {
    pb.authStore.clear();
    goto('/login');
  });
</script>

<p class="p-4 text-center text-[#6B7280]">Disconnessione in corso...</p>
