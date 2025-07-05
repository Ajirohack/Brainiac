const express = require('express');
const llmRoutes = require('./llm.routes');
const ragRoutes = require('./rag.routes');

const router = express.Router();

// Mount sub-routers
router.use('/llm', llmRoutes);
router.use('/rag', ragRoutes);

// Default root
router.get('/', (req, res) => {
  res.json({ message: 'CAI Platform API Root' });
});

module.exports = router; 