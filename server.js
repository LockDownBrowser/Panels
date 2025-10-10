const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Ensure 'files' directory exists
const filesDir = path.join(__dirname, 'files');
if (!fs.existsSync(filesDir)) {
  fs.mkdirSync(filesDir);
}

// Serve static files from the root directory
app.use(express.static('.'));

// Serve files publicly from /files
app.use('/files', express.static(filesDir));

// Parse JSON bodies for POST requests
app.use(express.json());

// Read credentials from config.json (or env for production)
let credentials;
try {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  credentials = config.credentials;
} catch (err) {
  credentials = { admin: process.env.ADMIN_PASSWORD || 'password123' };
}

// Handle login POST request
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (credentials[username] && credentials[username] === password) {
    res.json({ success: true, redirect: '/dashboard.html' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// File Manager APIs (protected by login, but for simplicity, assuming logged-in users access dashboard)

// List files in 'files' directory
app.get('/files/list', (req, res) => {
  fs.readdir(filesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error listing files' });
    }
    res.json({ success: true, files });
  });
});

// Read file content
app.get('/files/read', (req, res) => {
  const { filename } = req.query;
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Filename required' });
  }
  const filePath = path.join(filesDir, filename);
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error reading file' });
    }
    res.json({ success: true, content });
  });
});

// Write or create file
app.post('/files/write', (req, res) => {
  const { filename, content } = req.body;
  if (!filename || content === undefined) {
    return res.status(400).json({ success: false, message: 'Filename and content required' });
  }
  const filePath = path.join(filesDir, filename);
  fs.writeFile(filePath, content, 'utf8', (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error writing file' });
    }
    res.json({ success: true });
  });
});

// Delete file
app.post('/files/delete', (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Filename required' });
  }
  const filePath = path.join(filesDir, filename);
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error deleting file' });
    }
    res.json({ success: true });
  });
});

// Serve index.html for all other GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});