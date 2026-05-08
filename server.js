const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const initSqlJs = require('sql.js');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'conecta_comunidad_secret_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

let db;

async function initDB() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'ciudadano',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      organizer_id INTEGER NOT NULL,
      organizer_name TEXT NOT NULL,
      image_emoji TEXT DEFAULT '🌱',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, event_id)
    )
  `);

  // Seed data
  const hash1 = bcrypt.hashSync('org123', 10);
  const hash2 = bcrypt.hashSync('user123', 10);

  db.run(`INSERT OR IGNORE INTO users (name, email, password, role) VALUES 
    ('Comunidad Verde Hermosillo', 'org@verde.mx', '${hash1}', 'organizador'),
    ('Ana García', 'ana@mail.com', '${hash2}', 'ciudadano')
  `);

  db.run(`INSERT OR IGNORE INTO events (title, description, category, location, date, organizer_id, organizer_name, image_emoji) VALUES
    ('Reforestación Cerro del Bachoco', 'Únete a plantar 200 árboles nativos en el cerro. Trae agua, guantes y ganas de hacer el bien.', 'Medio Ambiente', 'Cerro del Bachoco, Hermosillo', '2026-05-25', 1, 'Comunidad Verde Hermosillo', '🌳'),
    ('Limpieza Río Sonora', 'Jornada de limpieza en las riberas del río. Equipo proporcionado.', 'Medio Ambiente', 'Río Sonora, tramo norte', '2026-06-01', 1, 'Comunidad Verde Hermosillo', '🏞️'),
    ('Feria de Adopción Animal', 'Ayuda a encontrar hogares para perritos y gatitos rescatados. Voluntarios de registro y logística.', 'Animales', 'Plaza Zaragoza, Centro Hermosillo', '2026-05-18', 1, 'Comunidad Verde Hermosillo', '🐾'),
    ('Taller de Reciclaje Creativo', 'Aprende a transformar residuos en artesanías. Para todas las edades.', 'Educación', 'Casa de la Cultura, Hermosillo', '2026-05-30', 1, 'Comunidad Verde Hermosillo', '♻️'),
    ('Campaña de Donación de Alimentos', 'Recolecci de despensa básica para familias en situación vulnerable.', 'Ayuda Social', 'Colonia Pitic, Hermosillo', '2026-06-07', 1, 'Comunidad Verde Hermosillo', '🍎')
  `);
}

// Helper: run query and get all rows
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// --- ROUTES ---

// HU-01: Registro
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
  const existing = queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'El correo ya está registrado' });
  const hashed = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
    [name, email, hashed, role || 'ciudadano']);
  const user = queryOne('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user });
});

// HU-02: Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// HU-03: Ver eventos (sin login)
app.get('/api/events', (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) as attendees FROM events e';
  const params = [];
  if (category && category !== 'Todos') {
    sql += ' WHERE e.category = ?';
    params.push(category);
  }
  sql += ' ORDER BY e.date ASC';
  const events = queryAll(sql, params);
  res.json(events);
});

// HU-06: Detalle de evento
app.get('/api/events/:id', (req, res) => {
  const event = queryOne(
    'SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) as attendees FROM events e WHERE e.id = ?',
    [req.params.id]
  );
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(event);
});

// HU-07: Inscribirse a evento
app.post('/api/events/:id/register', authMiddleware, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const event = queryOne('SELECT id FROM events WHERE id = ?', [id]);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  const existing = queryOne('SELECT id FROM registrations WHERE user_id = ? AND event_id = ?', [userId, id]);
  if (existing) return res.status(409).json({ error: 'Ya estás inscrito en este evento' });
  db.run('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)', [userId, id]);
  res.json({ message: '¡Inscripción exitosa!' });
});

// Check if registered
app.get('/api/events/:id/registered', authMiddleware, (req, res) => {
  const reg = queryOne('SELECT id FROM registrations WHERE user_id = ? AND event_id = ?', [req.user.id, req.params.id]);
  res.json({ registered: !!reg });
});

// HU-08: Publicar evento
app.post('/api/events', authMiddleware, (req, res) => {
  if (req.user.role !== 'organizador') return res.status(403).json({ error: 'Solo organizadores pueden publicar eventos' });
  const { title, description, category, location, date, image_emoji } = req.body;
  if (!title || !description || !category || !location || !date) return res.status(400).json({ error: 'Faltan campos' });
  db.run('INSERT INTO events (title, description, category, location, date, organizer_id, organizer_name, image_emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, description, category, location, date, req.user.id, req.user.name, image_emoji || '📅']);
  res.json({ message: 'Evento publicado exitosamente' });
});

// Mis inscripciones
app.get('/api/my-registrations', authMiddleware, (req, res) => {
  const events = queryAll(
    `SELECT e.* FROM events e 
     INNER JOIN registrations r ON e.id = r.event_id 
     WHERE r.user_id = ? ORDER BY e.date ASC`,
    [req.user.id]
  );
  res.json(events);
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`ConectaComunidad corriendo en http://localhost:${PORT}`));
});
