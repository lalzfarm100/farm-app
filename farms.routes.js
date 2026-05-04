const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');

router.get('/me', auth, async (req, res) => {
  try {
    const [farms] = await pool.execute('SELECT * FROM farms WHERE id=?', [req.user.farmId]);
    if (!farms.length) return res.status(404).json({ error: 'Farm not found' });
    const [vendors] = await pool.execute('SELECT * FROM vendors WHERE farm_id=? AND is_active=1', [req.user.farmId]);
    const [fodder] = await pool.execute('SELECT * FROM fodder_stock WHERE farm_id=?', [req.user.farmId]);
    res.json({ ok: true, farm: farms[0], vendors, fodder });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/me', auth, async (req, res) => {
  try {
    const { name, ownerName, phone, address, farmType, lat, lng } = req.body;
    await pool.execute(
      'UPDATE farms SET name=?,owner_name=?,phone=?,address=?,farm_type=?,lat=?,lng=? WHERE id=?',
      [name, ownerName, phone||'', address||'', farmType||'mixed', lat||30.1575, lng||71.5249, req.user.farmId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/fodder/:id', auth, async (req, res) => {
  try {
    const { currentStock, dailyUse, costPerUnit, reorderLevel } = req.body;
    await pool.execute(
      'UPDATE fodder_stock SET current_stock=?,daily_use=?,cost_per_unit=?,reorder_level=? WHERE id=? AND farm_id=?',
      [currentStock, dailyUse, costPerUnit||0, reorderLevel||0, req.params.id, req.user.farmId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
