const http = require('http');
const fs = require('fs');
const path = require('path');

// Hardcoded CSV file path
const CSV_FILE_PATH = path.join(__dirname, 'data/metadata.csv'); // <-- updated path

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

// Hardcoded headers to match CSV
const CSV_HEADERS = ['Filename', 'Title', 'Keywords'];

const server = http.createServer((req, res) => {

  // Append row
  if (req.method === 'PUT' && req.url === '/append-row') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } 
      catch { return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON body' })); }

      try {
        const newRowValues = CSV_HEADERS.map(h => csvEscape(data[h] || ''));
        const newLine = newRowValues.join(',');

        let csvContent = fs.existsSync(CSV_FILE_PATH) ? fs.readFileSync(CSV_FILE_PATH, 'utf8') : '';
        const toAppend = (csvContent.length > 0 ? (csvContent.endsWith('\n') || csvContent.endsWith('\r\n') ? '' : '\n') : '') + newLine;
        fs.appendFileSync(CSV_FILE_PATH, toAppend, 'utf8');

        const appendedObject = {};
        CSV_HEADERS.forEach((h, i) => appendedObject[h] = newRowValues[i]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Row appended', appended: appendedObject }));

      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
      }
    });

  } 
  // Delete all rows except header
  else if (req.method === 'DELETE' && req.url === '/deleteallrows') {
    try {
      if (!fs.existsSync(CSV_FILE_PATH)) return res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'CSV file not found' }));

      const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
      const lines = csvContent.split(/\r?\n/);

      if (lines.length === 0) return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'CSV is already empty' }));

      // Keep only the header row
      fs.writeFileSync(CSV_FILE_PATH, lines[0] + '\n', 'utf8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'All rows deleted, header preserved' }));

    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
    }
  } 
  // Get CSV file for download
  else if (req.method === 'GET' && req.url === '/getFile') {
    if (!fs.existsSync(CSV_FILE_PATH)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CSV file not found' }));
      return;
    }

    // Set headers to trigger file download
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="metadata.csv"'
    });

    const readStream = fs.createReadStream(CSV_FILE_PATH);
    readStream.pipe(res);
  } 
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use PUT /append-row, DELETE /deleteallrows, GET /getFile' }));
  }

});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
