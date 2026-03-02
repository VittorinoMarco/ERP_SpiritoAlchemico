import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const ADMIN_ROLE = 'admin';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== ADMIN_ROLE) {
    throw redirect(302, '/');
  }

  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== ADMIN_ROLE) {
      throw redirect(302, '/');
    }

    const formData = await request.formData();
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const nome = String(formData.get('nome') ?? '').trim();
    const ruolo = String(formData.get('ruolo') ?? '').trim();

    if (!email || !password || !nome || !ruolo) {
      return fail(400, {
        error: 'Tutti i campi sono obbligatori.',
        values: { email, nome, ruolo }
      });
    }

    try {
      await locals.pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name: nome,
        role: ruolo
      });
    } catch {
      return fail(400, {
        error: 'Errore nella creazione dell’utente.',
        values: { email, nome, ruolo }
      });
    }

    return {
      success: true
    };
  }
};

