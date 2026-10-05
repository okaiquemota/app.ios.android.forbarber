// ============================================================================
// Envio dos avisos de agendamento para o celular da equipe.
// Android: Firebase Cloud Messaging (API HTTP v1, conta de serviço).
// iPhone: Apple Push Notification service (chave .p8, autenticação por token).
// Sem dependências: as assinaturas usam o Web Crypto do próprio Deno, então
// este arquivo roda igual no Supabase Edge e nos testes (push_test.ts).
// ============================================================================

export type PushEvent = 'novo' | 'remarcado' | 'alterado' | 'cancelado';

export interface Payload {
  event: PushEvent;
  appointment_id: string;
  shop_id: string;
  barber_id: string;
  old_barber_id?: string | null;
  actor?: string | null;
  previous?: { date: string; start: string } | null;
}

export interface Appointment {
  id: string;
  date: string; // AAAA-MM-DD
  start_time: string; // HH:MM ou HH:MM:SS
  services: { name: string }[];
}

export interface Message {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface Device {
  token: string;
  platform: 'android' | 'ios';
}

export interface Config {
  fcm?: { projectId: string; clientEmail: string; privateKey: string; tokenUri: string };
  apns?: { key: string; keyId: string; teamId: string; bundleId: string; sandbox: boolean };
}

type Fetch = typeof fetch;

/* ---------- Texto do aviso ---------- */
const TITLES: Record<PushEvent, string> = {
  novo: 'Novo agendamento',
  remarcado: 'Horário remarcado',
  alterado: 'Agendamento alterado',
  cancelado: 'Agendamento cancelado',
};
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Data de hoje (AAAA-MM-DD) no fuso da barbearia */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** "hoje", "amanhã" ou "sex, 10/10" */
export function dayLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `${WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]}, ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function buildMessage(
  p: Payload,
  appt: Appointment,
  info: { client: string; barber: string; shopName: string; slug: string; timeZone?: string },
  now = new Date(),
): Message {
  const today = todayIn(info.timeZone || 'America/Sao_Paulo', now);
  const when = `${dayLabel(appt.date, today)} às ${appt.start_time.slice(0, 5)}`;
  const services = (appt.services || []).map((s) => s.name).filter(Boolean).join(' + ') || 'Atendimento';
  let body = `${info.client} · ${services} · ${when} com ${info.barber}`;
  if ((p.event === 'remarcado' || p.event === 'alterado') && p.previous) {
    body += ` (antes: ${dayLabel(p.previous.date, today)} às ${p.previous.start})`;
  }
  return {
    title: `${TITLES[p.event]} · ${info.shopName}`,
    body,
    data: { slug: info.slug, path: `painel/agenda.html?data=${appt.date}&a=${appt.id}`, event: p.event },
  };
}

/* ---------- Assinatura (JWT) ---------- */
const enc = new TextEncoder();
export function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
export function importRsaKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
export function importEcKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, key: CryptoKey): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  // ES256 do Web Crypto já sai no formato r||s que o JWT pede
  const algo = header.alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  const sig = await crypto.subtle.sign(algo, key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

/* ---------- Configuração (segredos da função) ---------- */
export function loadConfig(env: (name: string) => string | undefined): Config {
  const cfg: Config = {};
  const sa = env('FCM_SERVICE_ACCOUNT');
  if (sa) {
    const j = JSON.parse(sa);
    cfg.fcm = { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key, tokenUri: j.token_uri || 'https://oauth2.googleapis.com/token' };
  }
  const key = env('APNS_KEY');
  if (key && env('APNS_KEY_ID') && env('APNS_TEAM_ID')) {
    cfg.apns = {
      key,
      keyId: env('APNS_KEY_ID')!,
      teamId: env('APNS_TEAM_ID')!,
      bundleId: env('APNS_BUNDLE_ID') || 'br.com.movcode.forbarber',
      sandbox: env('APNS_SANDBOX') === 'true',
    };
  }
  return cfg;
}

/* ---------- Firebase (Android) ---------- */
export async function fcmAccessToken(fcm: NonNullable<Config['fcm']>, fetchFn: Fetch, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: fcm.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: fcm.tokenUri, iat, exp: iat + 3600 },
    await importRsaKey(fcm.privateKey),
  );
  const res = await fetchFn(fcm.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) throw new Error(`Firebase recusou a conta de serviço (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

export type Result = 'ok' | 'invalid' | 'error';

export async function sendFcm(token: string, msg: Message, projectId: string, accessToken: string, fetchFn: Fetch): Promise<Result> {
  const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
        android: { priority: 'HIGH', notification: { channel_id: 'agendamentos', sound: 'default' } },
      },
    }),
  });
  if (res.ok) return 'ok';
  const text = await res.text();
  if (res.status === 404 || /UNREGISTERED|registration token is not a valid/i.test(text)) return 'invalid';
  console.warn('FCM', res.status, text);
  return 'error';
}

/* ---------- Apple (iPhone) ---------- */
export async function apnsJwt(apns: NonNullable<Config['apns']>, now = Date.now()): Promise<string> {
  return signJwt({ alg: 'ES256', kid: apns.keyId }, { iss: apns.teamId, iat: Math.floor(now / 1000) }, await importEcKey(apns.key));
}

async function apnsOnce(host: string, token: string, msg: Message, apns: NonNullable<Config['apns']>, jwt: string, fetchFn: Fetch) {
  const res = await fetchFn(`https://${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': apns.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': 'agendamentos' }, ...msg.data }),
  });
  const reason = res.ok ? '' : ((await res.json().catch(() => ({}))) as { reason?: string }).reason || String(res.status);
  return { status: res.status, reason };
}

/** Manda pela Apple. Celular de teste (Xcode) usa o ambiente sandbox: se a
    produção disser que o token não é dela, tenta o sandbox antes de desistir. */
export async function sendApns(token: string, msg: Message, apns: NonNullable<Config['apns']>, jwt: string, fetchFn: Fetch): Promise<Result> {
  const prod = 'api.push.apple.com';
  const sand = 'api.sandbox.push.apple.com';
  let r = await apnsOnce(apns.sandbox ? sand : prod, token, msg, apns, jwt, fetchFn);
  if (r.status === 400 && r.reason === 'BadDeviceToken' && !apns.sandbox) r = await apnsOnce(sand, token, msg, apns, jwt, fetchFn);
  if (r.status === 200) return 'ok';
  if (r.status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(r.reason)) return 'invalid';
  console.warn('APNs', r.status, r.reason);
  return 'error';
}

/* ---------- Entrega para vários aparelhos ---------- */
export async function deliver(devices: Device[], msg: Message, cfg: Config, fetchFn: Fetch = fetch, now = Date.now()) {
  const out = { sent: 0, failed: 0, skipped: 0, invalid: [] as string[] };
  const android = devices.filter((d) => d.platform === 'android');
  const ios = devices.filter((d) => d.platform === 'ios');
  const jobs: Promise<[string, Result]>[] = [];
  if (android.length && cfg.fcm) {
    const access = await fcmAccessToken(cfg.fcm, fetchFn, now);
    android.forEach((d) => jobs.push(sendFcm(d.token, msg, cfg.fcm!.projectId, access, fetchFn).then((r) => [d.token, r])));
  } else out.skipped += android.length;
  if (ios.length && cfg.apns) {
    const jwt = await apnsJwt(cfg.apns, now);
    ios.forEach((d) => jobs.push(sendApns(d.token, msg, cfg.apns!, jwt, fetchFn).then((r) => [d.token, r])));
  } else out.skipped += ios.length;
  for (const [token, r] of await Promise.all(jobs.map((j) => j.catch((e) => { console.warn(e); return ['', 'error'] as [string, Result]; })))) {
    if (r === 'ok') out.sent++;
    else {
      out.failed++;
      if (r === 'invalid') out.invalid.push(token);
    }
  }
  return out;
}

/** Compara o segredo sem vazar tempo (o gatilho do banco manda no cabeçalho) */
export function sameSecret(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
