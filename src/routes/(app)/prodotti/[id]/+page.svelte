<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProductModal from '$lib/components/products/ProductModal.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import type { Product, ProductCategory } from '$lib/types/product';
  import { CATEGORY_LABELS, CATEGORY_BADGE_COLORS } from '$lib/types/product';
  import { ArrowLeft, Edit, Power, PowerOff, ImageOff } from 'lucide-svelte';

  const productId = $page.params.id;

  let product: Product | null = null;
  let loading = true;
  let modalOpen = false;
  let salesData: { labels: string[]; values: number[] } = { labels: [], values: [] };

  $: lineConfig = {
    data: {
      labels: salesData.labels,
      datasets: [
        {
          label: 'Vendite',
          data: salesData.values,
          borderColor: '#F5D547',
          backgroundColor: 'rgba(245, 200, 71, 0.1)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#F5D547'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#E5E7EB' },
          beginAtZero: true
        }
      }
    }
  };

  onMount(async () => {
    try {
      product = await pb.collection('products').getOne<Product>(productId);
      await loadSalesTrend();
    } catch {
      product = null;
    } finally {
      loading = false;
    }
  });

  async function loadSalesTrend() {
    const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const keys: string[] = [];
    const byMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      keys.push(key);
      byMonth[key] = 0;
    }
    try {
      const orderItems = await pb.collection('order_items').getFullList({
        filter: `prodotto = "${productId}"`,
        expand: 'ordine'
      });
      for (const item of orderItems) {
        const ordine = item.expand?.ordine as { data_ordine?: string } | undefined;
        if (ordine?.data_ordine) {
          const d = new Date(ordine.data_ordine);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (key in byMonth) {
            byMonth[key] = (byMonth[key] ?? 0) + (item.quantita ?? 0);
          }
        }
      }
    } catch {
      // ignore, use zeros
    }
    salesData = {
      labels: keys.map((k) => {
        const [, m] = k.split('-');
        return monthNames[parseInt(m, 10) - 1];
      }),
      values: keys.map((k) => byMonth[k] ?? 0)
    };
  }

  function getImageUrl(p: Product): string {
    if (p?.immagine) {
      return pb.files.getUrl(p as any, p.immagine);
    }
    return '';
  }

  async function toggleAttivo() {
    if (!product) return;
    try {
      product = await pb
        .collection('products')
        .update(product.id, { attivo: !product.attivo }) as Product;
    } catch {
      // ignore
    }
  }

  function handleSaved() {
    pb.collection('products')
      .getOne<Product>(productId)
      .then((p) => {
        product = p;
      });
    modalOpen = false;
  }
</script>

<svelte:head>
  <title>{product?.nome ?? 'Prodotto'} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="p-2 rounded-2xl text-[#6B7280] hover:bg-black/5 transition-colors"
      onclick={() => goto('/prodotti')}
      aria-label="Indietro"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">
      {product?.nome ?? 'Prodotto'}
    </h1>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else if !product}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Prodotto non trovato</p>
        <Button variant="ghost" className="mt-4" onclick={() => goto('/prodotti')}>
          Torna ai prodotti
        </Button>
      </div>
    </Card>
  {:else}
    <div class="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div class="flex flex-col sm:flex-row gap-6">
          <div class="flex-shrink-0">
            {#if getImageUrl(product)}
              <img
                src={getImageUrl(product)}
                alt={product.nome}
                class="h-48 w-48 rounded-2xl object-cover"
              />
            {:else}
              <div
                class="h-48 w-48 rounded-2xl bg-[#E5E7EB] flex items-center justify-center"
              >
                <ImageOff class="h-12 w-12 text-[#9CA3AF]" />
              </div>
            {/if}
          </div>
          <div class="flex-1 min-w-0 space-y-4">
            <div class="flex flex-wrap gap-2">
              <span
                class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {CATEGORY_BADGE_COLORS[
                  product.categoria as ProductCategory
                ] ?? 'bg-gray-100 text-gray-800'}"
              >
                {CATEGORY_LABELS[product.categoria as ProductCategory] ??
                  product.categoria}
              </span>
              <span
                class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {product.attivo
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'}"
              >
                {product.attivo ? 'Attivo' : 'Disattivo'}
              </span>
            </div>
            <dl class="grid gap-2 sm:grid-cols-2">
              <dt class="text-sm text-[#6B7280]">SKU</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">{product.sku}</dd>
              <dt class="text-sm text-[#6B7280]">Prezzo listino</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">
                € {Number(product.prezzo_listino).toFixed(2)}
              </dd>
              <dt class="text-sm text-[#6B7280]">Prezzo HORECA</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">
                € {Number(product.prezzo_horeca).toFixed(2)}
              </dd>
              <dt class="text-sm text-[#6B7280]">Prezzo E-commerce</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">
                € {Number(product.prezzo_ecommerce).toFixed(2)}
              </dd>
              {#if product.volume_ml}
                <dt class="text-sm text-[#6B7280]">Volume</dt>
                <dd class="text-sm font-medium text-[#1A1A1A]">
                  {product.volume_ml} ml
                </dd>
              {/if}
              {#if product.gradazione}
                <dt class="text-sm text-[#6B7280]">Gradazione</dt>
                <dd class="text-sm font-medium text-[#1A1A1A]">
                  {product.gradazione}°
                </dd>
              {/if}
            </dl>
            {#if product.descrizione}
              <div>
                <p class="text-sm text-[#6B7280] mb-1">Descrizione</p>
                <div class="text-sm text-[#1A1A1A] prose prose-sm max-w-none">
                  {@html product.descrizione}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </Card>

      <Card>
        <div class="flex flex-col gap-3">
          <Button
            variant="primary"
            className="rounded-2xl !bg-[#1A1A1A] w-full justify-center"
            onclick={() => (modalOpen = true)}
          >
            <Edit class="h-4 w-4" />
            Modifica
          </Button>
          <Button
            variant={product.attivo ? 'ghost' : 'secondary'}
            className="rounded-2xl w-full justify-center"
            onclick={toggleAttivo}
          >
            {#if product.attivo}
              <PowerOff class="h-4 w-4" />
              Disattiva
            {:else}
              <Power class="h-4 w-4" />
              Attiva
            {/if}
          </Button>
        </div>
      </Card>
    </div>

    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
        Trend vendite ultimi 6 mesi
      </h2>
      <p class="text-xs text-[#6B7280] mb-4">
        Quantità vendute per mese
      </p>
      <div class="h-48">
        <LineChart config={lineConfig} />
      </div>
    </Card>
  {/if}
</div>

{#if product}
  <ProductModal
    open={modalOpen}
    product={product}
    on:close={() => (modalOpen = false)}
    on:saved={handleSaved}
  />
{/if}
