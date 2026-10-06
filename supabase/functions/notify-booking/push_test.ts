// Testes do envio de avisos. Rode com: deno test supabase/functions/notify-booking/
import { apnsJwt, b64url, buildMessage, dayLabel, deliver, fcmAccessToken, loadConfig, sameSecret, type Config } from './push.ts';

function assert(ok: unknown, msg: string) {
  if (!ok) throw new Error(`FALHOU: ${msg}`);
}
function eq<T>(a: T, b: T, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FALHOU: ${msg}\n  recebido: ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
}

const NOW = new Date('2026-10-05T15:00:00Z'); // segunda, meio-dia em São Paulo
const APPT = { id: 'a1', date: '2026-10-06', start_time: '10:00:00', services: [{ name: 'Corte' }, { name: 'Barba' }] };
const INFO = { client: 'Caio Silva', barber: 'Rodrigo', shopName: 'Grey Barber', slug: 'greybarber', timeZone: 'America/Sao_Paulo' };

async function pem(key: CryptoKey) {
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key));
  let bin = '';
  der.forEach((b) => (bin += String.fromCharCode(b)));
  return `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
}
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

Deno.test('texto: novo agendamento para amanhã', () => {
  const m = buildMessage({ event: 'novo', appointment_id: 'a1', shop_id: 's', barber_id: 'b' }, APPT, INFO, NOW);
  eq(m.title, 'Novo agendamento · Grey Barber', 'título');
  eq(m.body, 'Caio Silva · Corte + Barba · amanhã às 10:00 com Rodrigo', 'corpo');
  eq(m.data, { slug: 'greybarber', path: 'painel/agenda.html?data=2026-10-06&a=a1', event: 'novo' }, 'dados para abrir a agenda');
});

Deno.test('texto: remarcação mostra o horário de antes', () => {
  const m = buildMessage({ event: 'remarcado', appointment_id: 'a1', shop_id: 's', barber_id: 'b', previous: { date: '2026-10-05', start: '17:30' } }, APPT, INFO, NOW);
  eq(m.title, 'Horário remarcado · Grey Barber', 'título');
  assert(m.body.endsWith('(antes: hoje às 17:30)'), 'corpo cita o horário antigo');
});

Deno.test('dia da semana para datas mais longe', () => {
  eq(dayLabel('2026-10-09', '2026-10-05'), 'sex, 09/10', 'sexta');
  eq(dayLabel('2026-10-05', '2026-10-05'), 'hoje', 'hoje');
});

Deno.test('Firebase: conta de serviço assina RS256 válido', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  ) as CryptoKeyPair;
  // como vem do Firebase dentro de uma variável de ambiente: \n escapado
  const json = JSON.stringify({ project_id: 'forbarber-teste', client_email: 'push@forbarber-teste.iam.gserviceaccount.com', private_key: await pem(pair.privateKey) });
  const cfg = loadConfig((k) => (k === 'FCM_SERVICE_ACCOUNT' ? json : undefined));
  let assertion = '';
  const token = await fcmAccessToken(cfg.fcm!, (async (_url: string, init: RequestInit) => {
    assertion = new URLSearchParams(String(init.body)).get('assertion')!;
    return new Response(JSON.stringify({ access_token: 'ya29.teste' }));
  }) as typeof fetch, NOW.getTime());
  eq(token, 'ya29.teste', 'token de acesso');
  const [h, c, s] = assertion.split('.');
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
  eq(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging', 'escopo do FCM');
  eq(claims.iss, 'push@forbarber-teste.iam.gserviceaccount.com', 'emissor');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${c}`));
  assert(ok, 'assinatura confere com a chave pública');
});

Deno.test('Apple: chave .p8 assina ES256 válido', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwt = await apnsJwt({ key: await pem(pair.privateKey), keyId: 'ABC123DEFG', teamId: 'TEAM123456', bundleId: 'br.com.movcode.forbarber.pro', sandbox: false }, NOW.getTime());
  const [h, c, s] = jwt.split('.');
  eq(JSON.parse(new TextDecoder().decode(fromB64url(h))), { alg: 'ES256', kid: 'ABC123DEFG' }, 'cabeçalho');
  eq(fromB64url(s).length, 64, 'assinatura no formato r||s');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${c}`));
  assert(ok, 'assinatura confere com a chave pública');
});

Deno.test('entrega: separa enviados, celulares de teste e aparelhos que sumiram', async () => {
  const rsa = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign'],
  ) as CryptoKeyPair;
  const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair;
  const cfg: Config = {
    fcm: { projectId: 'p', clientEmail: 'e@x', privateKey: await pem(rsa.privateKey), tokenUri: 'https://oauth2.googleapis.com/token' },
    apns: { key: await pem(ec.privateKey), keyId: 'K', teamId: 'T', bundleId: 'br.com.movcode.forbarber.pro', sandbox: false },
  };
  const calls: string[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push(url);
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok' }));
    if (url.includes('fcm.googleapis.com')) {
      const body = JSON.parse(String(init.body));
      eq(body.message.android.notification.channel_id, 'agendamentos', 'canal de notificação do Android');
      return body.message.token === 'android-ok'
        ? new Response('{}')
        : new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    }
    const headers = init.headers as Record<string, string>;
    eq(headers['apns-topic'], 'br.com.movcode.forbarber.pro', 'tópico da Apple (app Pro)');
    if (url.endsWith('/ios-xcode')) {
      return url.includes('sandbox') ? new Response(null, { status: 200 }) : new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 });
    }
    return new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 });
  }) as typeof fetch;
  const msg = { title: 't', body: 'b', data: { slug: 's', path: 'p', event: 'novo' } };
  const r = await deliver([
    { token: 'android-ok', platform: 'android' },
    { token: 'android-velho', platform: 'android' },
    { token: 'ios-xcode', platform: 'ios' },
    { token: 'ios-desinstalado', platform: 'ios' },
  ], msg, cfg, fake, NOW.getTime());
  eq(r.sent, 2, 'dois avisos entregues (um pelo sandbox da Apple)');
  eq(r.invalid.sort(), ['android-velho', 'ios-desinstalado'], 'aparelhos inválidos para apagar');
  assert(calls.some((u) => u === 'https://api.sandbox.push.apple.com/3/device/ios-xcode'), 'tentou o sandbox para o celular do Xcode');
});

Deno.test('sem Firebase/Apple configurados: não envia nada', async () => {
  const r = await deliver([{ token: 'x', platform: 'android' }, { token: 'y', platform: 'ios' }], { title: '', body: '', data: {} }, {}, (() => {
    throw new Error('não deveria chamar a rede');
  }) as typeof fetch);
  eq(r, { sent: 0, failed: 0, skipped: 2, invalid: [] }, 'pula os dois');
});

Deno.test('segredo do gatilho', () => {
  assert(sameSecret('abc123', 'abc123'), 'igual');
  assert(!sameSecret('abc123', 'abc124'), 'diferente');
  assert(!sameSecret('abc', 'abc123'), 'tamanho diferente');
  eq(b64url('ok?'), 'b2s_', 'base64url sem preenchimento');
});
