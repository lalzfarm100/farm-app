const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── File upload setup ──────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = `uploads/${req.user.farmId}`;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── GET all animals ────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [animals] = await pool.execute(
      'SELECT * FROM animals WHERE farm_id = ? AND is_active = 1 ORDER BY tag_number',
      [req.user.farmId]
    );
    // Add computed status
    const today = new Date();
    const result = animals.map(a => {
      let status = 'healthy';
      let daysOverdue = null;
      let daysToDelivery = null;
      if (a.last_delivery_date) {
        const days = Math.floor((today - new Date(a.last_delivery_date)) / 86400000);
        if (a.is_pregnant) status = 'pregnant';
        else if (days >= 60) { status = 'alert'; daysOverdue = days - 60; }
        else if (days >= 45) { status = 'prep'; }
        else status = 'delivered';
      }
      if (a.expected_delivery) {
        daysToDelivery = Math.floor((new Date(a.expected_delivery) - today) / 86400000);
      }
      return { ...a, status, daysOverdue, daysToDelivery };
    });
    res.json({ ok: true, animals: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST add animal ────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const a = req.body;
    const id = genId();
    await pool.execute(`
      INSERT INTO animals (id, farm_id, tag_number, name, breed, farm_type,
        date_of_birth, purchase_price, estimated_price,
        insemination_date, inseminated_with, insemination_price,
        pregnancy_check, pregnancy_confirmed, is_pregnant,
        expected_delivery, actual_delivery, last_delivery_date,
        next_pregnancy_due, calves_notes, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.farmId, a.tagNumber, a.name||'', a.breed||'', a.farmType||'dairy',
       a.dateOfBirth||null, a.purchasePrice||null, a.estimatedPrice||null,
       a.inseminationDate||null, a.inseminatedWith||'', a.inseminationPrice||null,
       a.pregnancyCheck||null, a.pregnancyConfirmed||'pending', a.isPregnant?1:0,
       a.expectedDelivery||null, a.actualDelivery||null, a.lastDeliveryDate||null,
       a.nextPregnancyDue||null, a.calvesNotes||'', a.notes||'']
    );
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update animal ──────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const a = req.body;
    await pool.execute(`
      UPDATE animals SET tag_number=?, name=?, breed=?, farm_type=?,
        date_of_birth=?, purchase_price=?, estimated_price=?,
        insemination_date=?, inseminated_with=?, insemination_price=?,
        pregnancy_check=?, pregnancy_confirmed=?, is_pregnant=?,
        expected_delivery=?, actual_delivery=?, last_delivery_date=?,
        next_pregnancy_due=?, calves_notes=?, notes=?
      WHERE id=? AND farm_id=?`,
      [a.tagNumber, a.name||'', a.breed||'', a.farmType||'dairy',
       a.dateOfBirth||null, a.purchasePrice||null, a.estimatedPrice||null,
       a.inseminationDate||null, a.inseminatedWith||'', a.inseminationPrice||null,
       a.pregnancyCheck||null, a.pregnancyConfirmed||'pending', a.isPregnant?1:0,
       a.expectedDelivery||null, a.actualDelivery||null, a.lastDeliveryDate||null,
       a.nextPregnancyDue||null, a.calvesNotes||'', a.notes||'',
       req.params.id, req.user.farmId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE animal ──────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.execute('UPDATE animals SET is_active=0 WHERE id=? AND farm_id=?',
      [req.params.id, req.user.farmId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST upload photo ──────────────────────────────────────
router.post('/:id/photo', auth, upload.single('photo'), async (req, res) => {
  try {
    const url = `/uploads/${req.user.farmId}/${req.file.filename}`;
    const field = req.body.type === 'calf' ? 'calf_photo_url' : 'photo_url';
    await pool.execute(`UPDATE animals SET ${field}=? WHERE id=? AND farm_id=?`,
      [url, req.params.id, req.user.farmId]);
    res.json({ ok: true, url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST bulk import ───────────────────────────────────────
router.post('/import', auth, async (req, res) => {
  try {
    const { animals } = req.body;
    let imported = 0, skipped = 0;
    for (const a of animals) {
      if (!a.tagNumber) { skipped++; continue; }
      const [existing] = await pool.execute(
        'SELECT id FROM animals WHERE farm_id=? AND tag_number=?',
        [req.user.farmId, a.tagNumber]
      );
      if (existing.length > 0) {
        // Update existing
        await pool.execute(`UPDATE animals SET name=?,breed=?,farm_type=?,
          purchase_price=?,estimated_price=?,last_delivery_date=?,is_pregnant=?,notes=?
          WHERE farm_id=? AND tag_number=?`,
          [a.name||'', a.breed||'', a.farmType||'dairy',
           a.purchasePrice||null, a.estimatedPrice||null,
           a.lastDeliveryDate||null, a.isPregnant?1:0, a.notes||'',
           req.user.farmId, a.tagNumber]
        );
      } else {
        const id = genId();
        await pool.execute(`INSERT INTO animals (id,farm_id,tag_number,name,breed,
          farm_type,purchase_price,estimated_price,last_delivery_date,is_pregnant,notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, req.user.farmId, a.tagNumber, a.name||'', a.breed||'', a.farmType||'dairy',
           a.purchasePrice||null, a.estimatedPrice||null,
           a.lastDeliveryDate||null, a.isPregnant?1:0, a.notes||'']
        );
      }
      imported++;
    }
    res.json({ ok: true, imported, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
