# ForBarber

Sistema para barbearias vendido como assinatura (estilo AppBarber): cada barbearia cria a conta sozinha, ganha 14 dias grátis e um endereço próprio (`seudominio/nome-da-barbearia/`) com site, agendamento online, app instalável e painel da equipe.

Identidade do produto: azul-marinho, vermelho do poste de barbeiro e fonte Archivo (criar e entrar). O site de cada barbearia usa as cores e o logo que o dono escolher.

A página de vendas fica em outro repositório: [movcodebr/site.produto.forbarber](https://github.com/movcodebr/site.produto.forbarber). Aqui fica só o sistema; o `index.html` da raiz redireciona para o site (`siteUrl` no `config.js`).

## Estrutura

```
index.html            redireciona para o site de vendas (outro repositório)
criar.html            cadastro self-service: conta + barbearia + teste grátis
entrar.html           login do dono/barbeiro, escolha de barbearia, nova senha
app/                  o app de cada barbearia (servido em /<nome>/ pelo vercel.json)
  index.html …        site público, agendar, login/cadastro, minha conta
  painel/             agenda, clientes, financeiro, equipe, configurações, assinatura
  sw.js               cache do app instalável
  assets/js/config.js ÚNICO arquivo a editar no deploy (chaves e planos)
supabase/migrations/  banco: tabelas, segurança por barbearia, funções
supabase/tests/       53+ testes de segurança e regras (bash supabase/tests/run.sh)
vercel.json           endereço por barbearia (/nome/… → app/…)
mobile/               app ForBarber para iOS e Android (Capacitor) — ver mobile/README.md
```

Sem chaves no `config.js`, tudo roda como **demonstração local** (dados de exemplo no navegador). Também é o que acontece em `/demo/` e `/app/`.

## Colocar no ar

1. **Supabase:** crie o projeto e rode, na ordem, `supabase/migrations/20261002000000_forbarber_schema.sql` e `…000100_forbarber_storage.sql` (SQL Editor ou `supabase db push`).
2. Em **Authentication → Sign In / Providers → Email**, deixe **Confirm email ligado**. Os convites de barbeiro dependem disso (quem entra com o e-mail convidado vira equipe).
3. Em **Authentication → URL Configuration**: Site URL = seu domínio; Redirect URLs = `https://seudominio/**`.
4. Em `app/assets/js/config.js`, preencha `supabaseUrl` e `supabaseAnonKey` (chave pública *anon/publishable*, nunca a service role), `siteUrl` e confira preços dos `plans`. No site de vendas, aponte `appUrl` para este deploy.
5. **Vercel:** importe o repositório (sem build, site estático). O `vercel.json` já faz `/nome/` abrir o app daquela barbearia.

## Assinatura (cobrança)

Ainda não há gateway integrado. O dono vê o plano e os dias de teste em **Painel → Assinatura** e assina pelo WhatsApp (`salesWhatsapp`) ou por um link de pagamento (`checkoutUrl` de cada plano). Depois de receber, ative no SQL Editor:

```sql
update shops set plan = 'equipe', status = 'active' where slug = 'nome-da-barbearia';
-- inadimplente: status = 'past_due' (segue no ar com aviso) | cancelado: status = 'canceled'
```

Com o teste vencido ou cancelado, o agendamento online pausa; agenda, clientes e financeiro continuam acessíveis. Plano, status e dono só mudam pelo SQL/service role, nunca pelo navegador.

## Acessos da demonstração

Senha de todos: `demo123` (botões de um clique no login).

| Perfil | E-mail |
| --- | --- |
| Dono | `admin@demo.com` |
| Barbeiro | `barbeiro@demo.com` |
| Cliente | `cliente@demo.com` |

## Segurança

- Cada tabela tem RLS por barbearia; cliente só vê o próprio cadastro e os próprios horários.
- Anotações da equipe sobre o cliente ficam em `client_notes`, que o cliente não lê.
- Agendamento pelo site passa por `book_appointment` (preço, duração, expediente, antecedência e conflito calculados no servidor). Dois horários iguais são barrados por uma restrição do banco.
