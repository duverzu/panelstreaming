/* ===== Panel Radio — lógica del frontend admin ===== */

const API = '/api/admin';
const TOKEN_KEY = 'panel_admin_token';
const EMAIL_KEY = 'panel_admin_email';

// ---- Helpers ------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setSession(token, email) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

/** Llamada autenticada a la API. Si el token expiró (401), vuelve al login. */
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getToken(),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    clearSession();
    showLogin();
    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la petición');
  return data;
}

// ---- Navegación entre vistas --------------------------------------
function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#dash-view').classList.add('hidden');
}
function showDashboard() {
  $('#login-view').classList.add('hidden');
  $('#dash-view').classList.remove('hidden');
  $('#user-email').textContent = localStorage.getItem(EMAIL_KEY) || '';
  cargarTodo();
}

// ---- Login --------------------------------------------------------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    const res = await fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('#login-email').value.trim(),
        password: $('#login-password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Credenciales inválidas');
    setSession(data.token, data.user.email);
    showDashboard();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

// ---- Logout -------------------------------------------------------
$('#logout-btn').addEventListener('click', () => {
  clearSession();
  showLogin();
});

// ---- Cargar datos del dashboard -----------------------------------
async function cargarTodo() {
  await Promise.all([cargarStats(), cargarClientes()]);
}

async function cargarStats() {
  try {
    const s = await api('/estadisticas');
    $('#stat-total').textContent = s.total_clientes ?? 0;
    $('#stat-activos').textContent = s.clientes_activos ?? 0;
    $('#stat-estaciones').textContent = s.estaciones ?? 0;
  } catch (_) { /* el 401 ya se maneja en api() */ }
}

async function cargarClientes() {
  const body = $('#clientes-body');
  try {
    const { clientes } = await api('/clientes');
    if (!clientes.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted center">Sin clientes todavía</td></tr>';
      return;
    }
    body.innerHTML = clientes.map((c) => `
      <tr>
        <td class="muted">${c.id}</td>
        <td>${escapeHtml(c.nombre_empresa)}</td>
        <td class="muted">${escapeHtml(c.email || '')}</td>
        <td>${escapeHtml(c.plan)}</td>
        <td>${c.activo ? '<span class="badge on">Activo</span>' : '<span class="badge off">Inactivo</span>'}</td>
        <td><button class="btn-danger" data-del="${c.id}" data-nombre="${escapeHtml(c.nombre_empresa)}">Eliminar</button></td>
      </tr>`).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="muted center">${escapeHtml(e.message)}</td></tr>`;
  }
}

// ---- Crear cliente ------------------------------------------------
$('#crear-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#crear-btn');
  const msg = $('#crear-msg');
  msg.textContent = ''; msg.className = 'msg';
  btn.disabled = true; btn.textContent = 'Creando…';
  try {
    await api('/clientes/crear', {
      method: 'POST',
      body: JSON.stringify({
        nombre_empresa: $('#c-nombre').value.trim(),
        email: $('#c-email').value.trim(),
        password: $('#c-password').value,
        plan: $('#c-plan').value,
      }),
    });
    msg.textContent = '✅ Cliente creado';
    msg.className = 'msg ok';
    $('#crear-form').reset();
    await cargarTodo();
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg err';
  } finally {
    btn.disabled = false; btn.textContent = 'Crear cliente';
  }
});

// ---- Eliminar cliente (delegación de eventos) ---------------------
$('#clientes-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  if (!confirm(`¿Eliminar el cliente "${btn.dataset.nombre}"? Esta acción no se puede deshacer.`)) return;
  btn.disabled = true;
  try {
    await api('/clientes/' + btn.dataset.del, { method: 'DELETE' });
    await cargarTodo();
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
  }
});

$('#refresh-btn').addEventListener('click', cargarTodo);

// ---- Utilidad: escapar HTML para evitar inyección -----------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---- Arranque: ¿ya hay sesión? ------------------------------------
if (getToken()) showDashboard();
else showLogin();
