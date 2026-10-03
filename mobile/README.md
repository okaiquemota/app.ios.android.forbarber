# App ForBarber (iOS e Android)

Um único app **ForBarber** nas lojas, feito com [Capacitor](https://capacitorjs.com). Ele leva dentro o mesmo sistema da pasta `../app`, então tudo o que muda no site muda no app no próximo build.

**Tela inicial do app**
- **Suas barbearias:** as que a pessoa já abriu, com um toque para entrar.
- **Agendar numa barbearia:** cola o link que a barbearia mandou (`forbarber.com.br/barbeariadoze`) ou digita o nome.
- **Entrar como equipe:** dono e barbeiros caem direto no painel.
- **Demonstração:** a Grey Barber de exemplo. Serve também para a revisão da Apple e do Google.
- **Sua conta:** sair e **excluir a conta**, que as duas lojas exigem.

**Diferenças em relação ao site**
- O cliente recebe um **lembrete no celular 2 horas antes** de cada horário (notificação local, sem servidor).
- O painel tem o botão "Outras barbearias" e o menu do site tem "Trocar de barbearia".
- **Assinatura:** no app o dono só vê a situação do plano. Pagar e trocar de plano fica no site, porque a Apple obriga a usar o pagamento dela para assinaturas vendidas dentro do app.
- **Criar barbearia:** abre no navegador (`webUrl` + `criar.html`). Assim toda conta criada dentro do app pode ser excluída no próprio app.

## Antes do primeiro build

Em `../app/assets/js/config.js`, preencha `supabaseUrl`, `supabaseAnonKey` e **`webUrl`** (endereço do sistema publicado). O `webUrl` é usado nos links que saem do app: e-mails de confirmação, WhatsApp e "compartilhar link".

## Gerar o app

```bash
cd mobile
npm ci
npm run sync          # copia ../app para www/ e atualiza android/ e ios/
npx cap open android  # Android Studio
npx cap open ios      # Xcode (só no Mac)
```

Sem Mac, o GitHub compila os dois a cada push (workflow **App iOS e Android**, em `.github/workflows/mobile.yml`). Em **Actions**, ficam dois arquivos:
- `forbarber-android-debug`: um APK para instalar num Android de teste;
- `forbarber-ios-simulador`: o app compilado para o simulador do iPhone.

Ícone e tela de abertura saem de `assets/` (`npm run assets` para regerar).

## Publicar

### Google Play (US$ 25, uma vez)
1. Crie a conta em play.google.com/console. Conta de empresa pede CNPJ e D-U-N-S.
2. No Android Studio: **Build → Generate Signed App Bundle**. Crie a chave de upload e guarde-a com a senha: sem ela não dá para atualizar o app.
3. No Console, crie o app "ForBarber" e preencha:
   - política de privacidade (URL);
   - segurança dos dados: nome, e-mail, telefone e agendamentos;
   - classificação etária;
   - acesso para revisão: use a demonstração, ou crie um login de teste.
4. Contas pessoais novas precisam de **teste fechado com 12 testadores por 14 dias** antes de publicar. Contas de empresa não.

### App Store (US$ 99 por ano)
1. Conta no Apple Developer Program, de preferência como empresa (D-U-N-S).
2. Crie o App ID `br.com.movcode.forbarber` e o app no App Store Connect.
3. No Xcode: assinatura automática com a sua equipe, depois **Product → Archive → Distribute**. Sem Mac, dá para usar Codemagic ou Ionic Appflow com a mesma pasta `ios/`.
4. Na revisão, informe:
   - política de privacidade e coleta de dados;
   - nas notas: "Toque em *Abrir a demonstração* para testar sem cadastro" e um login de equipe de teste.

## Ainda não incluído
- **Push do servidor** ("novo agendamento" no celular do barbeiro): precisa de Firebase (Android), chave APNs (iOS) e uma função no Supabase para enviar.
- **Abrir links do WhatsApp direto no app** (App Links / Universal Links): precisa do domínio definitivo para publicar os arquivos de verificação.
