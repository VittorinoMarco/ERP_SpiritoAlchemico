<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { pb } from '$lib/pocketbase';

  let email = '';

  onMount(() => {
    if (pb.authStore.isValid) {
      goto('/');
    }
  });
  let password = '';
  let error = '';
  let loading = false;

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      const auth = await pb.collection('users').authWithPassword(email, password);
      try {
        await pb.collection('activity_log').create({
          utente: auth.record?.id,
          azione: 'login',
          collection_rif: 'users',
          record_rif: auth.record?.id ?? '',
          dettagli: JSON.stringify({ messaggio: 'Accesso effettuato' })
        });
      } catch {
        // ignore log errors
      }
      goto('/');
    } catch {
      error = 'Credenziali non valide.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4">
  <Card className="w-full max-w-md">
    <div class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight text-[#1A1A1A]">
        SpiritoAlchemico
      </h1>
      <p class="mt-2 text-sm text-[#6B7280]">
        Accedi al pannello di controllo ERP.
      </p>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
      <Input
        id="email"
        label="Email"
        type="email"
        placeholder="nome@azienda.it"
        bind:value={email}
        required
      />

      <Input
        id="password"
        label="Password"
        type="password"
        placeholder="••••••••"
        bind:value={password}
        required
      />

      {#if error}
        <p class="text-xs text-rose-600 mt-1">
          {error}
        </p>
      {/if}

      <Button variant="primary" type="submit" className="w-full mt-4" disabled={loading}>
        {loading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  </Card>
</div>
