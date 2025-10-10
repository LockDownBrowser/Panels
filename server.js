const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the root directory
app.use(express.static('.'));

// Handle all routes by serving index.html (for client-side routing if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server on the port provided by Render or default to 3000
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});