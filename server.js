require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ───────────────────────────────────────────────
const db = require('./database');

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',         require('./auth.routes'));
app.use('/api/farms',        require('./farms.routes'));
app.use('/api/animals',      require('./animals.routes'));
app.use('/api/milking',      require('./milking.routes'));
app.use('/api/finance',      require('./finance.routes'));
app.use('/api/tasks',        require('./tasks.routes'));
app.use('/api/vaccinations', require('./vaccinations.routes'));
app.use('/api/weather',      require('./weather.routes'));
app.use('/api/alerts',       require('./alerts.routes').router);
app.use('/api/reports',      require('./reports.routes'));

// ── Serve frontend for all non-API routes ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Cron Jobs ─────────────────────────────────────────────
// Daily morning report at 6 AM Pakistan time
cron.schedule('0 6 * * *', () => {
  console.log('Running morning alerts...');
  require('./cronJobs').morningAlerts();
}, { timezone: 'Asia/Karachi' });

// Evening summary at 7 PM
cron.schedule('0 19 * * *', () => {
  console.log('Running evening summary...');
  require('./cronJobs').eveningAlerts();
}, { timezone: 'Asia/Karachi' });

// Check breeding alerts every 6 hours
cron.schedule('0 */6 * * *', () => {
  require('./cronJobs').breedingAlerts();
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🌾 Lalz Farm Server running on port ${PORT}`);
  try {
    await db.initialize();
  } catch (err) {
    console.error('DB init warning:', err.message);
    console.log('Server running - DB will retry on first request');
  }
});

// Handle uncaught errors gracefully
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err.message);
});
