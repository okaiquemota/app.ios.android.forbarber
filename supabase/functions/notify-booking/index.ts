// ============================================================================
// Função de borda "notify-booking": recebe do banco (gatilho appointments_push,
// via pg_net) o que mudou na agenda e avisa o celular de quem deve saber.
//
// Publicar:  supabase functions deploy notify-booking --no-verify-jwt
// Segredos:  FORBARBER_PUSH_SECRET (o mesmo guardado no Vault do banco),
//            FCM_SERVICE_ACCOUNT (JSON da conta de serviço do Firebase),
//            APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID e, opcional, APNS_BUNDLE_ID
//            e APNS_SANDBOX=true (app instalado pelo Xcode).
// Passo a passo completo no README.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMessage, deliver, loadConfig, sameSecret, type Device, type Payload } from './push.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = Deno.env.get('FORBARBER_PUSH_SECRET') || '';
  if (!secret || !sameSecret(req.headers.get('x-forbarber-secret') || '', secret)) return json({ error: 'Não autorizado.' }, 403);

  let p: Payload;
  try {
    p = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!p || !p.appointment_id || !p.shop_id || !p.event) return json({ error: 'Faltam dados.' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: devices, error: devErr } = await sb.rpc('push_recipients', {
    p_shop: p.shop_id, p_event: p.event, p_barber: p.barber_id, p_old_barber: p.old_barber_id || null, p_actor: p.actor || null,
  });
  if (devErr) return json({ error: devErr.message }, 500);
  if (!devices || !devices.length) return json({ sent: 0, reason: 'ninguém para avisar' });

  const { data: appt, error: apptErr } = await sb.from('appointments')
    .select('id, date, start_time, services, client_id, barber_id').eq('id', p.appointment_id).maybeSingle();
  if (apptErr || !appt) return json({ error: 'Agendamento não encontrado.' }, 404);
  const [client, barber, shop] = await Promise.all([
    sb.from('clients').select('name').eq('id', appt.client_id).maybeSingle(),
    sb.from('barbers').select('name').eq('id', appt.barber_id).maybeSingle(),
    sb.from('shops').select('slug, name, settings').eq('id', p.shop_id).maybeSingle(),
  ]);
  if (!shop.data) return json({ error: 'Barbearia não encontrada.' }, 404);

  const msg = buildMessage(p, appt, {
    client: client.data?.name || 'Cliente',
    barber: barber.data?.name || 'a equipe',
    shopName: shop.data.name,
    slug: shop.data.slug,
    timeZone: shop.data.settings?.timezone,
  });
  const result = await deliver(devices as Device[], msg, loadConfig((k) => Deno.env.get(k)));
  // Celular que desinstalou o app ou trocou de conta: some da lista
  if (result.invalid.length) await sb.from('push_devices').delete().in('token', result.invalid);
  return json({ sent: result.sent, failed: result.failed, skipped: result.skipped, removed: result.invalid.length });
});
