<script lang="ts">
  import '../app.css';
  import Navbar from '$lib/components/layout/Navbar.svelte';

  export let data;
</script>

<div class="min-h-screen flex flex-col">
  <header class="sticky top-0 z-30 flex justify-center pt-4 pb-2 px-4">
    <Navbar user={data.user} />
  </header>

  <main class="flex-1 px-4 pb-8 pt-4 lg:px-8 lg:pt-6">
    <slot />
  </main>
</div>

