const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./database');


function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const JWT_SECRET = process.env.JWT_SECRET || 'lalzfarm_secret_2024';

// ── Register new farm + owner ──────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { farmName, ownerName, email, password, phone, address, farmType } = req.body;
    if (!farmName || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

    // Check email not taken
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ error: 'Email already registered' });

    const farmId = genId();
    const hashedPwd = await bcrypt.hash(password, 10);

    // Create farm
    await pool.execute(
      'INSERT INTO farms (id, name, owner_name, email, phone, address, farm_type) VALUES (?,?,?,?,?,?,?)',
      [farmId, farmName, ownerName, email, phone || '', address || '', farmType || 'mixed']
    );

    // Create owner user
    await pool.execute(
      'INSERT INTO users (farm_id, name, email, password, role, phone) VALUES (?,?,?,?,?,?)',
      [farmId, ownerName, email, hashedPwd, 'owner', phone || '']
    );

    // Create default vendors
    await pool.execute('INSERT INTO vendors (farm_id, name) VALUES (?,?)', [farmId, 'Rakha']);
    await pool.execute('INSERT INTO vendors (farm_id, name) VALUES (?,?)', [farmId, 'Hassan']);

    // Create default fodder items
    const fodderItems = [
      ['Wanda (Commercial Feed)', 'kg', 0, 50],
      ['Silage', 'kg', 0, 200],
      ['Hay/Tanda', 'kg', 0, 30],
      ['Jantar/Sorghum', 'kg', 0, 100],
      ['Lucerne', 'kg', 0, 40],
    ];
    for (const [name, unit, stock, daily] of fodderItems) {
      await pool.execute(
        'INSERT INTO fodder_stock (farm_id, item_name, unit, current_stock, daily_use) VALUES (?,?,?,?,?)',
        [farmId, name, unit, stock, daily]
      );
    }

    const token = jwt.sign({ farmId, email, role: 'owner' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, farmId, farmName, ownerName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Login ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [users] = await pool.execute(
      'SELECT u.*, f.name as farm_name, f.id as farm_id, f.logo_url FROM users u JOIN farms f ON u.farm_id = f.id WHERE u.email = ? AND u.is_active = 1',
      [email]
    );
    if (!users.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { farmId: user.farm_id, userId: user.id, email, role: user.role },
      JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      ok: true, token,
      user: { id: user.id, name: user.name, email, role: user.role, phone: user.phone, whatsapp: user.whatsapp },
      farm: { id: user.farm_id, name: user.farm_name, logo: user.logo_url }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Add staff member ───────────────────────────────────────
router.post('/add-staff', require('./auth.middleware'), async (req, res) => {
  try {
    const { name, email, password, role, phone, whatsapp } = req.body;
    const { farmId } = req.user;
    const hashedPwd = await bcrypt.hash(password, 10);
    await pool.execute(
      'INSERT INTO users (farm_id, name, email, password, role, phone, whatsapp) VALUES (?,?,?,?,?,?,?)',
      [farmId, name, email, hashedPwd, role || 'staff', phone || '', whatsapp || '']
    );
    res.json({ ok: true, message: 'Staff member added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get all staff ──────────────────────────────────────────
router.get('/staff', require('./auth.middleware'), async (req, res) => {
  try {
    const [staff] = await pool.execute(
      'SELECT id, name, email, role, phone, whatsapp, is_active, created_at FROM users WHERE farm_id = ?',
      [req.user.farmId]
    );
    res.json({ ok: true, staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
