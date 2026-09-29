<script lang="ts">
  import '../app.css';
</script>

<!-- Layout radice volutamente minimale: la shell (sidebar/navigazione) sta in (app)/+layout.svelte,
     così login, logout e pagine pubbliche non mostrano la navigazione. -->
<slot />
