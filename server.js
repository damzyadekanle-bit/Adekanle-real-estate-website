const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me-admin-key';

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

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
  const providedKey = req.header('x-admin-api-key');
  if (!providedKey || providedKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-admin-api-key.' });
  }
  next();
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
    image: String(input.image || '').trim()
  };
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

app.post('/api/properties', requireAdmin, (req, res) => {
  const property = normalizeProperty(req.body);
  const validationError = validateProperty(property);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

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
});

app.post('/api/admin/properties', requireAdmin, (req, res) => {
  const property = normalizeProperty(req.body);
  const validationError = validateProperty(property);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

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
});

app.put('/api/admin/properties/:id', requireAdmin, (req, res) => {
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

app.delete('/api/admin/properties/:id', requireAdmin, (req, res) => {
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
