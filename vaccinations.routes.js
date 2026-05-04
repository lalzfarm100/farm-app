const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');

const VACCINE_SCHEDULE = {
  'FMD': 180,
  'Hemorrhagic Septicemia': 365,
  'Black Quarter': 365,
  'Lumpy Skin': 180,
  'Brucellosis': null,
};

router.get('/', auth, async (req, res) => {
  try {
    const [records] = await pool.execute(
      'SELECT * FROM vaccinations WHERE farm_id=? ORDER BY next_due_date ASC',
      [req.user.farmId]
    );
    const today = new Date();
    const enriched = records.map(v => ({
      ...v,
      daysUntilDue: v.next_due_date
        ? Math.floor((new Date(v.next_due_date) - today) / 86400000)
        : null,
      isOverdue: v.next_due_date && new Date(v.next_due_date) < today,
    }));
    res.json({ ok: true, records: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const v = req.body;
    const intervalDays = VACCINE_SCHEDULE[v.vaccineName];
    let nextDue = null;
    if (intervalDays && v.givenDate) {
      const d = new Date(v.givenDate);
      d.setDate(d.getDate() + intervalDays);
      nextDue = d.toISOString().split('T')[0];
    }
    const [result] = await pool.execute(
      'INSERT INTO vaccinations (farm_id,tag_number,vaccine_name,given_date,next_due_date,given_by,batch_number,cost,notes) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user.farmId, v.tagNumber, v.vaccineName, v.givenDate, nextDue||v.nextDueDate||null,
       v.givenBy||'', v.batchNumber||'', v.cost||null, v.notes||'']
    );
    res.json({ ok: true, id: result.insertId, nextDue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/due', auth, async (req, res) => {
  try {
    const [due] = await pool.execute(`
      SELECT v.*, a.name as animal_name
      FROM vaccinations v
      LEFT JOIN animals a ON v.tag_number=a.tag_number AND a.farm_id=v.farm_id
      WHERE v.farm_id=? AND v.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      ORDER BY v.next_due_date ASC`,
      [req.user.farmId]
    );
    res.json({ ok: true, due });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
