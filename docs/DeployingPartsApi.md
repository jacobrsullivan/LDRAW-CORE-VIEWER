# Deploying the LDraw Parts API for Production

The LDraw parts library (478MB) is too large to bundle with the web application. This guide explains how to serve parts in production.

## How It Works

### Development Mode
In development, Vite middleware serves parts directly from the local `ldraw/` folder:
- `GET /api/parts/ldconfig` - Returns LDConfig.ldr (color definitions)
- `GET /api/parts/{path}` - Returns individual part files

### Production Mode
Set the `VITE_LDRAW_API_URL` environment variable to point to your parts server:

```bash
VITE_LDRAW_API_URL=https://parts-api.yourdomain.com
```

The application will fetch parts from `${VITE_LDRAW_API_URL}/{path}`.

---

## Deployment Options

### Option 1: Node.js Express Server (Recommended)

Create a simple Express server to serve the parts library:

```javascript
// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const LDRAW_DIR = path.join(__dirname, 'ldraw');

// CORS headers for cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cache-Control', 'public, max-age=31536000'); // 1 year cache
  next();
});

// Serve LDConfig.ldr
app.get('/ldconfig', (req, res) => {
  const configPath = path.join(LDRAW_DIR, 'LDConfig.ldr');
  if (fs.existsSync(configPath)) {
    res.type('text/plain').sendFile(configPath);
  } else {
    res.status(404).json({ error: 'LDConfig.ldr not found' });
  }
});

// Serve part files
app.get('/:partPath(*)', (req, res) => {
  const partPath = req.params.partPath.toLowerCase();

  // Try multiple locations
  const searchPaths = [
    path.join(LDRAW_DIR, 'parts', partPath),
    path.join(LDRAW_DIR, 'parts', 's', partPath),
    path.join(LDRAW_DIR, 'p', partPath),
    path.join(LDRAW_DIR, 'p', '48', partPath),
  ];

  for (const filePath of searchPaths) {
    if (fs.existsSync(filePath)) {
      return res.type('text/plain').sendFile(filePath);
    }
  }

  res.status(404).json({ error: 'Part not found' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Parts API running on port ${PORT}`);
});
```

**Deploy with:**
```bash
# Install dependencies
npm init -y
npm install express

# Copy ldraw folder to server
rsync -av ./ldraw user@server:/app/ldraw

# Start server
node server.js
```

---

### Option 2: Static File Hosting (CDN)

Upload the parts library to a CDN or static file server:

1. **Upload files** maintaining directory structure:
   ```
   your-cdn.com/
   ├── LDConfig.ldr
   ├── parts/
   │   ├── 3001.dat
   │   ├── s/
   │   └── ...
   └── p/
       ├── stud.dat
       └── ...
   ```

2. **Configure CORS** on your CDN to allow your application domain

3. **Set environment variable:**
   ```bash
   VITE_LDRAW_API_URL=https://your-cdn.com
   ```

**Note:** The application will need to handle the different path structure. You may need to modify `PartsFileManager.ts` to match your CDN layout.

---

### Option 3: Serverless (AWS Lambda + S3)

1. **Upload parts to S3:**
   ```bash
   aws s3 sync ./ldraw s3://your-bucket/ldraw --acl public-read
   ```

2. **Create Lambda function:**
   ```javascript
   // index.js
   const AWS = require('aws-sdk');
   const s3 = new AWS.S3();

   exports.handler = async (event) => {
     const partPath = event.pathParameters.path.toLowerCase();
     const bucket = 'your-bucket';

     const searchPaths = [
       `ldraw/parts/${partPath}`,
       `ldraw/parts/s/${partPath}`,
       `ldraw/p/${partPath}`,
     ];

     for (const key of searchPaths) {
       try {
         const data = await s3.getObject({ Bucket: bucket, Key: key }).promise();
         return {
           statusCode: 200,
           headers: {
             'Content-Type': 'text/plain',
             'Cache-Control': 'public, max-age=31536000',
             'Access-Control-Allow-Origin': '*',
           },
           body: data.Body.toString('utf-8'),
         };
       } catch (e) {
         continue;
       }
     }

     return { statusCode: 404, body: 'Part not found' };
   };
   ```

3. **Configure API Gateway** with Lambda proxy integration

4. **Set environment variable:**
   ```bash
   VITE_LDRAW_API_URL=https://your-api-id.execute-api.region.amazonaws.com/prod
   ```

---

## Application Configuration

### Environment Variables

Create `.env.production` in your project root:

```bash
VITE_LDRAW_API_URL=https://parts-api.yourdomain.com
```

During build, Vite replaces `import.meta.env.VITE_LDRAW_API_URL` with this value.

### Testing Production Config Locally

1. Start your parts server
2. Create `.env.development.local`:
   ```bash
   VITE_LDRAW_API_URL=http://localhost:3001
   ```
3. Run `npm run dev` and verify parts load correctly

---

## Caching Strategy

The parts library is immutable - parts never change once released. Recommended caching:

| Resource | Cache Duration | Header |
|----------|----------------|--------|
| Part files (.dat) | 1 year | `Cache-Control: public, max-age=31536000` |
| LDConfig.ldr | 1 year | `Cache-Control: public, max-age=31536000` |

This significantly reduces server load and improves client performance.

---

## API Endpoints Summary

Your parts API must implement these endpoints:

| Endpoint | Response | Content-Type |
|----------|----------|--------------|
| `GET /ldconfig` | LDConfig.ldr contents | `text/plain` |
| `GET /{partPath}` | Part file contents | `text/plain` |

The `{partPath}` can be:
- `3001.dat` - Direct part reference
- `s/3001s01.dat` - Subpart reference
- `48/stud.dat` - Hi-res primitive

---

## Troubleshooting

### Parts not loading
1. Check browser Network tab for failed requests
2. Verify CORS headers are set correctly
3. Test API directly: `curl https://your-api.com/3001.dat`

### Wrong colors
- Ensure `/ldconfig` endpoint returns valid LDConfig.ldr
- Check file encoding is UTF-8

### Slow loading
- Enable caching headers
- Use a CDN with edge locations near your users
- Consider pre-caching common parts in service worker
