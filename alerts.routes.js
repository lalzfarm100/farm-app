const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const { pool } = require('./database');
const axios = require('axios');

// ── Send WhatsApp via wa.me link (free, no API needed) ────
function whatsappLink(phone, message) {
  const clean = phone.replace(/\D/g, '');
  const num = clean.startsWith('92') ? clean : '92' + clean.replace(/^0/, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// ── Send SMS via Twilio (optional) ────────────────────────
async function sendSMS(to, message) {
  if (!process.env.TWILIO_SID) return { ok: false, reason: 'Twilio not configured' };
  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
      new URLSearchParams({
        To: to.startsWith('+') ? to : '+92' + to.replace(/^0/, ''),
        From: process.env.TWILIO_FROM,
        Body: message
      }),
      { auth: { username: process.env.TWILIO_SID, password: process.env.TWILIO_TOKEN } }
    );
    return { ok: true, sid: response.data.sid };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Build daily morning report ─────────────────────────────
async function buildMorningReport(farmId) {
  const today = new Date().toISOString().split('T')[0];
  const [farm] = await pool.execute('SELECT * FROM farms WHERE id=?', [farmId]);
  const [animals] = await pool.execute(
    'SELECT * FROM animals WHERE farm_id=? AND is_active=1', [farmId]
  );
  const [tasks] = await pool.execute(
    'SELECT * FROM tasks WHERE farm_id=? AND due_date=? AND status="pending"', [farmId, today]
  );
  const [vaccDue] = await pool.execute(
    'SELECT * FROM vaccinations WHERE farm_id=? AND next_due_date=?', [farmId, today]
  );
  const [fodder] = await pool.execute(
    'SELECT * FROM fodder_stock WHERE farm_id=?', [farmId]
  );

  // Find alerts
  const overdueAnimals = animals.filter(a => {
    if (!a.last_delivery_date || a.is_pregnant) return false;
    const days = Math.floor((new Date() - new Date(a.last_delivery_date)) / 86400000);
    return days >= 60;
  });

  const deliverySoon = animals.filter(a => {
    if (!a.expected_delivery) return false;
    const days = Math.floor((new Date(a.expected_delivery) - new Date()) / 86400000);
    return days >= 0 && days <= 7;
  });

  const lowFodder = fodder.filter(f => f.daily_use > 0 && f.current_stock / f.daily_use < 7);

  let msg = `🌾 *${farm[0]?.name || 'Lalz Farm'} — Morning Report*\n`;
  msg += `📅 ${new Date().toLocaleDateString('en-PK', { weekday:'long', day:'numeric', month:'long' })}\n\n`;

  if (overdueAnimals.length > 0) {
    msg += `🚨 *URGENT — Pregnancy Alert:*\n`;
    overdueAnimals.forEach(a => msg += `  • Tag #${a.tag_number} (${a.name||'—'}) — overdue for pregnancy\n`);
    msg += '\n';
  }

  if (deliverySoon.length > 0) {
    msg += `🐮 *Delivery Due Soon:*\n`;
    deliverySoon.forEach(a => {
      const days = Math.floor((new Date(a.expected_delivery) - new Date()) / 86400000);
      msg += `  • Tag #${a.tag_number} — delivery in ${days} day${days!==1?'s':''}\n`;
    });
    msg += '\n';
  }

  if (tasks.length > 0) {
    msg += `✅ *Today\'s Tasks:*\n`;
    tasks.forEach(t => msg += `  • ${t.title}\n`);
    msg += '\n';
  }

  if (vaccDue.length > 0) {
    msg += `💉 *Vaccinations Due Today:*\n`;
    vaccDue.forEach(v => msg += `  • Tag #${v.tag_number} — ${v.vaccine_name}\n`);
    msg += '\n';
  }

  if (lowFodder.length > 0) {
    msg += `⚠️ *Low Fodder Stock:*\n`;
    lowFodder.forEach(f => {
      const days = (f.current_stock / f.daily_use).toFixed(0);
      msg += `  • ${f.item_name} — ${days} days remaining\n`;
    });
    msg += '\n';
  }

  msg += `🐄 Total Animals: ${animals.length} | Dairy: ${animals.filter(a=>a.farm_type==='dairy').length} | Pregnant: ${animals.filter(a=>a.is_pregnant).length}\n`;
  msg += `\n_Reply to this message to update task status_`;

  return msg;
}

// ── GET daily alerts preview ───────────────────────────────
router.get('/preview', auth, async (req, res) => {
  try {
    const msg = await buildMorningReport(req.user.farmId);
    const [staff] = await pool.execute(
      'SELECT name, whatsapp, phone FROM users WHERE farm_id=? AND is_active=1',
      [req.user.farmId]
    );
    const links = staff
      .filter(s => s.whatsapp || s.phone)
      .map(s => ({
        name: s.name,
        whatsappLink: whatsappLink(s.whatsapp || s.phone, msg),
        phone: s.whatsapp || s.phone
      }));
    res.json({ ok: true, message: msg, links });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST send alerts manually ──────────────────────────────
router.post('/send', auth, async (req, res) => {
  try {
    const { message, phones, channel } = req.body;
    const results = [];
    for (const phone of phones) {
      if (channel === 'sms') {
        const r = await sendSMS(phone, message);
        results.push({ phone, ...r });
        // Log it
        await pool.execute(
          'INSERT INTO alert_logs (farm_id,type,message,sent_to,channel,status) VALUES (?,?,?,?,?,?)',
          [req.user.farmId, 'manual', message, phone, 'sms', r.ok?'sent':'failed']
        );
      } else {
        // WhatsApp link — just return the link
        results.push({ phone, ok: true, link: whatsappLink(phone, message) });
      }
    }
    res.json({ ok: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET alert history ──────────────────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const [logs] = await pool.execute(
      'SELECT * FROM alert_logs WHERE farm_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.farmId]
    );
    res.json({ ok: true, logs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, buildMorningReport };
