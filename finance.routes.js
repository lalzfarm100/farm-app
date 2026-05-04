// ── FINANCE ROUTES ─────────────────────────────────────────
const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

router.get('/', auth, async (req, res) => {
  try {
    const { month } = req.query;
    const m = month || new Date().toISOString().slice(0,7);
    const [expenses] = await pool.execute(
      "SELECT * FROM expenses WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=? ORDER BY date DESC",
      [req.user.farmId, m]
    );
    const [income] = await pool.execute(
      "SELECT * FROM income WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=? ORDER BY date DESC",
      [req.user.farmId, m]
    );
    const [monthly] = await pool.execute(`
      SELECT DATE_FORMAT(date,'%Y-%m') as month,
        SUM(amount) as total
      FROM expenses WHERE farm_id=? GROUP BY month ORDER BY month DESC LIMIT 12`,
      [req.user.farmId]
    );
    res.json({ ok: true, expenses, income, monthly });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expense', auth, async (req, res) => {
  try {
    const e = req.body;
    const id = genId();
    await pool.execute(
      'INSERT INTO expenses (id,farm_id,date,category,description,amount,party,notes) VALUES (?,?,?,?,?,?,?,?)',
      [id, req.user.farmId, e.date, e.category, e.description||'', e.amount, e.party||'', e.notes||'']
    );
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/income', auth, async (req, res) => {
  try {
    const i = req.body;
    const id = genId();
    await pool.execute(
      'INSERT INTO income (id,farm_id,date,category,description,amount,party,notes) VALUES (?,?,?,?,?,?,?,?)',
      [id, req.user.farmId, i.date, i.category, i.description||'', i.amount, i.party||'', i.notes||'']
    );
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/expense/:id', auth, async (req, res) => {
  try {
    await pool.execute('DELETE FROM expenses WHERE id=? AND farm_id=?', [req.params.id, req.user.farmId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/income/:id', auth, async (req, res) => {
  try {
    await pool.execute('DELETE FROM income WHERE id=? AND farm_id=?', [req.params.id, req.user.farmId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
