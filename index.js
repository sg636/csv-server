const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// File paths
const CSV_FILE_PATH = path.join(__dirname, 'data/metadata.csv');
const RESEND_CSV_PATH = path.join(__dirname, 'data/resend.csv');

// Ensure CSV files exist with headers
if (!fs.existsSync(CSV_FILE_PATH)) {
  fs.writeFileSync(CSV_FILE_PATH, 'Filename,Title,Keywords\n', 'utf8');
}
if (!fs.existsSync(RESEND_CSV_PATH)) {
  fs.writeFileSync(RESEND_CSV_PATH, 'Filename\n', 'utf8');
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // ============ PUT /append-row ============
  if (req.method === 'PUT' && parsedUrl.pathname === '/append-row') {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // Read headers from metadata.csv
        const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
        const headers = fileContent.split(/\r?\n/)[0].split(',').map(h => h.trim());

        // Build row by matching headers
        const row = headers.map(h => (data[h] !== undefined ? String(data[h]).trim() : '')).join(',');

        // Append row (always newline first)
        fs.appendFileSync(CSV_FILE_PATH, row + '\n', 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Row appended', appended: data }));
      } catch (err) {
        console.error(err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body', details: err.message }));
      }
    });
  }

  // ============ DELETE /deleteallrows (metadata.csv only) ============
  else if (req.method === 'DELETE' && parsedUrl.pathname === '/deleteallrows') {
    try {
      const headers = fs.readFileSync(CSV_FILE_PATH, 'utf8').split(/\r?\n/)[0];
      fs.writeFileSync(CSV_FILE_PATH, headers + '\n');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'All rows deleted in metadata.csv, header preserved' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to clear metadata.csv', details: err.message }));
    }
  }

  // ============ DELETE /deleteunprocessedfiles (resend.csv only) ============
  else if (req.method === 'DELETE' && parsedUrl.pathname === '/deleteunprocessedfiles') {
    try {
      const headers = fs.readFileSync(RESEND_CSV_PATH, 'utf8').split(/\r?\n/)[0];
      fs.writeFileSync(RESEND_CSV_PATH, headers + '\n');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'All rows deleted in resend.csv, header preserved' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to clear resend.csv', details: err.message }));
    }
  }

  // ============ GET /getFile ============
  else if (req.method === 'GET' && parsedUrl.pathname === '/getFile') {
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="metadata.csv"'
    });
    fs.createReadStream(CSV_FILE_PATH).pipe(res);
  }

  // ============ PUT /unprocessed ============
  else if (req.method === 'PUT' && parsedUrl.pathname === '/unprocessed') {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        const params = new URLSearchParams(body);
        const filename = params.get('Filename');

        if (!filename) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Filename is required' }));
        }

        fs.appendFileSync(RESEND_CSV_PATH, filename.trim() + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Filename appended to resend.csv', Filename: filename.trim() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to append to resend.csv', details: err.message }));
      }
    });
  }

  // ============ GET /getUnprocessedFileNames ============
  else if (req.method === 'GET' && parsedUrl.pathname === '/getUnprocessedFileNames') {
    try {
      if (!fs.existsSync(RESEND_CSV_PATH)) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('no files here');
      }

      const csvContent = fs.readFileSync(RESEND_CSV_PATH, 'utf8');
      const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');

      if (lines.length <= 1) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('no files here');
      }

      const fileNames = lines.slice(1);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ Filenames: fileNames }]));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
    }
  }

  // ============ 404 ============
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  }
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
