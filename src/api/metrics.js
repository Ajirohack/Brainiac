const express = require('express');
const os = require('os');
const router = express.Router();

router.get('/', (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    platform: os.platform(),
    loadAverage: os.loadavg(),
    timestamp: new Date().toISOString()
  };
  res.status(200).json(metrics);
});

module.exports = router; 