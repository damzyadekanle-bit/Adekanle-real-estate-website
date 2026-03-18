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

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);
const uploadsDir = path.join(__dirname, 'images', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const adminSessions = new Map();
const adminUsers = [
  { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, role: 'admin' },
  { username: EDITOR_USERNAME, password: EDITOR_PASSWORD, role: 'editor' }
];

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      price TEXT NOT NULL,
      beds INTEGER DEFAULT 0,
      baths INTEGER DEFAULT 0,
      size TEXT,
      listingType TEXT NOT NULL,
      category TEXT NOT NULL,
      image TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.use(cors());
app.use(express.json());
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

function insertProperty(property, res) {
  const query = `
    INSERT INTO properties (title, location, price, beds, baths, size, listingType, category, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    property.title,
    property.location,
    property.price,
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

      res.status(201).json(row);
    });
  });
}

function createPropertyHandler(req, res) {
  const property = normalizeProperty(req.body);
  const validationError = validateProperty(property);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  return insertProperty(property, res);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/properties', (_req, res) => {
  db.all('SELECT * FROM properties ORDER BY datetime(createdAt) DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch properties.' });
    }
    res.json(rows);
  });
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
  const property = normalizeProperty(req.body);
  const validationError = validateProperty(property);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const query = `
    UPDATE properties
    SET title = ?, location = ?, price = ?, beds = ?, baths = ?, size = ?, listingType = ?, category = ?, image = ?
    WHERE id = ?
  `;

  const values = [
    property.title,
    property.location,
    property.price,
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

      res.json(row);
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

    res.status(204).send();
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
