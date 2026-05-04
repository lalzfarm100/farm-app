// reports.js
const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');

router.get('/summary', auth, async (req, res) => {
  try {
    const fid = req.user.farmId;
    const today = new Date().toISOString().split('T')[0];
    const monthPfx = today.slice(0, 7);

    const [[animals]] = await pool.execute('SELECT COUNT(*) as total, SUM(purchase_price) as totalCost, SUM(estimated_price) as totalValue, SUM(is_pregnant) as pregnant FROM animals WHERE farm_id=? AND is_active=1', [fid]);
    const [[milkMonth]] = await pool.execute("SELECT SUM(morning+evening) as liters, SUM(sold*price) as revenue FROM milking WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=?", [fid, monthPfx]);
    const [[expMonth]] = await pool.execute("SELECT SUM(amount) as total FROM expenses WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=?", [fid, monthPfx]);
    const [[incMonth]] = await pool.execute("SELECT SUM(amount) as total FROM income WHERE farm_id=? AND DATE_FORMAT(date,'%Y-%m')=?", [fid, monthPfx]);
    const [overdueAnimals] = await pool.execute("SELECT tag_number, name FROM animals WHERE farm_id=? AND is_active=1 AND is_pregnant=0 AND last_delivery_date IS NOT NULL AND DATEDIFF(NOW(), last_delivery_date)>=60", [fid]);
    const [vaccDue] = await pool.execute("SELECT COUNT(*) as cnt FROM vaccinations WHERE farm_id=? AND next_due_date<=DATE_ADD(CURDATE(),INTERVAL 7 DAY)", [fid]);
    const [lowFodder] = await pool.execute("SELECT item_name, current_stock, daily_use FROM fodder_stock WHERE farm_id=? AND daily_use>0 AND current_stock/daily_use<7", [fid]);

    res.json({
      ok: true,
      herd: { total: animals.total, pregnant: animals.pregnant, totalCost: animals.totalCost, totalValue: animals.totalValue, gain: (animals.totalValue||0)-(animals.totalCost||0) },
      milk: { liters: milkMonth.liters||0, revenue: milkMonth.revenue||0 },
      finance: { expenses: expMonth.total||0, income: incMonth.total||0, profit: (incMonth.total||0)-(expMonth.total||0) },
      alerts: { overduePregnancy: overdueAnimals.length, vaccDue: vaccDue[0].cnt, lowFodder: lowFodder.length },
      overdueAnimals,
      lowFodder
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/monthly-pl', auth, async (req, res) => {
  try {
    const fid = req.user.farmId;
    const [months] = await pool.execute(`
      SELECT DATE_FORMAT(date,'%Y-%m') as month, SUM(amount) as expenses
      FROM expenses WHERE farm_id=? GROUP BY month`, [fid]);
    const [incMonths] = await pool.execute(`
      SELECT DATE_FORMAT(date,'%Y-%m') as month, SUM(amount) as income
      FROM income WHERE farm_id=? GROUP BY month`, [fid]);
    const allMonths = [...new Set([...months.map(m=>m.month), ...incMonths.map(m=>m.month)])].sort().reverse();
    const pl = allMonths.map(m => ({
      month: m,
      income: incMonths.find(i=>i.month===m)?.income||0,
      expenses: months.find(e=>e.month===m)?.expenses||0,
      profit: (incMonths.find(i=>i.month===m)?.income||0) - (months.find(e=>e.month===m)?.expenses||0)
    }));
    res.json({ ok: true, pl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
