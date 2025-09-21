const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

// Hardcoded CSV file paths
const MAIN_CSV_PATH = path.join(__dirname, 'data/metadata.csv'); // main CSV
const RESEND_CSV_PATH = path.join(__dirname, 'data/resend.csv');  // resend CSV

const PORT = 3000;

// Escape a value for CSV
function csvEscape(field) {
  if (field == null) field = '';
  const s = String(field);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Hardcoded headers
const MAIN_CSV_HEADERS = ['Filename', 'Title', 'Keywords'];
const RESEND_CSV_HEADERS = ['Filename'];

const server = http.createServer((req, res) => {

  // Append row to main CSV
  if (req.method === 'PUT' && req.url === '/append-row') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); }
      catch { 
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }

      try {
        const newRowValues = MAIN_CSV_HEADERS.map(h => csvEscape(data[h] || ''));
        const newLine = newRowValues.join(',');

        let csvContent = fs.existsSync(MAIN_CSV_PATH) ? fs.readFileSync(MAIN_CSV_PATH, 'utf8') : '';
        const toAppend = (csvContent.length > 0 ? (csvContent.endsWith('\n') || csvContent.endsWith('\r\n') ? '' : '\n') : '') + newLine;
        fs.appendFileSync(MAIN_CSV_PATH, toAppend, 'utf8');

        const appendedObject = {};
        MAIN_CSV_HEADERS.forEach((h, i) => appendedObject[h] = newRowValues[i]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Row appended', appended: appendedObject }));

      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
      }
    });
  }

  // Delete all rows except headers in both CSVs
  else if (req.method === 'DELETE' && req.url === '/deleteallrows') {
    try {
      [MAIN_CSV_PATH, RESEND_CSV_PATH].forEach(filePath => {
        if (!fs.existsSync(filePath)) return;
        const csvContent = fs.readFileSync(filePath, 'utf8');
        const lines = csvContent.split(/\r?\n/);
        if (lines.length > 0) {
          fs.writeFileSync(filePath, lines[0] + '\n', 'utf8');
        }
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'All rows deleted in both CSVs, headers preserved' }));

    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
    }
  }

  // Download main CSV
  else if (req.method === 'GET' && req.url === '/getFile') {
    if (!fs.existsSync(MAIN_CSV_PATH)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CSV file not found' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="metadata.csv"'
    });
    fs.createReadStream(MAIN_CSV_PATH).pipe(res);
  }

  // Append to resend.csv (PUT request, key/value)
  else if (req.method === 'PUT' && req.url === '/unprocessed') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const data = querystring.parse(body);
      const filenameValue = data.Filename || data.filename;

      if (!filenameValue) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Filename is required in the request body' }));
        return;
      }

      try {
        if (!fs.existsSync(RESEND_CSV_PATH)) {
          fs.writeFileSync(RESEND_CSV_HEADERS.join(',') + '\n', 'utf8');
        }

        const csvContent = fs.readFileSync(RESEND_CSV_PATH, 'utf8');
        const newLine = csvEscape(filenameValue);
        const toAppend = (csvContent.length > 0 ? (csvContent.endsWith('\n') || csvContent.endsWith('\r\n') ? '' : '\n') : '') + newLine;
        fs.appendFileSync(RESEND_CSV_PATH, toAppend, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Filename appended to resend.csv', Filename: filenameValue }));

      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
      }
    });
  }

  // Get all unprocessed filenames
  else if (req.method === 'GET' && req.url === '/getUnprocessedFileNames') {
    try {
      if (!fs.existsSync(RESEND_CSV_PATH)) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('no files here');
      }

      const csvContent = fs.readFileSync(RESEND_CSV_PATH, 'utf8');
      const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
      
      if (lines.length <= 1) { // only header or empty
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('no files here');
      }

      const fileNames = lines.slice(1); // skip header
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ FileNames: fileNames }]));

    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
    }
  }

  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use PUT /append-row, DELETE /deleteallrows, GET /getFile, PUT /unprocessed, GET /getUnprocessedFileNames' }));
  }

});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
