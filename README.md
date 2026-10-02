# ForBarber

Produto da [MovCode](https://movcode.com.br/sistema-para-barbearia) para barbearias: site público, agendamento online com horários reais, área do cliente e painel interno (agenda, clientes, financeiro). Funciona 100% no navegador, sem servidor nem instalação.

## Como abrir

- **Mais simples:** dê dois cliques em `index.html` (Chrome/Edge).
- **Recomendado:** sirva a pasta, por exemplo `npx serve .` ou `python3 -m http.server`, e abra `http://localhost:3000` (ou a porta indicada).
- **Publicar:** GitHub Pages, Vercel ou Netlify servem a pasta como site estático, sem configuração.

## Acessos de demonstração

Senha de todos: `demo123`. No login há botões que entram com um clique.

| Perfil | E-mail | O que vê |
| --- | --- | --- |
| Dono | `admin@demo.com` | Painel completo |
| Barbeiro | `barbeiro@demo.com` | Própria agenda, comissão e clientes |
| Cliente | `cliente@demo.com` | Agendamentos, histórico, fidelidade |

## Apresentar para outra barbearia

Entre como dono → **Configurações**. Nome, slogan, contatos, endereço, horários, cor principal, estilo dos títulos, logo e foto de capa mudam o site inteiro na hora. Em **Dados** dá para recarregar o exemplo ou começar do zero.

Dica de apresentação: abra o site numa aba e o painel em outra. Um agendamento feito no site aparece na agenda do painel sem recarregar.

## O que tem

**Site:** início com o próximo horário livre calculado na hora, tabela de preços, equipe, avaliações, endereço e horários, contato (mensagens caem no painel), WhatsApp.

**Agendamento online:** serviços (mais de um por vez) → barbeiro ou "sem preferência" → dia e horário livres → confirmação. Respeita expediente, folgas, bloqueios, antecedência mínima e agendamentos existentes. Salva na agenda do celular (.ics) e permite remarcar/cancelar dentro do prazo.

**Área do cliente:** próximos horários, histórico, avaliação dos atendimentos, cartão fidelidade e dados pessoais.

**Painel:** dashboard do dia, agenda por profissional (dia/semana), agendamentos com filtros, concluir com forma de pagamento, faltas, encaixes e bloqueios, ficha de clientes com anotações, aniversariantes e clientes sumidos, serviços, equipe com comissões e acessos, financeiro (faturamento, comissões, serviços, pagamentos, horários de pico), mensagens e exportação CSV/backup.

## Estrutura

```
index.html, servicos.html, agendar.html, contato.html   site público
login.html, cadastro.html, senha.html, minha-conta.html conta do cliente
painel/*.html                                           sistema interno
assets/css/   base.css (tokens e componentes), site.css, painel.css
assets/js/    utils, seed (dados de exemplo), store (dados), booking (horários),
              auth, ui, site, painel, charts, pages/*, painel/*
assets/vendor/bootstrap-icons  ícones locais (funciona offline)
```

## Limites desta versão (importante antes de vender)

Os dados ficam no `localStorage` do navegador: cada aparelho tem sua própria cópia e a senha é verificada no próprio navegador. Isso é ótimo para demonstrar, mas **não serve para uso real com vários aparelhos**. Para produção, troque a camada `assets/js/store.js` (e a validação de `auth.js`) por uma API com banco de dados — Supabase ou Firebase encaixam bem, porque as páginas só conversam com `App.db` e `App.auth`. Envio real de e-mail/WhatsApp (recuperação de senha, lembretes) também depende de um back-end.

As imagens originais em alta resolução estão no histórico do git (pasta `img/` antiga); o site usa versões otimizadas em `assets/img/`.
