<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import { notificationsStore } from '$lib/stores/notifications';

  onMount(() => {
    notificationsStore.reset();
    pb.authStore.clear();
    goto('/login', { replaceState: true });
  });
</script>

<div class="min-h-dvh flex items-center justify-center text-sm text-[#6B7280]">Disconnessione in corso…</div>
