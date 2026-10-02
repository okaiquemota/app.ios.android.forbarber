/* Painel › Assinatura: situação do plano, dias de teste e escolha do plano */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  if (!App.painel) return;
  const U = App.utils;
  const { html, $ } = U;
  const db = App.db;
  const CFG = window.FORBARBER;

  const plans = CFG.plans || [];
  const teamLabel = (n) => (n >= 99 ? 'Barbeiros ilimitados' : n === 1 ? '1 barbeiro' : `Até ${n} barbeiros`);

  function statusHTML(sub, s, active) {
    if (!sub) {
      return html`<div class="notice"><i class="bi bi-info-circle"></i><div>
        <strong>Demonstração.</strong> Na versão contratada, aqui aparecem o plano da sua barbearia, os dias que faltam do teste grátis e o pagamento.
      </div></div>`;
    }
    const plan = sub.planInfo;
    const end = U.fmtDate(sub.trialEndsAt);
    let badge;
    let title;
    let text;
    let warn = false;
    if (sub.status === 'active') {
      badge = html`<span class="badge badge-concluido">Ativo</span>`;
      title = `Plano ${plan ? plan.name : sub.plan}`;
      text = plan ? `${U.money(plan.price)} por mês · ${teamLabel(plan.barbers).toLowerCase()}.` : '';
    } else if (sub.status === 'past_due') {
      badge = html`<span class="badge badge-warning">Pagamento pendente</span>`;
      title = `Plano ${plan ? plan.name : sub.plan}`;
      text = 'Não recebemos o último pagamento. Regularize para o agendamento online não ser pausado.';
      warn = true;
    } else if (sub.status === 'canceled') {
      badge = html`<span class="badge badge-cancelado">Cancelado</span>`;
      title = 'Assinatura cancelada';
      text = 'O agendamento online está pausado. Seus dados continuam guardados: escolha um plano para voltar.';
      warn = true;
    } else if (sub.live) {
      badge = html`<span class="badge badge-primary">Teste grátis</span>`;
      title = sub.daysLeft === 1 ? 'Falta 1 dia de teste' : `Faltam ${sub.daysLeft} dias de teste`;
      text = `Tudo liberado até ${end}. Escolha um plano antes disso para o agendamento online continuar no ar.`;
    } else {
      badge = html`<span class="badge badge-warning">Teste encerrado</span>`;
      title = 'O teste grátis terminou';
      text = `Terminou em ${end}. O agendamento online está pausado até a assinatura; a agenda e os clientes continuam aqui.`;
      warn = true;
    }
    const limit = plan ? plan.barbers : null;
    const total = sub.trialing ? 14 : null;
    const used = total ? Math.min(total, Math.max(0, total - sub.daysLeft)) : null;
    return html`
      <section class="panel">
        <div class="panel-body sub-card ${warn ? 'is-warn' : ''}">
          <div class="stack-sm">
            <div class="cluster-sm">${badge}</div>
            <strong class="sub-title">${title}</strong>
            <p class="muted">${text}</p>
          </div>
          <div class="sub-facts">
            <div><span class="k">Endereço</span><a class="link" href="${CFG.appRoot}" target="_blank" rel="noopener">${CFG.appRoot.replace(/^https?:\/\//, '')}</a></div>
            <div><span class="k">Barbeiros ativos</span>${active}${limit && limit < 99 ? ` de ${limit}` : ''}</div>
          </div>
          ${total && sub.live ? html`<div class="meter" aria-hidden="true"><span style="width:${Math.round((used / total) * 100)}%"></span></div>` : ''}
        </div>
      </section>`;
  }

  function planHTML(p, sub, s, active) {
    const current = sub && sub.status === 'active' && sub.plan === p.id;
    const fits = active <= p.barbers;
    const msg = `Olá! Quero assinar o ForBarber no plano ${p.name} (${U.money(p.price)}/mês) para a ${s.name}${sub ? `: ${CFG.appRoot}` : '.'}`;
    const href = p.checkoutUrl || U.waLink(CFG.salesWhatsapp, msg);
    return html`
      <article class="plan-card ${current ? 'is-current' : ''}">
        <div class="stack-sm">
          <h3 class="plan-name">${p.name}</h3>
          <span class="plan-team"><i class="bi bi-people"></i>${teamLabel(p.barbers)}</span>
        </div>
        <div class="plan-price"><strong>${U.money(p.price)}</strong><span>/mês</span></div>
        ${current
          ? html`<span class="btn btn-outline btn-block" aria-disabled="true"><i class="bi bi-check2"></i>Seu plano</span>`
          : fits
            ? html`<a class="btn ${p.id === 'equipe' ? 'btn-primary' : 'btn-outline'} btn-block" href="${href}" target="_blank" rel="noopener">${p.checkoutUrl ? html`<i class="bi bi-credit-card"></i>Assinar` : html`<i class="bi bi-whatsapp"></i>Assinar pelo WhatsApp`}</a>`
            : html`<span class="help">Você tem ${active} barbeiros ativos. Este plano comporta ${p.barbers}.</span>`}
      </article>`;
  }

  function render() {
    const s = db.settings();
    const sub = App.cloud && App.auth.isCloud() ? App.cloud.subscription() : null;
    const active = db.barbers({ active: true }).length;
    $('#sub-status').innerHTML = statusHTML(sub, s, active);
    $('#plans').innerHTML = html`${plans.map((p) => planHTML(p, sub, s, active))}`;
    const note = plans.some((p) => p.checkoutUrl)
      ? 'Depois do pagamento, o plano é ativado em até 1 dia útil.'
      : 'Fale com a gente pelo WhatsApp: enviamos o link de pagamento e ativamos o plano assim que ele for confirmado.';
    let foot = $('#plans-note');
    if (!foot) {
      foot = document.createElement('p');
      foot.id = 'plans-note';
      foot.className = 'help';
      $('#plans').after(foot);
    }
    foot.textContent = `Sem fidelidade: cancele quando quiser. Incluso em todos: site com agendamento, app com o nome da barbearia, agenda, clientes, fidelidade e financeiro. ${note}`;
  }

  render();
  App.painel.onChange(render);
});
