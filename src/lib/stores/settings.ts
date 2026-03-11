import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'erp_settings';

export interface AppSettings {
  openaiApiKey?: string;
  ecommerceWebhookUrl?: string;
  ecommerceApiKey?: string;
  backupApiUrl?: string;
  backupApiSecret?: string;
}

function loadSettings(): AppSettings {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppSettings;
      return { ...parsed };
    }
  } catch {
    // ignore
  }
  return {};
}

function saveSettings(s: AppSettings) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<AppSettings>(loadSettings());

  return {
    subscribe,
    setOpenAiKey: (key: string) => {
      update((s) => {
        const next = { ...s, openaiApiKey: key || undefined };
        saveSettings(next);
        return next;
      });
    },
    setEcommerceConfig: (webhookUrl: string, apiKey: string) => {
      update((s) => {
        const next = {
          ...s,
          ecommerceWebhookUrl: webhookUrl || undefined,
          ecommerceApiKey: apiKey || undefined
        };
        saveSettings(next);
        return next;
      });
    },
    setBackupConfig: (url: string, secret: string) => {
      update((s) => {
        const next = {
          ...s,
          backupApiUrl: url || undefined,
          backupApiSecret: secret || undefined
        };
        saveSettings(next);
        return next;
      });
    }
  };
}

export const settingsStore = createSettingsStore();
