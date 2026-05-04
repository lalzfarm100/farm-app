const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── GET milking records ────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { from, to, vendor, tag } = req.query;
    let sql = 'SELECT * FROM milking WHERE farm_id=?';
    const params = [req.user.farmId];
    if (from)   { sql += ' AND date>=?'; params.push(from); }
    if (to)     { sql += ' AND date<=?'; params.push(to); }
    if (vendor) { sql += ' AND vendor=?'; params.push(vendor); }
    if (tag)    { sql += ' AND tag_number=?'; params.push(tag); }
    sql += ' ORDER BY date DESC, created_at DESC LIMIT 200';
    const [records] = await pool.execute(sql, params);
    res.json({ ok: true, records });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET vendor summary ─────────────────────────────────────
router.get('/vendor-summary', auth, async (req, res) => {
  try {
    const { month } = req.query;
    const monthFilter = month || new Date().toISOString().slice(0, 7);

    // This month per vendor
    const [monthly] = await pool.execute(`
      SELECT vendor,
        SUM(sold) as total_liters,
        SUM(sold * price) as total_revenue,
        AVG(price) as avg_rate,
        COUNT(*) as entries
      FROM milking
      WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=?
      GROUP BY vendor ORDER BY total_revenue DESC`,
      [req.user.farmId, monthFilter]
    );

    // All time per vendor
    const [allTime] = await pool.execute(`
      SELECT vendor,
        SUM(sold) as total_liters,
        SUM(sold * price) as total_revenue,
        AVG(price) as avg_rate
      FROM milking WHERE farm_id=?
      GROUP BY vendor ORDER BY total_revenue DESC`,
      [req.user.farmId]
    );

    // Daily totals for current month
    const [daily] = await pool.execute(`
      SELECT date,
        SUM(morning) as morning, SUM(evening) as evening,
        SUM(morning+evening) as total,
        SUM(sold) as sold, SUM(sold*price) as revenue
      FROM milking
      WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=?
      GROUP BY date ORDER BY date DESC`,
      [req.user.farmId, monthFilter]
    );

    res.json({ ok: true, monthly, allTime, daily });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET today summary ──────────────────────────────────────
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [records] = await pool.execute(
      'SELECT * FROM milking WHERE farm_id=? AND date=? ORDER BY created_at DESC',
      [req.user.farmId, today]
    );
    const totals = records.reduce((s, r) => ({
      morning: s.morning + Number(r.morning || 0),
      evening: s.evening + Number(r.evening || 0),
      sold: s.sold + Number(r.sold || 0),
      revenue: s.revenue + Number(r.sold || 0) * Number(r.price || 0),
    }), { morning: 0, evening: 0, sold: 0, revenue: 0 });
    res.json({ ok: true, records, totals });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST add record ────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const r = req.body;
    const id = genId();
    await pool.execute(`
      INSERT INTO milking (id,farm_id,tag_number,date,session,morning,evening,sold,price,vendor,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.farmId, r.tagNumber||'', r.date, r.session||'both',
       r.morning||0, r.evening||0, r.sold||0, r.price||120, r.vendor||'', r.notes||'']
    );
    // Also record as income automatically
    if (r.sold > 0 && r.price > 0) {
      const incId = genId();
      await pool.execute(`
        INSERT INTO income (id,farm_id,date,category,description,amount,party)
        VALUES (?,?,?,?,?,?,?)`,
        [incId, req.user.farmId, r.date, 'Milk Sale',
         `Milk sale - ${r.sold}L @ PKR${r.price}/L to ${r.vendor||''}`,
         Number(r.sold) * Number(r.price), r.vendor||'']
      );
    }
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE record ──────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.execute('DELETE FROM milking WHERE id=? AND farm_id=?',
      [req.params.id, req.user.farmId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET vendors ────────────────────────────────────────────
router.get('/vendors', auth, async (req, res) => {
  try {
    const [vendors] = await pool.execute(
      'SELECT * FROM vendors WHERE farm_id=? AND is_active=1 ORDER BY name',
      [req.user.farmId]
    );
    res.json({ ok: true, vendors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST add vendor ────────────────────────────────────────
router.post('/vendors', auth, async (req, res) => {
  try {
    const { name, phone, rate } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO vendors (farm_id, name, phone, rate) VALUES (?,?,?,?)',
      [req.user.farmId, name, phone||'', rate||null]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE vendor ──────────────────────────────────────────
router.delete('/vendors/:id', auth, async (req, res) => {
  try {
    await pool.execute('UPDATE vendors SET is_active=0 WHERE id=? AND farm_id=?',
      [req.params.id, req.user.farmId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
