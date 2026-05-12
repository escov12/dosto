const API = 'http://localhost:3000/api';
let currentUser = null;
let currentEventId = null;
let currentFilter = 'Todos';

// Token management
function getToken() { return localStorage.getItem('cc_token'); }
function saveSession(token, user) {
  localStorage.setItem('cc_token', token);
  localStorage.setItem('cc_user', JSON.stringify(user));
  currentUser = user;
  updateNav();
}
function logout() {
  localStorage.removeItem('cc_token');
  localStorage.removeItem('cc_user');
  currentUser = null;
  updateNav();
  showPage('home');
  toast('Sesión cerrada', 'success');
}

function updateNav() {
  const loggedIn = !!currentUser;
  document.getElementById('navLoginBtn').style.display = loggedIn ? 'none' : '';
  document.getElementById('navRegisterBtn').style.display = loggedIn ? 'none' : '';
  document.getElementById('navLogoutBtn').style.display = loggedIn ? '' : 'none';
  document.getElementById('navUser').textContent = loggedIn ? `Hola, ${currentUser.name.split(' ')[0]}` : '';
  document.getElementById('navMyEventsBtn').style.display = loggedIn && currentUser.role === 'ciudadano' ? '' : 'none';
  document.getElementById('navPublishBtn').style.display = loggedIn && currentUser.role === 'organizador' ? '' : 'none';
}

// Page navigation
function showPage(name) {
    window.location.hash = name;
}

function scrollToEvents() {
  document.getElementById('eventsSection').scrollIntoView({ behavior: 'smooth' });
}

// Toast
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// HU-03: Load events
async function loadEvents(category = currentFilter) {
  const grid = document.getElementById('eventsGrid');
  grid.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Cargando...</p></div>';
  try {
    const url = category && category !== 'Todos' ? `${API}/events?category=${encodeURIComponent(category)}` : `${API}/events`;
    const res = await fetch(url);
    const events = await res.json();
    if (!events.length) {
      grid.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>No hay eventos en esta categoría aún.</p></div>';
      return;
    }
    grid.innerHTML = events.map(e => `
      <div class="event-card" onclick="openEventModal(${e.id})">
        <div class="event-card-header">${e.image_emoji || '📅'}</div>
        <div class="event-card-body">
          <span class="event-category">${e.category}</span>
          <div class="event-title">${e.title}</div>
          <div class="event-meta"><span>📍</span>${e.location}</div>
          <div class="event-meta"><span>📅</span>${formatDate(e.date)}</div>
          <div class="event-attendees">👥 ${e.attendees} inscritos</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>No se pudo conectar al servidor. ¿Está corriendo?</p></div>';
  }
}

function filterEvents(category, btn) {
  currentFilter = category;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadEvents(category);
}

// HU-06: Event detail modal
async function openEventModal(id) {
  currentEventId = id;
  try {
    const res = await fetch(`${API}/events/${id}`);
    const e = await res.json();
    document.getElementById('modalEmoji').textContent = e.image_emoji || '📅';
    document.getElementById('modalTitle').textContent = e.title;
    document.getElementById('modalCategory').textContent = e.category;
    document.getElementById('modalDesc').textContent = e.description;
    document.getElementById('modalLocation').textContent = e.location;
    document.getElementById('modalDate').textContent = formatDate(e.date);
    document.getElementById('modalOrganizer').textContent = e.organizer_name;
    document.getElementById('modalAttendees').textContent = `${e.attendees} personas inscritas`;
    
    const regBtn = document.getElementById('modalRegisterBtn');
    if (!currentUser) {
      regBtn.textContent = 'Inicia sesión para inscribirte';
      regBtn.onclick = () => { closeModal(); showPage('login'); };
    } else if (currentUser.role === 'organizador') {
      regBtn.style.display = 'none';
    } else {
      regBtn.style.display = '';
      // Check if already registered
      const regRes = await fetch(`${API}/events/${id}/registered`, { headers: { Authorization: `Bearer ${getToken()}` }});
      const { registered } = await regRes.json();
      if (registered) {
        regBtn.textContent = '✅ Ya inscrito';
        regBtn.disabled = true;
      } else {
        regBtn.textContent = 'Inscribirme';
        regBtn.disabled = false;
        regBtn.onclick = registerToEvent;
      }
    }
    document.getElementById('eventModal').classList.add('open');
  } catch {
    toast('Error al cargar el evento', 'error');
  }
}

function closeModal(e) {
  if (!e || e.target.id === 'eventModal') {
    document.getElementById('eventModal').classList.remove('open');
  }
}

// HU-07: Register to event
async function registerToEvent() {
  if (!currentUser) { showPage('login'); return; }
  const btn = document.getElementById('modalRegisterBtn');
  btn.disabled = true;
  btn.textContent = 'Procesando...';
  try {
    const res = await fetch(`${API}/events/${currentEventId}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    btn.textContent = '✅ Ya inscrito';
    toast('¡Inscripción exitosa! Te esperamos 🎉', 'success');
    loadEvents();
    // Refresh attendees count
    const upd = await fetch(`${API}/events/${currentEventId}`);
    const ev = await upd.json();
    document.getElementById('modalAttendees').textContent = `${ev.attendees} personas inscritas`;
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Inscribirme';
  }
}

// HU-01: Register
function setRole(role, el) {
  document.getElementById('registerRole').value = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

async function doRegister() {
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const role = document.getElementById('registerRole').value;
  const err = document.getElementById('registerError');
  err.style.display = 'none';
  if (!name || !email || !password) { err.textContent = 'Completa todos los campos.'; err.style.display = 'block'; return; }
  if (password.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; err.style.display = 'block'; return; }
  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; err.style.display = 'block'; return; }
    saveSession(data.token, data.user);
    toast(`¡Bienvenido, ${data.user.name.split(' ')[0]}! 🌱`, 'success');
    showPage('home');
  } catch { err.textContent = 'Error de conexión.'; err.style.display = 'block'; }
}

// HU-02: Login
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.style.display = 'none';
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; err.style.display = 'block'; return; }
    saveSession(data.token, data.user);
    toast(`¡Hola de nuevo, ${data.user.name.split(' ')[0]}! 👋`, 'success');
    showPage('home');
  } catch { err.textContent = 'Error de conexión.'; err.style.display = 'block'; }
}

// HU-08: Publish event
async function doPublish() {
  const title = document.getElementById('pubTitle').value.trim();
  const description = document.getElementById('pubDesc').value.trim();
  const category = document.getElementById('pubCategory').value;
  const location = document.getElementById('pubLocation').value.trim();
  const date = document.getElementById('pubDate').value;
  const image_emoji = document.getElementById('pubEmoji').value.trim() || '📅';
  const err = document.getElementById('publishError');
  const suc = document.getElementById('publishSuccess');
  err.style.display = 'none'; suc.style.display = 'none';
  if (!title || !description || !category || !location || !date) {
    err.textContent = 'Por favor completa todos los campos.'; err.style.display = 'block'; return;
  }
  try {
    const res = await fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ title, description, category, location, date, image_emoji })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; err.style.display = 'block'; return; }
    suc.textContent = '¡Evento publicado exitosamente! Ya aparece en el listado.'; suc.style.display = 'block';
    ['pubTitle','pubDesc','pubLocation','pubDate','pubEmoji'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pubCategory').value = '';
    toast('Evento publicado 🎉', 'success');
  } catch { err.textContent = 'Error de conexión.'; err.style.display = 'block'; }
}

// My registrations
async function loadMyEvents() {
  const container = document.getElementById('myEventsList');
  container.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Cargando...</p></div>';
  if (!currentUser) { container.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><p>Inicia sesión para ver tus inscripciones.</p></div>'; return; }
  try {
    const res = await fetch(`${API}/my-registrations`, { headers: { Authorization: `Bearer ${getToken()}` }});
    const events = await res.json();
    if (!events.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>Aún no te has inscrito a ningún evento. <a href="#" onclick="showPage(\'home\')">¡Explora los disponibles!</a></p></div>';
      return;
    }
    container.innerHTML = `<div class="my-events-list">${events.map(e => `
      <div class="my-event-card" onclick="openEventModal(${e.id})" style="cursor:pointer">
        <div class="my-event-emoji">${e.image_emoji || '📅'}</div>
        <div class="my-event-info">
          <h4>${e.title}</h4>
          <p>📍 ${e.location}</p>
          <p>📅 ${formatDate(e.date)}</p>
        </div>
      </div>
    `).join('')}</div>`;
  } catch { container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Error al cargar.</p></div>'; }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Init
window.addEventListener('load', () => {
  const stored = localStorage.getItem('cc_user');
  if (stored) currentUser = JSON.parse(stored);
  updateNav();
  loadEvents();
});

function renderView() {
  const hash = window.location.hash.replace('#', '') || 'home';
  
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  const activePage = document.getElementById('page-' + hash);
  if (activePage) {
    activePage.classList.add('active');
  }

  if (hash === 'home') loadEvents();
  if (hash === 'myevents') loadMyEvents();
}

window.addEventListener('hashchange', renderView);

window.addEventListener('load', () => {
  const stored = localStorage.getItem('cc_user');
  if (stored) currentUser = JSON.parse(stored);
  updateNav();
  renderView();
});