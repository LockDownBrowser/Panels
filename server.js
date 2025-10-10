const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Ensure 'files' directory exists
const filesDir = path.join(__dirname, 'files');
if (!fs.existsSync(filesDir)) {
  fs.mkdirSync(filesDir, { recursive: true });
  console.log('Created files directory:', filesDir);
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
  console.log('Using default credentials or env variable:', credentials);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Handle login POST request
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });
  if (credentials[username] && credentials[username] === password) {
    res.json({ success: true, redirect: '/dashboard.html' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// File Manager APIs

// List files in 'files' directory
app.get('/files/list', (req, res) => {
  fs.readdir(filesDir, (err, files) => {
    if (err) {
      console.error('Error listing files:', err);
      return res.status(500).json({ success: false, message: 'Error listing files: ' + err.message });
    }
    console.log('Files listed:', files);
    res.json({ success: true, files: files || [] });
  });
});

// Read file content
app.get('/files/read', (req, res) => {
  const { filename } = req.query;
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Filename required' });
  }
  const filePath = path.join(filesDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).json({ success: false, message: 'Error reading file: ' + err.message });
    }
    console.log('File read:', filename);
    res.json({ success: true, content: content || '' });
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
      console.error('Error writing file:', err);
      return res.status(500).json({ success: false, message: 'Error writing file: ' + err.message });
    }
    console.log('File written:', filename);
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
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ success: false, message: 'Error deleting file: ' + err.message });
    }
    console.log('File deleted:', filename);
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