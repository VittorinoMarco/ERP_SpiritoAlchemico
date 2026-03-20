/// <reference types="vite/client" />
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

import type PocketBase from 'pocketbase';

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      user: import('pocketbase').RecordModel | null;
    }
    interface PageData {
      user: import('pocketbase').RecordModel | null;
    }
    // interface Error {}
    // interface Platform {}
  }
}

export {};

