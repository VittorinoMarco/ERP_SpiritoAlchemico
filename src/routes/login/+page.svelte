<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { ActionData } from './$types';

  export let form: ActionData | null = null;

  let email = form?.values?.email ?? '';
  let password = '';
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

    <form method="POST" class="space-y-4">
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

      {#if form?.error}
        <p class="text-xs text-rose-600 mt-1">
          {form.error}
        </p>
      {/if}

      <Button variant="primary" type="submit" className="w-full mt-4">
        Accedi
      </Button>
    </form>
  </Card>
</div>

