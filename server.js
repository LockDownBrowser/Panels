const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Dynamically create directories if they don't exist
const filesDir = path.join(__dirname, 'files');
const ticketsDir = path.join(__dirname, 'tickets');
if (!fs.existsSync(filesDir)) {
  fs.mkdirSync(filesDir, { recursive: true });
  console.log('Created files directory:', filesDir);
}
if (!fs.existsSync(ticketsDir)) {
  fs.mkdirSync(ticketsDir, { recursive: true });
  console.log('Created tickets directory:', ticketsDir);
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
  console.log('Loaded credentials:', Object.keys(credentials));
} catch (err) {
  credentials = { admin: process.env.ADMIN_PASSWORD || 'password123' };
  console.log('Using default credentials:', credentials);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Handle login POST request (include user info for welcome)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });
  if (credentials[username] && credentials[username] === password) {
    res.json({ success: true, redirect: '/dashboard.html', user: { username, isAdmin: username === 'admin' } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// File Manager APIs
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

app.get('/files/read', (req, res) => {
  const { filename } = req.query;
  if (!filename) return res.status(400).json({ success: false, message: 'Filename required' });
  const filePath = path.join(filesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).json({ success: false, message: 'Error reading file: ' + err.message });
    }
    console.log('File read:', filename);
    res.json({ success: true, content: content || '' });
  });
});

app.post('/files/write', (req, res) => {
  const { filename, content } = req.body;
  if (!filename || content === undefined) return res.status(400).json({ success: false, message: 'Filename and content required' });
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

app.post('/files/delete', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ success: false, message: 'Filename required' });
  const filePath = path.join(filesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ success: false, message: 'Error deleting file: ' + err.message });
    }
    console.log('File deleted:', filename);
    res.json({ success: true });
  });
});

// Ticketing System APIs
app.post('/tickets/create', (req, res) => {
  const { product, discordEmail } = req.body;
  if (!product || !discordEmail) return res.status(400).json({ success: false, message: 'Product and Discord/Email required' });
  const ticketId = Date.now().toString();
  const ticketDir = path.join(ticketsDir, ticketId);
  fs.mkdirSync(ticketDir, { recursive: true });
  const ticketPath = path.join(ticketDir, 'ticket.json');
  const ticket = {
    id: ticketId,
    product,
    discordEmail,
    messages: [{ timestamp: new Date().toISOString(), author: 'System', text: `Ticket created for ${product}. Discord/Email: ${discordEmail}` }],
    visibleTo: ['admin', discordEmail]
  };
  fs.writeFile(ticketPath, JSON.stringify(ticket, null, 2), (err) => {
    if (err) {
      console.error('Error creating ticket:', err);
      return res.status(500).json({ success: false, message: 'Error creating ticket' });
    }
    console.log('Ticket created:', ticketId);
    res.json({ success: true, ticketId });
  });
});

app.get('/tickets/:id', (req, res) => {
  const ticketDir = path.join(ticketsDir, req.params.id);
  const ticketPath = path.join(ticketDir, 'ticket.json');
  if (!fs.existsSync(ticketPath)) return res.status(404).json({ success: false, message: 'Ticket not found' });
  fs.readFile(ticketPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading ticket:', err);
      return res.status(500).json({ success: false, message: 'Error reading ticket' });
    }
    res.json({ success: true, ticket: JSON.parse(data) });
  });
});

app.post('/tickets/:id/message', (req, res) => {
  const { text, author } = req.body;
  if (!text || !author) return res.status(400).json({ success: false, message: 'Text and author required' });
  const ticketDir = path.join(ticketsDir, req.params.id);
  const ticketPath = path.join(ticketDir, 'ticket.json');
  if (!fs.existsSync(ticketPath)) return res.status(404).json({ success: false, message: 'Ticket not found' });
  fs.readFile(ticketPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading ticket for message:', err);
      return res.status(500).json({ success: false, message: 'Error adding message' });
    }
    const ticket = JSON.parse(data);
    ticket.messages.push({ timestamp: new Date().toISOString(), author, text });
    fs.writeFile(ticketPath, JSON.stringify(ticket, null, 2), (err) => {
      if (err) {
        console.error('Error saving message:', err);
        return res.status(500).json({ success: false, message: 'Error saving message' });
      }
      io.to(req.params.id).emit('newMessage', { timestamp: new Date().toISOString(), author, text });
      res.json({ success: true });
    });
  });
});

// Socket.io for live chat updates
io.on('connection', (socket) => {
  socket.on('joinTicket', (ticketId) => {
    socket.join(ticketId);
    console.log('User joined ticket:', ticketId);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Serve dashboard.html for all unmatched GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
``````javascript
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Dynamically create directories if they don't exist
const filesDir = path.join(__dirname, 'files');
const ticketsDir = path.join(__dirname, 'tickets');
if (!fs.existsSync(filesDir)) {
  fs.mkdirSync(filesDir, { recursive: true });
  console.log('Created files directory:', filesDir);
}
if (!fs.existsSync(ticketsDir)) {
  fs.mkdirSync(ticketsDir, { recursive: true });
  console.log('Created tickets directory:', ticketsDir);
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
  console.log('Loaded credentials:', Object.keys(credentials));
} catch (err) {
  credentials = { admin: process.env.ADMIN_PASSWORD || 'password123' };
  console.log('Using default credentials:', credentials);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Handle login POST request (include user info for welcome)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });
  if (credentials[username] && credentials[username] === password) {
    res.json({ success: true, redirect: '/dashboard.html', user: { username, isAdmin: username === 'admin' } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// File Manager APIs
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

app.get('/files/read', (req, res) => {
  const { filename } = req.query;
  if (!filename) return res.status(400).json({ success: false, message: 'Filename required' });
  const filePath = path.join(filesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).json({ success: false, message: 'Error reading file: ' + err.message });
    }
    console.log('File read:', filename);
    res.json({ success: true, content: content || '' });
  });
});

app.post('/files/write', (req, res) => {
  const { filename, content } = req.body;
  if (!filename || content === undefined) return res.status(400).json({ success: false, message: 'Filename and content required' });
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

app.post('/files/delete', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ success: false, message: 'Filename required' });
  const filePath = path.join(filesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ success: false, message: 'Error deleting file: ' + err.message });
    }
    console.log('File deleted:', filename);
    res.json({ success: true });
  });
});

// Ticketing System APIs
app.post('/tickets/create', (req, res) => {
  const { product, discordEmail } = req.body;
  if (!product || !discordEmail) return res.status(400).json({ success: false, message: 'Product and Discord/Email required' });
  const ticketId = Date.now().toString();
  const ticketPath = path.join(ticketsDir, `${ticketId}.json`);
  const ticket = {
    id: ticketId,
    product,
    discordEmail,
    messages: [{ timestamp: new Date().toISOString(), author: 'System', text: `Ticket created for ${product}. Discord/Email: ${discordEmail}` }],
    visibleTo: ['admin', discordEmail]
  };
  fs.writeFile(ticketPath, JSON.stringify(ticket, null, 2), (err) => {
    if (err) {
      console.error('Error creating ticket:', err);
      return res.status(500).json({ success: false, message: 'Error creating ticket' });
    }
    console.log('Ticket created:', ticketId);
    res.json({ success: true, ticketId });
  });
});

app.get('/tickets/:id', (req, res) => {
  const ticketPath = path.join(ticketsDir, `${req.params.id}.json`);
  if (!fs.existsSync(ticketPath)) return res.status(404).json({ success: false, message: 'Ticket not found' });
  fs.readFile(ticketPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading ticket:', err);
      return res.status(500).json({ success: false, message: 'Error reading ticket' });
    }
    res.json({ success: true, ticket: JSON.parse(data) });
  });
});

app.post('/tickets/:id/message', (req, res) => {
  const { text, author } = req.body;
  if (!text || !author) return res.status(400).json({ success: false, message: 'Text and author required' });
  const ticketPath = path.join(ticketsDir, `${req.params.id}.json`);
  if (!fs.existsSync(ticketPath)) return res.status(404).json({ success: false, message: 'Ticket not found' });
  fs.readFile(ticketPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading ticket for message:', err);
      return res.status(500).json({ success: false, message: 'Error adding message' });
    }
    const ticket = JSON.parse(data);
    ticket.messages.push({ timestamp: new Date().toISOString(), author, text });
    fs.writeFile(ticketPath, JSON.stringify(ticket, null, 2), (err) => {
      if (err) {
        console.error('Error saving message:', err);
        return res.status(500).json({ success: false, message: 'Error saving message' });
      }
      io.to(req.params.id).emit('newMessage', { timestamp: new Date().toISOString(), author, text });
      res.json({ success: true });
    });
  });
});

// Socket.io for live chat updates
io.on('connection', (socket) => {
  socket.on('joinTicket', (ticketId) => {
    socket.join(ticketId);
    console.log('User joined ticket:', ticketId);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Serve dashboard.html for all unmatched GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});