# ForBarber

Sistema para barbearias vendido como assinatura (estilo AppBarber): cada barbearia cria a conta sozinha, ganha 14 dias grátis e um endereço próprio (`seudominio/nome-da-barbearia/`) com site, agendamento online, app instalável e painel da equipe.

Visual de app de agendamento (como AppBarber, Booksy e Trinks): cartões limpos, fonte Inter (dentro do app, sem depender do Google), perfil da barbearia com capa, nota e abas, e barra de navegação embaixo no celular. **Modo escuro automático**, seguindo o aparelho; a cor da barbearia é ajustada sozinha para continuar legível no escuro (preto vira quase branco, como nos apps do iPhone). Cada barbearia escolhe a cor, o logo e a foto de capa; o ForBarber usa o vermelho e o poste de barbeiro nas telas dele (criar, entrar, app).

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
supabase/functions/   notify-booking: manda o aviso de agendamento para o celular da equipe
supabase/tests/       127 testes de segurança e regras (bash supabase/tests/run.sh)
vercel.json           endereço por barbearia (/nome/… → app/…)
mobile/               app ForBarber para iOS e Android (Capacitor) — ver mobile/README.md
```

Sem chaves no `config.js`, tudo roda como **demonstração local** (dados de exemplo no navegador). Também é o que acontece em `/demo/` e `/app/`.

## Colocar no ar

1. **Supabase:** crie o projeto e rode, na ordem, os arquivos de `supabase/migrations/` (`…02000000_forbarber_schema.sql`, `…02000100_forbarber_storage.sql`, `…03000000_forbarber_clube_espera_sinal.sql`, `…05000000_forbarber_avisos_equipe.sql` e `…05000100_forbarber_produtos_comanda.sql`), pelo SQL Editor ou com `supabase db push`.
2. Em **Authentication → Sign In / Providers → Email**, deixe **Confirm email ligado**. Os convites de barbeiro dependem disso (quem entra com o e-mail convidado vira equipe).
3. Em **Authentication → URL Configuration**: Site URL = seu domínio; Redirect URLs = `https://seudominio/**`.
4. Em `app/assets/js/config.js`, preencha `supabaseUrl` e `supabaseAnonKey` (chave pública *anon/publishable*, nunca a service role), `siteUrl` e confira preços dos `plans`. No site de vendas, aponte `appUrl` para este deploy.
5. **Vercel:** importe o repositório (sem build, site estático). O `vercel.json` já faz `/nome/` abrir o app daquela barbearia.

## Recursos para a barbearia

- **Clube de assinatura** (Painel › Clube): planos mensais com visitas por mês (ou ilimitadas), serviços inclusos e desconto nos demais. No agendamento, o que o plano cobre sai de graça e o resto ganha o desconto; acabando as visitas do mês, o cliente paga normalmente. A equipe registra a mensalidade (Pix, cartão ou dinheiro) e cobra pelo WhatsApp quem venceu. O financeiro soma as mensalidades e a comissão do barbeiro considera o valor do serviço coberto.
- **Lista de espera** (Painel › Lista de espera): quando o dia está cheio, o cliente entra na lista pelo agendamento. O painel mostra as vagas que surgem para cada pessoa e o botão de avisar pelo WhatsApp; ao agendar, a pessoa sai da lista sozinha.
- **Sinal por Pix** (Painel › Configurações › Sinal): valor fixo ou percentual, para todos ou só para clientes novos e quem já faltou. O app gera o QR Code e o "copia e cola" com o valor; não há gateway, então a equipe confere o extrato e marca "Sinal recebido". O valor é descontado na conclusão e, se o cliente remarcar, o sinal pago vai junto.
- **Lembretes do cliente** (Minha conta › Lembretes): o cliente escolhe quando quer ser avisado de cada horário. Há opções prontas (1 dia antes, na véspera às 20h, no dia às 8h, 3 h, 2 h, 1 h e 30 min antes) e um aviso personalizado (X minutos, horas ou dias antes, ou uma hora certa na véspera ou no dia), até 5 por horário. A escolha fica na conta e vale em todos os aparelhos; o app de celular agenda as notificações no próprio aparelho, sem servidor, e elas chegam mesmo sem internet. Padrão: 1 dia antes e 2 horas antes.
- **Avisos para a equipe** (Painel › Notificações › Avisos): novo agendamento, remarcação, mudança de horário ou barbeiro e cancelamento. Cada pessoa escolhe o que recebe e se quer só os próprios horários ou os da barbearia toda (o dono recebe tudo por padrão). Com o painel aberto, o aviso aparece na hora (no computador pode virar notificação do sistema); com o app fechado, chega como push no celular (ver "Avisos no celular da equipe" abaixo). Remarcação pelo site vira um aviso só, com o horário antigo.
- **Produtos e comanda** (Painel › Produtos): cadastro com preço, custo e estoque mínimo; venda no balcão ("Nova venda") ou junto do atendimento, ao concluir (a comanda soma serviços e produtos no mesmo pagamento). Cada venda baixa o estoque; cancelar devolve. Entrada de mercadoria soma ao estoque, e o painel avisa quando um produto chega no mínimo. O financeiro e o painel inicial somam os produtos no faturamento, nas formas de pagamento e na comissão (percentual único para os barbeiros sobre o que cada um vende). O barbeiro vende e vê o estoque, mas não vê custo nem edita produtos.

No servidor, preço com clube e valor do sinal são calculados por `book_appointment`; o cliente entra e sai da lista de espera por `join_waitlist`/`leave_waitlist` e só lê os próprios dados.

## Avisos no celular da equipe (push)

Sem esta configuração, tudo funciona e os avisos aparecem com o painel aberto. Para chegarem também com o app fechado:

1. **Firebase (Android):** crie um projeto em console.firebase.google.com, adicione um app Android com o pacote `br.com.movcode.forbarber` e baixe o `google-services.json` para `mobile/android/app/`. Em *Configurações do projeto › Contas de serviço*, gere uma **chave privada** (arquivo JSON) para o servidor.
2. **Apple (iPhone):** em developer.apple.com › *Keys*, crie uma chave com **Apple Push Notifications service (APNs)** e baixe o `.p8` (anote o *Key ID* e o *Team ID*). No Xcode, em *Signing & Capabilities*, adicione **Push Notifications**.
3. **Função de borda:** com a CLI do Supabase,
   ```bash
   supabase functions deploy notify-booking --no-verify-jwt
   supabase secrets set FORBARBER_PUSH_SECRET="um-segredo-longo-qualquer" \
     FCM_SERVICE_ACCOUNT="$(cat chave-do-firebase.json)" \
     APNS_KEY="$(cat AuthKey_XXXXXXXXXX.p8)" APNS_KEY_ID="XXXXXXXXXX" APNS_TEAM_ID="YYYYYYYYYY"
   ```
   Celular instalado direto pelo Xcode usa o ambiente de teste da Apple: a função tenta os dois sozinha, ou force com `APNS_SANDBOX=true`.
4. **Banco:** em *Database › Extensions*, ligue o **pg_net**. No SQL Editor, guarde no Vault o endereço das funções e o mesmo segredo:
   ```sql
   select vault.create_secret('https://SEU-PROJETO.supabase.co/functions/v1', 'forbarber_functions_url');
   select vault.create_secret('um-segredo-longo-qualquer', 'forbarber_push_secret');
   ```
5. Em `app/assets/js/config.js`, mude `push` para `true` e gere o app de novo (`mobile/README.md`).

Como funciona: um gatilho no banco (`appointments_push`, no fim de cada transação) decide o aviso e chama a função `notify-booking`, que manda pelo Firebase (Android) e pela Apple (iPhone) para o barbeiro do horário, o dono e quem pediu a barbearia toda, nunca para quem fez a mudança. Celular que desinstalou o app sai da lista sozinho. Se algo falhar no envio, o agendamento segue normal. Testes da função: `deno test supabase/functions/notify-booking/`.

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
