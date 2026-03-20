# Adekanle Real Estate Website

## Run with backend + database API

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set admin key (recommended):
   ```bash
   export ADMIN_API_KEY='your-strong-admin-key'
   ```
   Optional login credentials for role-based sessions:
   ```bash
   export ADMIN_USERNAME='admin'
   export ADMIN_PASSWORD='admin123'
   export EDITOR_USERNAME='editor'
   export EDITOR_PASSWORD='editor123'
   ```
3. Start server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` for the main website.
5. Open `http://localhost:3000/upload.html` directly for the admin upload page (this link is intentionally hidden from public navigation).

The SQLite database file is created automatically at `data.db`.

## API endpoints

### Public
- `GET /api/health`
- `GET /api/properties`

### Admin
- `POST /api/admin/login` (optional session token flow for admin dashboard)
- `GET /api/admin/me`
- `POST /api/admin/logout`
- `POST /api/properties` (**requires `x-admin-api-key`**)
- `POST /api/admin/properties` (legacy alias, **requires `x-admin-api-key`**)
- `PUT /api/admin/properties/:id` (**requires `x-admin-api-key`**)
- `DELETE /api/admin/properties/:id` (**requires `x-admin-api-key`**)

### Example admin upload
```bash
curl -X POST http://localhost:3000/api/properties \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: your-strong-admin-key' \
  -d '{
    "title":"Lekki Waterfront Duplex",
    "location":"Lekki Phase 1, Lagos",
    "price":"₦250,000,000",
    "beds":4,
    "baths":5,
    "size":"3200",
    "description":"Spacious waterfront duplex with modern finishing and ample parking.",
    "listingType":"For Sale",
    "category":"house",
    "image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
  }'
```


## Troubleshooting upload failures

- `Upload API is unavailable...`: backend is not running on the same host/port. Start with:
  ```bash
  npm install
  ADMIN_API_KEY='your-strong-admin-key' npm start
  ```
- `Unauthorized...`: either login through the admin login panel, or use a valid `x-admin-api-key`.
- Admin role model:
  - `admin`: create/update/delete
  - `editor`: create/update
- Upload form supports either:
  - image URL, or
  - direct image file upload (saved under `/images/uploads`)
- On `upload.html`, you can optionally tick **Remember admin key on this device** if using legacy key mode.
- The admin page includes a **Manage Uploaded Properties** panel for quick edit/delete actions.
- `Validation failed...`: ensure title, location, price, listing type, and category are provided.
