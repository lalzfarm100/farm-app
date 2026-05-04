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
const db = require('./src/database');

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/farms',        require('./routes/farms'));
app.use('/api/animals',      require('./routes/animals'));
app.use('/api/milking',      require('./routes/milking'));
app.use('/api/finance',      require('./routes/finance'));
app.use('/api/tasks',        require('./routes/tasks'));
app.use('/api/vaccinations', require('./routes/vaccinations'));
app.use('/api/weather',      require('./routes/weather'));
app.use('/api/alerts',       require('./routes/alerts'));
app.use('/api/reports',      require('./routes/reports'));

// ── Serve frontend for all non-API routes ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Cron Jobs ─────────────────────────────────────────────
// Daily morning report at 6 AM Pakistan time
cron.schedule('0 6 * * *', () => {
  console.log('Running morning alerts...');
  require('./src/cronJobs').morningAlerts();
}, { timezone: 'Asia/Karachi' });

// Evening summary at 7 PM
cron.schedule('0 19 * * *', () => {
  console.log('Running evening summary...');
  require('./src/cronJobs').eveningAlerts();
}, { timezone: 'Asia/Karachi' });

// Check breeding alerts every 6 hours
cron.schedule('0 */6 * * *', () => {
  require('./src/cronJobs').breedingAlerts();
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌾 Lalz Farm Server running on port ${PORT}`);
  db.initialize();
});
