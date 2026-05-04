// tasks.js
const express = require('express');
module.exports = (() => {
  const r = express.Router();
  const auth = require('./auth.middleware');
  const { pool } = require('./database');
  const today = () => new Date().toISOString().split('T')[0];

  r.get('/', auth, async (req, res) => {
    try {
      const [tasks] = await pool.execute(
        'SELECT * FROM tasks WHERE farm_id=? ORDER BY due_date ASC, priority DESC',
        [req.user.farmId]
      );
      res.json({ ok: true, tasks });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.post('/', auth, async (req, res) => {
    try {
      const t = req.body;
      const [result] = await pool.execute(
        'INSERT INTO tasks (farm_id,title,description,due_date,priority,category,repeat_daily) VALUES (?,?,?,?,?,?,?)',
        [req.user.farmId, t.title, t.description||'', t.dueDate||today(), t.priority||'medium', t.category||'', t.repeatDaily?1:0]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.put('/:id', auth, async (req, res) => {
    try {
      const { status } = req.body;
      await pool.execute('UPDATE tasks SET status=? WHERE id=? AND farm_id=?',
        [status, req.params.id, req.user.farmId]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.delete('/:id', auth, async (req, res) => {
    try {
      await pool.execute('DELETE FROM tasks WHERE id=? AND farm_id=?',
        [req.params.id, req.user.farmId]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return r;
})();
