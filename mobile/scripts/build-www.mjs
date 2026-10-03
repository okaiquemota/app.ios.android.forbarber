// Monta a pasta www/ que vai dentro do app: o sistema (../app), a tela de login
// da equipe (../entrar.html) e a tela inicial do app (src/).
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const www = join(here, '..', 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
// O service worker e a página de cadastro de barbearia não entram no app
cpSync(join(root, 'app'), join(www, 'app'), { recursive: true, filter: (src) => !src.endsWith(`${join('app', 'sw.js')}`) });
cpSync(join(root, 'entrar.html'), join(www, 'entrar.html'));
cpSync(join(here, '..', 'src'), www, { recursive: true });

// Versão do app visível na tela inicial
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const index = join(www, 'index.html');
writeFileSync(index, readFileSync(index, 'utf8').replace('{{VERSION}}', pkg.version));
console.log('www pronto');
