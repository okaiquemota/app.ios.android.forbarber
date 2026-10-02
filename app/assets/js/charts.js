/* ==========================================================================
   GRÁFICOS (window.App.charts) — SVG/HTML leves, sem bibliotecas.
   Colunas (faturamento por dia), barras horizontais (ranking), barra
   empilhada (formas de pagamento) e mapa de calor (horários de pico).
   Todos têm dica ao passar o mouse/foco e podem ganhar uma tabela-gêmea.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, esc } = U;

  /* ---------- Dica (tooltip) compartilhada ---------- */
  function wireTip(root, selector, content, anchorOf) {
    if (root._tipWired) return;
    root._tipWired = true;
    const tipEl = () => root.querySelector('.chart-tip');
    const show = (target) => {
      const tip = tipEl();
      const c = content(target);
      if (!tip || !c) return;
      tip.innerHTML = c;
      tip.hidden = false;
      const anchor = (anchorOf && anchorOf(target)) || target;
      const rb = root.getBoundingClientRect();
      const ab = anchor.getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      const x = U.clamp(ab.left + ab.width / 2 - rb.left, half, Math.max(half, rb.width - half));
      tip.style.left = `${x}px`;
      tip.style.top = `${ab.top - rb.top}px`;
      root.classList.add('hovering');
      root.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
      if (anchor !== target) anchor.classList.add('is-active');
    };
    const hide = () => {
      const tip = tipEl();
      if (tip) tip.hidden = true;
      root.classList.remove('hovering');
      root.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
    };
    root.addEventListener('pointerover', (e) => {
      const t = e.target.closest(selector);
      if (t && root.contains(t)) show(t);
    });
    root.addEventListener('pointerleave', hide);
    root.addEventListener('focusin', (e) => {
      const t = e.target.closest(selector);
      if (t) show(t);
    });
    root.addEventListener('focusout', hide);
  }

  /** Passo "redondo" para as linhas de grade: 1, 2, 2,5 ou 5 × 10^n */
  function niceStep(max, ticks) {
    const raw = Math.max(max, 1) / ticks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * pow;
  }

  const compactTick = (v) => {
    if (v >= 1000) return `${U.number(v / 1000, v % 1000 === 0 ? 0 : 1)} mil`;
    return U.number(v);
  };

  /**
   * Colunas verticais (uma série).
   * data: [{ label, short, value, sub, muted }]
   */
  function columns(el, data, opts = {}) {
    const { height = 240, format = U.money, tickFormat = compactTick, ariaLabel = 'Gráfico de colunas' } = opts;
    el.classList.add('chart');
    el._data = data;
    let lastWidth = 0;

    function draw() {
      const width = Math.max(280, Math.round(el.clientWidth || 600));
      if (width === lastWidth) return;
      lastWidth = width;
      const m = { top: 14, right: 6, bottom: 30, left: 48 };
      const iw = width - m.left - m.right;
      const ih = height - m.top - m.bottom;
      const maxV = Math.max(0, ...data.map((d) => d.value));
      const step = niceStep(maxV, 4);
      const top = Math.max(step, Math.ceil(maxV / step) * step);
      const y = (v) => m.top + ih - (v / top) * ih;
      const base = y(0);
      const band = iw / Math.max(1, data.length);
      const bw = Math.min(24, Math.max(3, band * 0.64));
      const every = Math.max(1, Math.ceil(44 / band));
      const parts = [];
      for (let v = 0; v <= top + 1e-9; v += step) {
        const yy = Math.round(y(v)) + 0.5;
        parts.push(`<line class="${v === 0 ? 'base-line' : 'grid-line'}" x1="${m.left}" x2="${width - m.right}" y1="${yy}" y2="${yy}"/>`);
        parts.push(`<text class="tick" x="${m.left - 8}" y="${yy + 4}" text-anchor="end">${esc(tickFormat(v))}</text>`);
      }
      data.forEach((d, i) => {
        const x = m.left + band * i + (band - bw) / 2;
        const h = Math.max(0, base - y(d.value));
        if (h > 0.5) {
          const t = base - h;
          const r = Math.min(4, h, bw / 2);
          parts.push(`<path class="bar ${d.muted ? 'muted-bar' : ''}" data-i="${i}" d="M${x},${base} V${t + r} Q${x},${t} ${x + r},${t} H${x + bw - r} Q${x + bw},${t} ${x + bw},${t + r} V${base} Z"/>`);
        }
        if ((data.length - 1 - i) % every === 0) {
          parts.push(`<text class="tick" x="${x + bw / 2}" y="${height - 9}" text-anchor="middle">${esc(d.short || d.label)}</text>`);
        }
        parts.push(`<rect class="hit" data-i="${i}" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${ih}" tabindex="0" role="img" aria-label="${esc(`${d.label}: ${format(d.value)}`)}"/>`);
      });
      el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${esc(ariaLabel)}">${parts.join('')}</svg><div class="chart-tip" hidden></div>`;
    }

    wireTip(
      el,
      '.hit',
      (t) => {
        const d = (el._data || [])[Number(t.dataset.i)];
        return d ? html`<strong>${format(d.value)}</strong>${d.label}${d.sub ? html`<br>${d.sub}` : ''}`.toString() : '';
      },
      (t) => el.querySelector(`.bar[data-i="${t.dataset.i}"]`) || t
    );
    el._draw = draw;
    draw();
    if (window.ResizeObserver && !el._ro) {
      el._ro = new ResizeObserver(U.debounce(() => el._draw(), 80));
      el._ro.observe(el);
    }
  }

  /** Barras horizontais: [{ label, value, display, color }] */
  function hbars(el, rows, { format = U.money, max } = {}) {
    if (!rows.length) {
      el.innerHTML = App.ui.empty('bi-bar-chart', 'Sem dados no período').toString();
      return;
    }
    const top = max || Math.max(1, ...rows.map((r) => r.value));
    el.innerHTML = html`<div class="hbars">${rows.map((r) => html`
      <div class="hbar-row">
        <span class="hbar-label">${r.label}</span>
        <span class="hbar-value">${r.display ?? format(r.value)}</span>
        <div class="hbar-track" aria-hidden="true"><div class="hbar-fill" style="width:${((r.value / top) * 100).toFixed(1)}%;${r.color ? `--fill:${r.color}` : ''}"></div></div>
      </div>`)}</div>`.toString();
  }

  /** Parte do todo numa barra única + legenda com valores */
  function stacked(el, parts, { format = U.money } = {}) {
    const total = U.sum(parts, (p) => p.value);
    if (!total) {
      el.innerHTML = App.ui.empty('bi-pie-chart', 'Sem dados no período').toString();
      return;
    }
    el.innerHTML = html`
      <div class="stack-bar" role="img" aria-label="${parts.map((p) => `${p.label} ${U.percent(p.value / total)}`).join(', ')}">
        ${parts.filter((p) => p.value > 0).map((p) => html`<span style="flex:${p.value} 1 0;background:${p.color}"></span>`)}
      </div>
      <div class="legend">
        ${parts.map((p) => html`<div class="legend-item"><span class="sw" style="background:${p.color}"></span><span class="grow">${p.label}</span><span class="v">${U.percent(p.value / total)} · ${format(p.value)}</span></div>`)}
      </div>`.toString();
  }

  /** Mapa de calor: rows [{ label, values[] }], cols [rótulos] */
  function heatmap(el, { rows, cols, format = (v) => String(v), describe }) {
    el.classList.add('chart');
    const max = Math.max(1, ...rows.flatMap((r) => r.values));
    el.innerHTML = html`
      <div class="heatmap" style="grid-template-columns: 40px repeat(${cols.length}, minmax(0, 1fr))">
        <span></span>${cols.map((c) => html`<span class="heat-label" style="justify-content:center">${c}</span>`)}
        ${rows.map((r, i) => html`<span class="heat-label">${r.label}</span>${r.values.map((v, j) => html`<span class="heat-cell" tabindex="0" data-r="${i}" data-c="${j}"
            style="--p:${v ? Math.round(14 + (86 * v) / max) : 0}%" aria-label="${describe ? describe(r, cols[j], v) : `${r.label} ${cols[j]}: ${format(v)}`}"></span>`)}`)}
      </div>
      <div class="heat-scale" aria-hidden="true"><span>Menos</span><span class="ramp"></span><span>Mais</span></div>
      <div class="chart-tip" hidden></div>`.toString();
    el._rows = rows;
    el._cols = cols;
    wireTip(el, '.heat-cell', (t) => {
      const rows = el._rows;
      const cols = el._cols;
      const r = rows[Number(t.dataset.r)];
      const v = r.values[Number(t.dataset.c)];
      return html`<strong>${format(v)}</strong>${r.label} · ${cols[Number(t.dataset.c)]}`.toString();
    });
  }

  /** Tabela-gêmea acessível de um gráfico */
  const tableHTML = (rows, { labelHead, valueHead, format = U.money }) => html`
    <details class="chart-table">
      <summary>Ver dados em tabela</summary>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>${labelHead}</th><th class="num">${valueHead}</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><td>${r.label}</td><td class="num">${format(r.value)}</td></tr>`)}</tbody>
        </table>
      </div>
    </details>`;

  /** Cores categóricas validadas para o fundo escuro (ordem fixa) */
  const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300'];

  App.charts = { columns, hbars, stacked, heatmap, tableHTML, CATEGORICAL, niceStep };
})();
