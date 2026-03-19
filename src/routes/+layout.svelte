<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import Navbar from '$lib/components/layout/Navbar.svelte';
  import { pb } from '$lib/pocketbase';
  import { sottoScortaCount } from '$lib/stores/magazzino';

  export let data;

  onMount(async () => {
    if (data?.user) {
      try {
        const inv = await pb.collection('inventory').getFullList();
        sottoScortaCount.set(inv.filter((i) => (i.giacenza ?? 0) < (i.giacenza_minima ?? 0)).length);
      } catch {
        sottoScortaCount.set(0);
      }
    }
  });
</script>

<div class="min-h-screen flex flex-col">
  <header class="sticky top-0 z-30 flex justify-center pt-3 pb-2 px-2 sm:pt-4 sm:px-4">
    <Navbar user={data.user} />
  </header>

  <main class="flex-1 px-4 pb-8 pt-4 lg:px-8 lg:pt-6">
    <slot />
  </main>
</div>

