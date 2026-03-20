const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

process.env.DB_PATH = path.join(os.tmpdir(), `real-estate-test-${Date.now()}.db`);
process.env.CORS_ALLOWLIST = 'http://localhost:3000';

const { app, db } = require('../server');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  db.close();
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
});

test('health endpoint should return ok', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
});

test('properties endpoint should return pagination payload', async () => {
  const response = await fetch(`${baseUrl}/api/properties`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.data));
  assert.ok(body.pagination);
  assert.equal(typeof body.pagination.page, 'number');
});

test('inquiries endpoint validates required fields', async () => {
  const response = await fetch(`${baseUrl}/api/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User' })
  });
  assert.equal(response.status, 400);
});

test('admin property update accepts imageData uploads', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  const authHeader = { Authorization: `Bearer ${loginBody.token}`, 'Content-Type': 'application/json' };

  const createResponse = await fetch(`${baseUrl}/api/admin/properties`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      title: 'Sample Property',
      location: 'Lagos',
      price: '$200,000',
      beds: 3,
      baths: 2,
      size: '1200 sqft',
      listingType: 'sale',
      category: 'residential',
      image: '/images/default.jpg'
    })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const onePixelPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2f3KQAAAAASUVORK5CYII=';
  const updateResponse = await fetch(`${baseUrl}/api/admin/properties/${created.id}`, {
    method: 'PUT',
    headers: authHeader,
    body: JSON.stringify({
      title: 'Updated Property',
      location: 'Lagos',
      price: '$210,000',
      beds: 3,
      baths: 2,
      size: '1250 sqft',
      listingType: 'sale',
      category: 'residential',
      imageData: `data:image/png;base64,${onePixelPngBase64}`,
      imageName: 'updated-home.png'
    })
  });

  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.match(updated.image, /^\/images\/uploads\/\d+-updated-home\.png$/);
});
