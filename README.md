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
3. Start server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000`.

The SQLite database file is created automatically at `data.db`.

## API endpoints

### Public
- `GET /api/health`
- `GET /api/properties`

### Admin (requires `x-admin-api-key` header)
- `POST /api/admin/properties`
- `PUT /api/admin/properties/:id`
- `DELETE /api/admin/properties/:id`

### Example admin upload
```bash
curl -X POST http://localhost:3000/api/admin/properties \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: your-strong-admin-key' \
  -d '{
    "title":"Lekki Waterfront Duplex",
    "location":"Lekki Phase 1, Lagos",
    "price":"₦250,000,000",
    "beds":4,
    "baths":5,
    "size":"3200",
    "listingType":"For Sale",
    "category":"house",
    "image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
  }'
```
