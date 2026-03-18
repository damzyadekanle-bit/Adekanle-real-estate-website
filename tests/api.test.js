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
