const API = "";
const STORAGE_KEY = "edy_sessao_v1";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORIA_EMOJI = {
  BEBIDA: "🍺",
  PETISCO: "🍟",
  DRINK: "🍹",
  SOBREMESA: "🍰",
};

const STATUS_POLL_MS = 5000;
const COMANDA_HEARTBEAT_MS = 20000;

const STATUS_CLIENTE = {
  PENDENTE: {
    badgeClass: "status-pendente",
    badgeLabel: "PENDENTE",
    msg: "Pedido recebido pela cozinha. Em breve começamos o preparo.",
    icon: "✅",
    title: "Pedido enviado!",
  },
  EM_PREPARO: {
    badgeClass: "status-preparo",
    badgeLabel: "EM PREPARO",
    msg: "Seu pedido já está sendo preparado. Fique à vontade!",
    icon: "👨‍🍳",
    title: "Preparando seu pedido",
  },
  ENTREGUE: {
    badgeClass: "status-entregue",
    badgeLabel: "ENTREGUE",
    msg: "Pedido entregue na mesa. Bom apetite!",
    icon: "🎉",
    title: "Bom apetite!",
  },
  CANCELADO: {
    badgeClass: "status-cancelado",
    badgeLabel: "CANCELADO",
    msg: "Este pedido foi cancelado. Chame o garçom se precisar de ajuda.",
    icon: "❌",
    title: "Pedido cancelado",
  },
};

let statusMonitorTimer = null;
let ultimoStatusCliente = null;
let comandaHeartbeatTimer = null;
let telaAtual = "screen-welcome";
let divisaoPessoas = 2;
let ultimoTotalComandaDivisao = 0;
const DIVISAO_PESSOAS_MIN = 2;
const DIVISAO_PESSOAS_MAX = 20;

const state = {
  token: null,
  mesa: null,
  cliente: { nome: "", telefone: "" },
  cardapio: [],
  categoria: "TODOS",
  cart: [],
  pedidoId: null,
};

const $ = (sel) => document.querySelector(sel);

function mesaValida() {
  return Boolean(state.mesa && state.mesa.id_mesa != null);
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    if (!mesaValida()) {
      state.mesa = null;
    }
  } catch (_) {}
}

function saveSession() {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: state.token,
      mesa: state.mesa,
      cliente: state.cliente,
      pedidoId: state.pedidoId,
      cart: state.cart,
    })
  );
}

function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $(`#${id}`).classList.remove("hidden");
  telaAtual = id;
  $("#cart-bar").classList.toggle("hidden", id !== "screen-cardapio");
  syncHeaderActions();
  if (id === "screen-cardapio") {
    iniciarHeartbeatComanda();
  } else {
    pararHeartbeatComanda();
  }
}

function syncHeaderActions() {
  const btn = $("#btn-open-comanda");
  const badge = $("#header-total-comanda-badge");
  const visivel = mesaValida();
  if (btn) btn.classList.toggle("hidden", !visivel);
  if (badge) badge.classList.toggle("hidden", !visivel);
}

function aplicarBadgeTotalComanda(total, animar = false) {
  const badge = $("#header-total-comanda-badge");
  if (!badge) return;

  const valor = Number(total) || 0;
  const anterior = Number(badge.dataset.valor || 0);
  badge.textContent = formatMoney(valor);
  badge.dataset.valor = String(valor);

  if (animar && valor !== anterior) {
    badge.classList.remove("animacao-pulso-caixa");
    void badge.offsetWidth;
    badge.classList.add("animacao-pulso-caixa");
    setTimeout(() => badge.classList.remove("animacao-pulso-caixa"), 1000);
  }
}

function pararHeartbeatComanda() {
  if (comandaHeartbeatTimer) {
    clearTimeout(comandaHeartbeatTimer);
    comandaHeartbeatTimer = null;
  }
}

function agendarHeartbeatComanda() {
  pararHeartbeatComanda();
  if (telaAtual !== "screen-cardapio" || !mesaValida() || document.hidden) {
    comandaHeartbeatTimer = setTimeout(agendarHeartbeatComanda, COMANDA_HEARTBEAT_MS);
    return;
  }
  comandaHeartbeatTimer = setTimeout(async () => {
    await escutarMudancaConsumoMesaLeve();
    agendarHeartbeatComanda();
  }, COMANDA_HEARTBEAT_MS);
}

function iniciarHeartbeatComanda() {
  escutarMudancaConsumoMesaLeve();
  agendarHeartbeatComanda();
}

async function escutarMudancaConsumoMesaLeve() {
  if (!mesaValida() || !state.token) return;

  try {
    const comanda = await carregarExtratoComandaMesa();
    aplicarBadgeTotalComanda(comanda.total_comanda, true);
    if (comandaAberta()) {
      renderComandaSheet(comanda);
    }
  } catch (_) {}
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemStatusClass(status) {
  const map = {
    PENDENTE: "item-status-pendente",
    EM_PREPARO: "item-status-preparo",
    ENTREGUE: "item-status-entregue",
  };
  return map[status] || "item-status-pendente";
}

function itemStatusLabel(status) {
  const map = {
    PENDENTE: "Pendente",
    EM_PREPARO: "Em preparo",
    ENTREGUE: "Entregue",
  };
  return map[status] || status;
}

function exibirErroMesa(msg, opts = {}) {
  pararMonitoramentoStatus();
  pararHeartbeatComanda();
  state.mesa = null;
  state.cart = [];
  state.pedidoId = null;
  saveSession();
  closeCart();
  $("#erro-mesa-msg").textContent = msg;
  const devHint = $("#erro-mesa-dev");
  if (devHint) {
    const isLocal =
      location.hostname === "127.0.0.1" ||
      location.hostname === "localhost" ||
      location.hostname === "[::1]";
    devHint.classList.toggle("hidden", !(opts.showDevLinks && isLocal));
  }
  showScreen("screen-erro-mesa");
}

function formatMoney(v) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

function atualizarDivisaoConta(total) {
  const panel = $("#divisao-conta-panel");
  const resultado = $("#divisao-conta-resultado");
  const valorEl = $("#pessoas-divisao-val");
  if (!panel || !resultado || !valorEl) return;

  ultimoTotalComandaDivisao = Number(total) || 0;
  panel.classList.toggle("hidden", ultimoTotalComandaDivisao <= 0);
  if (ultimoTotalComandaDivisao <= 0) return;

  valorEl.textContent = String(divisaoPessoas);
  const porPessoa = ultimoTotalComandaDivisao / divisaoPessoas;
  resultado.textContent =
    `Em ${divisaoPessoas} pessoas fica ${formatMoney(porPessoa)} para cada.`;
}

function ajustarDivisaoPessoas(delta) {
  divisaoPessoas = Math.min(
    DIVISAO_PESSOAS_MAX,
    Math.max(DIVISAO_PESSOAS_MIN, divisaoPessoas + delta)
  );
  atualizarDivisaoConta(ultimoTotalComandaDivisao);
}

function pararMonitoramentoStatus() {
  if (statusMonitorTimer) {
    clearInterval(statusMonitorTimer);
    statusMonitorTimer = null;
  }
  ultimoStatusCliente = null;
}

function renderStatusClienteUI(status) {
  const cfg = STATUS_CLIENTE[status] || STATUS_CLIENTE.PENDENTE;
  const badge = $("#status-pedido-cliente");
  const msgEl = $("#status-msg-cliente");
  if (!badge || !msgEl) return;

  badge.className = `badge ${cfg.badgeClass}`;
  badge.textContent = cfg.badgeLabel;
  msgEl.textContent = cfg.msg;

  const iconEl = $("#success-icon");
  const titleEl = $("#success-title");
  if (iconEl) iconEl.textContent = cfg.icon;
  if (titleEl) titleEl.textContent = cfg.title;
}

async function buscarStatusPedidoCliente() {
  if (!mesaValida()) return null;

  const mesaId = state.mesa.id_mesa;
  const pedidoId = state.pedidoId;

  if (pedidoId) {
    try {
      return await api(`/api/pedidos/${pedidoId}/status?mesa_id=${mesaId}`);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  try {
    const ativo = await api(`/api/pedidos/ativos/mesa/${mesaId}`);
    if (ativo?.id_pedido) {
      state.pedidoId = ativo.id_pedido;
      saveSession();
      return { status: ativo.status, total_pedido: ativo.total_pedido };
    }
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
  return null;
}

async function pollStatusPedidoCliente() {
  try {
    const data = await buscarStatusPedidoCliente();
    if (!data) return;

    const status = data.status;
    renderStatusClienteUI(status);

    if (status !== ultimoStatusCliente) {
      if (status === "ENTREGUE" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      ultimoStatusCliente = status;
    }

    if (status === "ENTREGUE" || status === "CANCELADO") {
      pararMonitoramentoStatus();
      if (status === "ENTREGUE") {
        state.pedidoId = null;
        saveSession();
      }
    }

    await atualizarExtratoSeAberto();
  } catch (_) {}
}

function iniciarMonitoramentoStatus() {
  pararMonitoramentoStatus();
  renderStatusClienteUI("PENDENTE");
  pollStatusPedidoCliente();
  statusMonitorTimer = setInterval(pollStatusPedidoCliente, STATUS_POLL_MS);
}

function cartTotal() {
  return state.cart.reduce((s, i) => s + i.preco * i.qty, 0);
}

function cartCount() {
  return state.cart.reduce((s, i) => s + i.qty, 0);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function getTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("t") || params.get("token");
  if (!raw) return null;
  const token = raw.trim();
  if (!UUID_RE.test(token)) return null;
  return token;
}

async function validarMesa(token) {
  const mesa = await api(`/api/mesas/sessao/${token}`);
  if (!mesa || mesa.id_mesa == null) {
    throw new Error("Mesa não encontrada");
  }
  return mesa;
}

async function carregarCardapio() {
  state.cardapio = await api("/api/cardapio");
}

function renderHeader() {
  const nome = state.cliente.nome || "Cliente";
  const mesa = state.mesa?.numero_mesa || "—";
  $("#header-title").textContent = `Olá, ${nome}!`;
  $("#header-sub").textContent = `Mesa ${mesa} · Cervejaria do Edy`;
}

function renderCategorias() {
  const cats = ["TODOS", ...new Set(state.cardapio.map((i) => i.categoria))];
  const el = $("#cat-tabs");
  el.innerHTML = cats
    .map(
      (c) =>
        `<button type="button" class="cat-tab ${state.categoria === c ? "active" : ""}" data-cat="${c}">${c === "TODOS" ? "Todos" : c}</button>`
    )
    .join("");
  el.querySelectorAll(".cat-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.categoria = btn.dataset.cat;
      renderCategorias();
      renderMenu();
    });
  });
}

function renderMenu() {
  const items =
    state.categoria === "TODOS"
      ? state.cardapio
      : state.cardapio.filter((i) => i.categoria === state.categoria);

  const el = $("#menu-list");
  if (!items.length) {
    el.innerHTML = '<p class="loading">Nenhum item disponível.</p>';
    return;
  }

  el.innerHTML = items
    .map((item) => {
      const emoji = CATEGORIA_EMOJI[item.categoria] || "🍽️";
      const thumb = item.imagem_url
        ? `<img src="${item.imagem_url}" alt="" />`
        : emoji;
      return `
        <article class="menu-item" data-id="${item.id_item}">
          <div class="thumb">${thumb}</div>
          <div class="info">
            <h3>${item.nome}</h3>
            <p class="desc">${item.descricao || ""}</p>
            <div class="price">${formatMoney(item.preco)}</div>
          </div>
          <button type="button" class="add-btn" aria-label="Adicionar" ${mesaValida() ? "" : "disabled"}>+</button>
        </article>`;
    })
    .join("");

  el.querySelectorAll(".menu-item").forEach((row) => {
    row.querySelector(".add-btn").addEventListener("click", () => {
      const id = Number(row.dataset.id);
      addToCart(id);
    });
  });
}

function addToCart(itemId) {
  if (!mesaValida()) {
    exibirErroMesa("QR Code inválido ou mesa não ativa. Chame o garçom.");
    return;
  }
  const item = state.cardapio.find((i) => i.id_item === itemId);
  if (!item) return;
  const line = state.cart.find((c) => c.id_item === itemId);
  if (line) line.qty += 1;
  else state.cart.push({ ...item, qty: 1 });
  saveSession();
  updateCartBar();
  renderCartSheet();
}

function updateCartBar() {
  const n = cartCount();
  const podePedir = mesaValida();
  $("#cart-summary").innerHTML =
    n === 0
      ? "<span>Nenhum item</span>"
      : `<strong>${n} item${n > 1 ? "s" : ""}</strong><span>${formatMoney(cartTotal())}</span>`;
  $("#btn-open-cart").disabled = n === 0 || !podePedir;
  syncConfirmButton();
}

function syncConfirmButton() {
  const btn = $("#btn-confirm");
  if (!btn) return;
  const ok = mesaValida() && state.cart.length > 0;
  btn.disabled = !ok;
}

function renderCartSheet() {
  const el = $("#cart-items");
  if (!state.cart.length) {
    el.innerHTML = '<p class="loading">Carrinho vazio</p>';
    $("#cart-total").textContent = formatMoney(0);
    syncConfirmButton();
    return;
  }
  el.innerHTML = state.cart
    .map(
      (line) => `
    <div class="cart-line" data-id="${line.id_item}">
      <span class="name">${line.nome}</span>
      <div class="qty-ctrl">
        <button type="button" class="qty-minus">−</button>
        <span>${line.qty}</span>
        <button type="button" class="qty-plus">+</button>
      </div>
      <span>${formatMoney(line.preco * line.qty)}</span>
    </div>`
    )
    .join("");

  el.querySelectorAll(".cart-line").forEach((row) => {
    const id = Number(row.dataset.id);
    row.querySelector(".qty-minus").addEventListener("click", () => {
      const line = state.cart.find((c) => c.id_item === id);
      if (!line) return;
      line.qty -= 1;
      if (line.qty <= 0) state.cart = state.cart.filter((c) => c.id_item !== id);
      saveSession();
      updateCartBar();
      renderCartSheet();
    });
    row.querySelector(".qty-plus").addEventListener("click", () => addToCart(id));
  });

  $("#cart-total").textContent = formatMoney(cartTotal());
  syncConfirmButton();
}

function closeSheets() {
  $("#sheet-overlay").classList.remove("open");
  $("#cart-sheet").classList.remove("open");
  $("#comanda-sheet").classList.remove("open");
}

function comandaAberta() {
  return Boolean($("#comanda-sheet")?.classList.contains("open"));
}

async function carregarExtratoComandaMesa() {
  if (!mesaValida() || !state.token) {
    throw new Error("Mesa não identificada.");
  }
  return api(
    `/api/pedidos/mesa/${state.mesa.id_mesa}/comanda?token_sessao=${encodeURIComponent(state.token)}`
  );
}

function renderComandaSheet(comanda) {
  const resumo = $("#comanda-resumo");
  const container = $("#extrato-comanda-container");
  const totalEl = $("#total-comanda-mesa");

  totalEl.textContent = formatMoney(comanda.total_comanda || 0);
  aplicarBadgeTotalComanda(comanda.total_comanda, false);
  atualizarDivisaoConta(comanda.total_comanda || 0);

  if (comanda.pedidos_vinculados > 0) {
    const rs = comanda.resumo_status || {};
    resumo.textContent =
      `${comanda.pedidos_vinculados} rodada(s) · ${rs.ENTREGUE || 0} entregue(s) · ${rs.EM_PREPARO || 0} em preparo · ${rs.PENDENTE || 0} pendente(s)`;
  } else {
    resumo.textContent = comanda.mensagem || "Nenhum consumo registrado hoje nesta mesa.";
  }

  const rodadas = comanda.rodadas || [];
  if (!rodadas.length) {
    container.innerHTML = "<p class=\"loading\">Nenhum item pedido nesta mesa hoje.</p>";
    return;
  }

  container.innerHTML = rodadas
    .map((rodada) => {
      const itensHtml = (rodada.itens || [])
        .map(
          (item) => `
        <div class="comanda-line">
          <div class="comanda-line-main">
            <div class="comanda-line-top">
              <span class="comanda-qty">${item.quantidade}x</span>
              <span class="comanda-line-name">${escapeHtml(item.nome)}</span>
            </div>
            ${item.observacao ? `<div class="comanda-line-obs">${escapeHtml(item.observacao)}</div>` : ""}
          </div>
          <div class="comanda-line-valor">${formatMoney(item.subtotal)}</div>
        </div>`
        )
        .join("");

      return `
    <section class="comanda-rodada">
      <div class="comanda-rodada-header">
        <span class="comanda-rodada-title">Rodada ${rodada.sequencia_rodada}</span>
        <span class="item-status ${itemStatusClass(rodada.status)}">${itemStatusLabel(rodada.status)}</span>
        <span class="comanda-rodada-total">${formatMoney(rodada.total_rodada)}</span>
      </div>
      ${itensHtml || '<p class="loading">Sem itens nesta rodada.</p>'}
    </section>`;
    })
    .join("");
}

async function atualizarExtratoSeAberto() {
  if (!comandaAberta()) return;
  try {
    const comanda = await carregarExtratoComandaMesa();
    renderComandaSheet(comanda);
  } catch (_) {}
}

async function openComanda() {
  if (!mesaValida()) {
    exibirErroMesa("QR Code inválido ou mesa não ativa. Chame o garçom.");
    return;
  }

  closeSheets();
  $("#sheet-overlay").classList.add("open");
  $("#comanda-sheet").classList.add("open");
  $("#extrato-comanda-container").innerHTML = '<p class="loading">Carregando extrato...</p>';
  $("#comanda-resumo").textContent = "";
  $("#total-comanda-mesa").textContent = formatMoney(0);

  try {
    const comanda = await carregarExtratoComandaMesa();
    renderComandaSheet(comanda);
  } catch (err) {
    $("#extrato-comanda-container").innerHTML =
      `<p class="loading">${escapeHtml(err.message || "Erro ao carregar extrato.")}</p>`;
    $("#total-comanda-mesa").textContent = formatMoney(0);
  }
}

function openCart() {
  if (!mesaValida()) {
    exibirErroMesa("QR Code inválido ou mesa não ativa. Chame o garçom.");
    return;
  }
  closeSheets();
  $("#sheet-overlay").classList.add("open");
  $("#cart-sheet").classList.add("open");
  renderCartSheet();
}

function closeCart() {
  closeSheets();
}

async function ensurePedido() {
  if (!mesaValida()) {
    throw new Error("Mesa não identificada. Escaneie o QR Code da mesa.");
  }
  if (state.pedidoId) return state.pedidoId;

  const mesaId = state.mesa.id_mesa;
  try {
    const pedido = await api("/api/pedidos", {
      method: "POST",
      body: JSON.stringify({ mesa_id: mesaId }),
    });
    state.pedidoId = pedido.id_pedido;
    saveSession();
    return state.pedidoId;
  } catch (err) {
    if (err.status === 409) {
      const ativo = await api(`/api/pedidos/ativos/mesa/${mesaId}`);
      state.pedidoId = ativo.id_pedido;
      saveSession();
      return state.pedidoId;
    }
    throw err;
  }
}

async function confirmarPedido() {
  if (!mesaValida()) {
    exibirErroMesa("QR Code inválido ou mesa não ativa. Chame o garçom.");
    return;
  }
  if (!state.cart.length) return;

  const btn = $("#btn-confirm");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    const pedidoId = await ensurePedido();
    const obsBase = state.cliente.nome
      ? `Cliente: ${state.cliente.nome}${state.cliente.telefone ? ` (${state.cliente.telefone})` : ""}`
      : null;

    for (const line of state.cart) {
      await api(`/api/pedidos/${pedidoId}/itens`, {
        method: "POST",
        body: JSON.stringify({
          item_id: line.id_item,
          quantidade: line.qty,
          observacao: obsBase,
        }),
      });
    }

    state.cart = [];
    saveSession();
    closeCart();
    showScreen("screen-success");
    $("#success-msg").textContent =
      `Seu pedido foi enviado para a cozinha. Mesa ${state.mesa.numero_mesa}.`;
    iniciarMonitoramentoStatus();
    await escutarMudancaConsumoMesaLeve();
    await atualizarExtratoSeAberto();
  } catch (err) {
    showToast(err.message || "Erro ao enviar pedido.");
  } finally {
    btn.textContent = "Confirmar pedido";
    syncConfirmButton();
  }
}

async function iniciarComToken(token) {
  showScreen("screen-loading");
  try {
    state.token = token;
    state.mesa = await validarMesa(token);
    saveSession();
    if (state.cliente.nome.trim()) {
      await entrarCardapio();
    } else {
      showScreen("screen-welcome");
    }
  } catch (_) {
    state.mesa = null;
    state.token = null;
    saveSession();
    exibirErroMesa("QR Code inválido ou mesa não encontrada. Chame o garçom.");
  }
}

async function entrarCardapio() {
  if (!state.cliente.nome.trim()) {
    showScreen("screen-welcome");
    return;
  }
  if (!mesaValida()) {
    exibirErroMesa("Acesse pelo QR Code da sua mesa antes de pedir.");
    return;
  }
  showScreen("screen-loading");
  try {
    await carregarCardapio();
    renderHeader();
    renderCategorias();
    renderMenu();
    updateCartBar();
    showScreen("screen-cardapio");
  } catch (err) {
    showToast(err.message || "Erro ao carregar cardápio.");
    showScreen("screen-welcome");
  }
}

async function boot() {
  loadSession();
  syncHeaderActions();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/pwa/sw.js").catch(() => {});
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && telaAtual === "screen-cardapio" && mesaValida()) {
      escutarMudancaConsumoMesaLeve();
    }
  });

  $("#form-welcome").addEventListener("submit", async (e) => {
    e.preventDefault();
    state.cliente.nome = $("#input-nome").value.trim();
    state.cliente.telefone = $("#input-tel").value.trim();
    if (!state.cliente.nome) {
      showToast("Informe seu nome para continuar.");
      return;
    }
    if (!mesaValida()) {
      exibirErroMesa("Acesse pelo QR Code da sua mesa antes de continuar.");
      return;
    }
    saveSession();
    await entrarCardapio();
  });

  $("#btn-open-cart").addEventListener("click", openCart);
  $("#btn-close-cart").addEventListener("click", closeCart);
  $("#btn-open-comanda").addEventListener("click", openComanda);
  $("#header-total-comanda-badge").addEventListener("click", openComanda);
  $("#btn-ver-extrato-success").addEventListener("click", openComanda);
  $("#btn-close-comanda").addEventListener("click", closeSheets);
  $("#btn-pessoas-minus").addEventListener("click", () => ajustarDivisaoPessoas(-1));
  $("#btn-pessoas-plus").addEventListener("click", () => ajustarDivisaoPessoas(1));
  $("#sheet-overlay").addEventListener("click", closeSheets);
  $("#btn-confirm").addEventListener("click", confirmarPedido);
  $("#btn-novo-pedido").addEventListener("click", () => {
    pararMonitoramentoStatus();
    state.cart = [];
    state.pedidoId = null;
    saveSession();
    entrarCardapio();
  });

  const tokenUrl = getTokenFromUrl();
  const rawToken = new URLSearchParams(location.search).get("t");

  if (rawToken && !tokenUrl) {
    exibirErroMesa(
      "Link inválido. O texto UUID_DA_MESA é só um exemplo — use um link real da mesa.",
      { showDevLinks: true }
    );
    return;
  }

  if (tokenUrl) {
    await iniciarComToken(tokenUrl);
    return;
  }

  if (state.token && mesaValida()) {
    $("#input-nome").value = state.cliente.nome || "";
    $("#input-tel").value = state.cliente.telefone || "";
    if (state.cliente.nome) {
      await entrarCardapio();
      return;
    }
    showScreen("screen-welcome");
    return;
  }

  exibirErroMesa("Escaneie o QR Code da sua mesa para começar.");
}

boot();
