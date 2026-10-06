// Monta a pasta www/ de um dos apps (rode de dentro de mobile/cliente ou mobile/pro):
// o sistema (../../app), o login da equipe (../../entrar.html), a tela inicial
// comum (shared/inicio) e a tela inicial do app (src/, que tem a palavra final).
// O config.js copiado ganha appKind = 'cliente' ou 'pro': é assim que o mesmo
// sistema sabe em qual dos dois apps está rodando.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shared = dirname(fileURLToPath(import.meta.url));
const root = join(shared, '..', '..');
const appDir = process.cwd();
const kind = basename(appDir);
if (!['cliente', 'pro'].includes(kind)) {
  console.error('Rode dentro de mobile/cliente ou mobile/pro.');
  process.exit(1);
}
const www = join(appDir, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
// O service worker não entra no app (o próprio app já guarda as telas)
cpSync(join(root, 'app'), join(www, 'app'), { recursive: true, filter: (src) => !src.endsWith(`${join('app', 'sw.js')}`) });
cpSync(join(root, 'entrar.html'), join(www, 'entrar.html'));
cpSync(join(shared, 'inicio'), www, { recursive: true });
cpSync(join(appDir, 'src'), www, { recursive: true });

const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
const index = join(www, 'index.html');
writeFileSync(index, readFileSync(index, 'utf8').replace('{{VERSION}}', pkg.version));

const config = join(www, 'app', 'assets', 'js', 'config.js');
const source = readFileSync(config, 'utf8');
if (!source.includes("appKind: 'web'")) throw new Error("config.js sem a linha appKind: 'web'");
writeFileSync(config, source.replace("appKind: 'web'", `appKind: '${kind}'`));
console.log(`www pronto (app ${kind})`);
