const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const EDITOR_USERNAME = process.env.EDITOR_USERNAME || 'editor';
const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || 'editor123';
const SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 8);
const CORS_ALLOWLIST = String(process.env.CORS_ALLOWLIST || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data.db'));
const db = new sqlite3.Database(dbPath);
const uploadsDir = path.join(__dirname, 'images', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const adminSessions = new Map();
const rateLimiterBuckets = new Map();
const adminUsers = [
  { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, role: 'admin' },
  { username: EDITOR_USERNAME, password: EDITOR_PASSWORD, role: 'editor' }
];

function parsePriceToNumber(priceValue) {
  const normalized = String(priceValue || '').replace(/[^0-9.]/g, '');
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function runSql(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function runCallback(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getSql(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSql(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await runSql(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      price TEXT NOT NULL,
      numericPrice REAL DEFAULT 0,
      beds INTEGER DEFAULT 0,
      baths INTEGER DEFAULT 0,
      size TEXT,
      listingType TEXT NOT NULL,
      category TEXT NOT NULL,
      image TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = await allSql("PRAGMA table_info(properties)");
  const hasNumericPrice = columns.some((column) => column.name === 'numericPrice');
  if (!hasNumericPrice) {
    await runSql('ALTER TABLE properties ADD COLUMN numericPrice REAL DEFAULT 0');
  }

  await runSql(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      propertyId INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT,
      source TEXT DEFAULT 'listing-detail',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (propertyId) REFERENCES properties(id)
    )
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventType TEXT NOT NULL,
      page TEXT,
      propertyId INTEGER,
      metadata TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runSql('UPDATE properties SET numericPrice = ? WHERE numericPrice IS NULL OR numericPrice = 0', [0]);
}

initDb().catch((error) => {
  console.error('Database initialization failed', error);
});

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (CORS_ALLOWLIST.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key']
}));

app.use((req, res, next) => {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '');
  const clientIp = forwardedFor.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const bucket = rateLimiterBuckets.get(clientIp) || { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
  if (Date.now() > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = Date.now() + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimiterBuckets.set(clientIp, bucket);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(RATE_LIMIT_MAX - bucket.count, 0));

  if (bucket.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
  }
  return next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(__dirname));

function requireAdmin(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const now = Date.now();

  if (token) {
    const session = adminSessions.get(token);
    if (session && session.expiresAt > now) {
      req.adminSession = session;
      req.adminToken = token;
      return next();
    }
  }

  const providedKey = req.header('x-admin-api-key') || '';
  if (providedKey && providedKey === ADMIN_API_KEY) {
    req.adminSession = { username: 'legacy-api-key', role: 'admin' };
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Login or provide a valid admin credential.' });
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    requireAdmin(req, res, () => {
      const role = req.adminSession?.role || 'viewer';
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: `Forbidden. Required role: ${allowedRoles.join(' or ')}` });
      }
      return next();
    });
  };
}

function normalizeProperty(input = {}) {
  return {
    title: String(input.title || '').trim(),
    location: String(input.location || '').trim(),
    price: String(input.price || '').trim(),
    numericPrice: parsePriceToNumber(input.price),
    beds: Number(input.beds || 0),
    baths: Number(input.baths || 0),
    size: String(input.size || '').trim(),
    listingType: String(input.listingType || '').trim(),
    category: String(input.category || '').trim(),
    image: String(input.image || '').trim(),
    imageData: String(input.imageData || '').trim(),
    imageName: String(input.imageName || '').trim()
  };
}

function saveImageData(imageData, imageName = '') {
  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const mime = match[1];
  const base64Payload = match[2];
  const extMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[mime] || 'png';
  const safeBase = path
    .basename(imageName || 'upload')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.[a-zA-Z0-9]+$/, '');
  const filename = `${Date.now()}-${safeBase}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, Buffer.from(base64Payload, 'base64'));
  return `/images/uploads/${filename}`;
}

function validateProperty(property) {
  const requiredFields = ['title', 'location', 'price', 'listingType', 'category'];
  const missing = requiredFields.filter((field) => !property[field]);

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }

  if (Number.isNaN(property.beds) || property.beds < 0) {
    return 'beds must be a non-negative number';
  }

  if (Number.isNaN(property.baths) || property.baths < 0) {
    return 'baths must be a non-negative number';
  }

  return null;
}

function buildPropertyFilters(query = {}) {
  const where = [];
  const params = [];

  if (query.category) {
    where.push('LOWER(category) = LOWER(?)');
    params.push(String(query.category).trim());
  }

  if (query.listingType) {
    where.push('LOWER(listingType) = LOWER(?)');
    params.push(String(query.listingType).trim());
  }

  if (query.location) {
    where.push('LOWER(location) LIKE LOWER(?)');
    params.push(`%${String(query.location).trim()}%`);
  }

  if (query.q) {
    where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(location) LIKE LOWER(?) OR LOWER(category) LIKE LOWER(?))');
    const term = `%${String(query.q).trim()}%`;
    params.push(term, term, term);
  }

  if (query.minPrice) {
    where.push('numericPrice >= ?');
    params.push(Number(query.minPrice));
  }

  if (query.maxPrice) {
    where.push('numericPrice <= ?');
    params.push(Number(query.maxPrice));
  }

  if (query.beds) {
    where.push('beds >= ?');
    params.push(Number(query.beds));
  }

  if (query.baths) {
    where.push('baths >= ?');
    params.push(Number(query.baths));
  }

  return { whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
}

function parsePagination(query = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 12, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/properties', async (req, res) => {
  try {
    const { whereSql, params } = buildPropertyFilters(req.query);
    const { page, limit, offset } = parsePagination(req.query);
    const sortBy = ['createdAt', 'numericPrice', 'beds', 'baths'].includes(req.query.sortBy)
      ? req.query.sortBy
      : 'createdAt';
    const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const totalRow = await getSql(`SELECT COUNT(*) AS total FROM properties ${whereSql}`, params);
    const rows = await allSql(
      `SELECT * FROM properties ${whereSql} ORDER BY ${sortBy === 'createdAt' ? 'datetime(createdAt)' : sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        total: totalRow?.total || 0,
        page,
        limit,
        totalPages: Math.ceil((totalRow?.total || 0) / limit)
      },
      filters: {
        ...req.query
      }
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch properties.' });
  }
});

app.get('/api/properties/:id', (req, res) => {
  db.get('SELECT * FROM properties WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch property.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    return res.json(row);
  });
});

app.post('/api/inquiries', (req, res) => {
  const propertyId = req.body?.propertyId ? Number(req.body.propertyId) : null;
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const message = String(req.body?.message || '').trim();
  const source = String(req.body?.source || 'listing-detail').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email, and message are required.' });
  }

  db.run(
    'INSERT INTO inquiries (propertyId, name, email, phone, message, source) VALUES (?, ?, ?, ?, ?, ?)',
    [propertyId, name, email, phone, message, source],
    function insertInquiryCallback(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to submit inquiry.' });
      }
      return res.status(201).json({ ok: true, id: this.lastID });
    }
  );
});

app.post('/api/analytics/events', (req, res) => {
  const eventType = String(req.body?.eventType || '').trim();
  const page = String(req.body?.page || '').trim();
  const propertyId = req.body?.propertyId ? Number(req.body.propertyId) : null;
  const metadata = JSON.stringify(req.body?.metadata || {});

  if (!eventType) {
    return res.status(400).json({ error: 'eventType is required.' });
  }

  db.run(
    'INSERT INTO analytics_events (eventType, page, propertyId, metadata) VALUES (?, ?, ?, ?)',
    [eventType, page, propertyId, metadata],
    function analyticsCallback(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to store event.' });
      }
      return res.status(201).json({ ok: true, id: this.lastID });
    }
  );
});

app.get('/api/admin/leads', requireRole(['admin', 'editor']), async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const totalRow = await getSql('SELECT COUNT(*) AS total FROM inquiries');
    const rows = await allSql(
      `SELECT inquiries.*, properties.title AS propertyTitle
       FROM inquiries
       LEFT JOIN properties ON properties.id = inquiries.propertyId
       ORDER BY datetime(inquiries.createdAt) DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        total: totalRow?.total || 0,
        page,
        limit,
        totalPages: Math.ceil((totalRow?.total || 0) / limit)
      }
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch leads.' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = adminUsers.find((candidate) => candidate.username === username && candidate.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  adminSessions.set(token, { username: user.username, role: user.role, expiresAt });

  return res.json({
    token,
    role: user.role,
    username: user.username,
    expiresAt
  });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({
    username: req.adminSession?.username || 'unknown',
    role: req.adminSession?.role || 'unknown'
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  if (req.adminToken) {
    adminSessions.delete(req.adminToken);
  }
  res.status(204).send();
});

function createPropertyHandler(req, res) {
  const property = normalizeProperty(req.body);
  const validationError = validateProperty(property);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const query = `
    INSERT INTO properties (title, location, price, numericPrice, beds, baths, size, listingType, category, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    property.title,
    property.location,
    property.price,
    property.numericPrice,
    property.beds,
    property.baths,
    property.size,
    property.listingType,
    property.category,
    property.image
  ];

  db.run(query, values, function insertCallback(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to create property.' });
    }

    db.get('SELECT * FROM properties WHERE id = ?', [this.lastID], (selectErr, row) => {
      if (selectErr) {
        return res.status(500).json({ error: 'Property created, but failed to fetch record.' });
      }

      return res.status(201).json(row);
    });
  });
}

app.post('/api/properties', requireRole(['admin', 'editor']), (req, res) => {
  const body = { ...req.body };
  if (body.imageData) {
    const savedPath = saveImageData(String(body.imageData), String(body.imageName || 'property-image'));
    if (!savedPath) {
      return res.status(400).json({ error: 'Invalid imageData format. Use a valid base64 data URL.' });
    }
    body.image = savedPath;
  }
  req.body = body;
  return createPropertyHandler(req, res);
});

app.post('/api/admin/properties', requireRole(['admin', 'editor']), (req, res) => {
  const body = { ...req.body };
  if (body.imageData) {
    const savedPath = saveImageData(String(body.imageData), String(body.imageName || 'property-image'));
    if (!savedPath) {
      return res.status(400).json({ error: 'Invalid imageData format. Use a valid base64 data URL.' });
    }
    body.image = savedPath;
  }
  req.body = body;
  return createPropertyHandler(req, res);
});

app.put('/api/admin/properties/:id', requireRole(['admin', 'editor']), (req, res) => {
  const body = { ...req.body };
  if (body.imageData) {
    const savedPath = saveImageData(String(body.imageData), String(body.imageName || 'property-image'));
    if (!savedPath) {
      return res.status(400).json({ error: 'Invalid imageData format. Use a valid base64 data URL.' });
    }
    body.image = savedPath;
  }

  const property = normalizeProperty(body);
  const validationError = validateProperty(property);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const query = `
    UPDATE properties
    SET title = ?, location = ?, price = ?, numericPrice = ?, beds = ?, baths = ?, size = ?, listingType = ?, category = ?, image = ?
    WHERE id = ?
  `;

  const values = [
    property.title,
    property.location,
    property.price,
    property.numericPrice,
    property.beds,
    property.baths,
    property.size,
    property.listingType,
    property.category,
    property.image,
    req.params.id
  ];

  db.run(query, values, function updateCallback(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to update property.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    db.get('SELECT * FROM properties WHERE id = ?', [req.params.id], (selectErr, row) => {
      if (selectErr) {
        return res.status(500).json({ error: 'Property updated, but failed to fetch record.' });
      }

      return res.json(row);
    });
  });
});

app.delete('/api/admin/properties/:id', requireRole(['admin']), (req, res) => {
  db.run('DELETE FROM properties WHERE id = ?', [req.params.id], function deleteCallback(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete property.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    return res.status(204).send();
  });
});

app.get('/sitemap.xml', async (_req, res) => {
  const baseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  let rows = [];
  try {
    rows = await allSql('SELECT id, createdAt FROM properties ORDER BY datetime(createdAt) DESC LIMIT 500');
  } catch (_error) {
    rows = [];
  }
  const staticUrls = ['/', '/index.html', '/upload.html'];
  const urlSet = [
    ...staticUrls.map((url) => `\n  <url><loc>${baseUrl}${url}</loc></url>`),
    ...rows.map((row) => `\n  <url><loc>${baseUrl}/property.html?id=${row.id}</loc><lastmod>${new Date(row.createdAt).toISOString()}</lastmod></url>`)
  ].join('');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlSet}\n</urlset>`);
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, db, close: () => server?.close() };
