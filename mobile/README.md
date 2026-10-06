# Apps ForBarber (iOS e Android)

Dois apps nas lojas, feitos com [Capacitor](https://capacitorjs.com) a partir do **mesmo sistema** da pasta `../app`. Tudo o que muda no site muda nos dois apps no próximo build.

| | **ForBarber** (`cliente/`) | **ForBarber Pro** (`pro/`) |
| --- | --- | --- |
| Para quem | Quem agenda | Dono e barbeiros |
| Identificador | `br.com.movcode.forbarber` | `br.com.movcode.forbarber.pro` |
| Abre em | Última barbearia usada (site para agendar) | Painel da última barbearia (agenda) |
| Avisos | Lembretes que o cliente escolhe (notificação local, sem servidor) | Push de agendamento novo, remarcado, alterado e cancelado |
| Plugins | app, local-notifications, splash-screen, status-bar | app, push-notifications, splash-screen, status-bar |

```
mobile/
  shared/build-www.mjs   monta o www/ de cada app e grava appKind no config.js
  shared/inicio/         tela inicial comum (lista de barbearias, conta)
  cliente/               app ForBarber: src/ (tela inicial), assets/ (ícone), android/, ios/
  pro/                   app ForBarber Pro: idem
```

No código, `window.FORBARBER.appKind` diz onde o sistema está rodando: `'web'` (navegador), `'cliente'` ou `'pro'`. No app do cliente o painel não abre (aparece o convite para o ForBarber Pro); no Pro, o login não oferece cadastro de cliente.

**Tela inicial**
- Ao abrir o app, entra direto na última barbearia usada. "Trocar de barbearia" (no menu do site) e "Outras barbearias" (no painel) voltam para a lista.
- **ForBarber:** suas barbearias, abrir uma pelo link que ela mandou (`forbarber.com.br/barbeariadoze`), demonstração.
- **ForBarber Pro:** suas barbearias, entrar com e-mail, demonstração do painel.
- **Sua conta:** sair e **excluir a conta**, que as duas lojas exigem.

**Diferenças em relação ao site**
- O cliente recebe **lembretes nos momentos que escolheu** em Minha conta (padrão: 1 dia antes e 2 horas antes), agendados no próprio aparelho: chegam mesmo sem internet.
- A equipe recebe **push de agendamento** com o app fechado, depois de configurar o Firebase e a Apple (README principal, "Avisos no celular da equipe"). Tocar no aviso abre a agenda com o horário.
- **Assinatura:** no app o dono só vê a situação do plano. Pagar e trocar de plano fica no site, porque a Apple obriga a usar o pagamento dela para assinaturas vendidas dentro do app.
- **Criar barbearia:** abre no navegador (`webUrl` + `criar.html`). Assim toda conta criada dentro do app pode ser excluída no próprio app.

## Antes do primeiro build

Em `../app/assets/js/config.js`, preencha `supabaseUrl`, `supabaseAnonKey` e **`webUrl`** (endereço do sistema publicado). O `webUrl` é usado nos links que saem do app: e-mails de confirmação, WhatsApp e "compartilhar link".

## Gerar os apps

```bash
cd mobile/cliente        # ou mobile/pro
npm ci
npm run sync             # monta www/ (sistema + tela inicial) e atualiza android/ e ios/
npx cap open android     # Android Studio
npx cap open ios         # Xcode (só no Mac)
```

Sem Mac, o GitHub compila os quatro a cada push (workflow **App iOS e Android**, em `.github/workflows/mobile.yml`). Em **Actions**, ficam:
- `forbarber-cliente-android-debug` e `forbarber-pro-android-debug`: APKs para instalar num Android de teste;
- `forbarber-cliente-ios-simulador` e `forbarber-pro-ios-simulador`: os apps para o simulador do iPhone.

Ícone e tela de abertura de cada app saem da pasta `assets/` dele (`npm run assets` para regerar). O ícone do Pro é o mesmo poste com o selo **PRO**.

## Publicar

Cada app é publicado separado, com página própria em cada loja (fotos e descrição para o seu público).

### Google Play (US$ 25, uma vez, vale para os dois)
1. Crie a conta em play.google.com/console. Conta de empresa pede CNPJ e D-U-N-S.
2. No Android Studio, para cada app: **Build → Generate Signed App Bundle**. Crie a chave de upload e guarde-a com a senha: sem ela não dá para atualizar o app.
3. No Console, crie os apps "ForBarber" e "ForBarber Pro" e preencha em cada um:
   - política de privacidade (URL);
   - segurança dos dados: nome, e-mail, telefone e agendamentos;
   - classificação etária;
   - acesso para revisão: use a demonstração, ou crie um login de teste (no Pro, um login de equipe).
4. Contas pessoais novas precisam de **teste fechado com 12 testadores por 14 dias** antes de publicar, para cada app. Contas de empresa não.

### App Store (US$ 99 por ano, vale para os dois)
1. Conta no Apple Developer Program, de preferência como empresa (D-U-N-S).
2. Crie os App IDs `br.com.movcode.forbarber` e `br.com.movcode.forbarber.pro` e os dois apps no App Store Connect.
3. No Xcode: assinatura automática com a sua equipe, depois **Product → Archive → Distribute**. Sem Mac, dá para usar Codemagic ou Ionic Appflow com a mesma pasta `ios/`.
4. Na revisão, informe:
   - política de privacidade e coleta de dados;
   - nas notas: "Toque em *Abrir a demonstração* para testar sem cadastro" (e, no Pro, um login de equipe de teste).

## Push da equipe: o que fica no ForBarber Pro
- `pro/android/app/google-services.json` (do Firebase, registrando o pacote `br.com.movcode.forbarber.pro`). Sem ele o build passa, mas deixe `push: false` no `config.js`: registrar o celular sem o Firebase fecha o app Android.
- iPhone: capacidade **Push Notifications** no Xcode, no projeto `pro/ios` (o `AppDelegate.swift` já repassa o token para o Capacitor). Na função de borda, `APNS_BUNDLE_ID=br.com.movcode.forbarber.pro`.
- Canal de notificação do Android: `agendamentos` (criado pelo app ao ativar os avisos).
- O app do cliente não tem push nem precisa do Firebase.

## Ainda não incluído
- **Abrir links do WhatsApp direto no app** (App Links / Universal Links): precisa do domínio definitivo para publicar os arquivos de verificação.
