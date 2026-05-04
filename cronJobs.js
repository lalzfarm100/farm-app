const { pool } = require('./database');
const { buildMorningReport } = require('./alerts.routes');

async function morningAlerts() {
  try {
    const [farms] = await pool.execute('SELECT id FROM farms');
    for (const farm of farms) {
      const msg = await buildMorningReport(farm.id);
      const [staff] = await pool.execute(
        'SELECT name, whatsapp, phone FROM users WHERE farm_id=? AND is_active=1 AND role IN ("owner","manager")',
        [farm.id]
      );
      // Log the alert (actual sending requires WhatsApp Business API or Twilio)
      for (const s of staff) {
        const phone = s.whatsapp || s.phone;
        if (phone) {
          await pool.execute(
            'INSERT INTO alert_logs (farm_id,type,message,sent_to,channel,status) VALUES (?,?,?,?,?,?)',
            [farm.id, 'morning_report', msg, phone, 'whatsapp', 'pending']
          );
          console.log(`Morning alert queued for ${s.name} (${phone})`);
        }
      }
    }
  } catch (err) {
    console.error('Morning alert error:', err.message);
  }
}

async function eveningAlerts() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [farms] = await pool.execute('SELECT id, name FROM farms');

    for (const farm of farms) {
      // Get today's milk totals
      const [milkToday] = await pool.execute(`
        SELECT SUM(morning+evening) as total_milk, SUM(sold*price) as revenue
        FROM milking WHERE farm_id=? AND date=?`,
        [farm.id, today]
      );

      // Get completed tasks
      const [tasks] = await pool.execute(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done
        FROM tasks WHERE farm_id=? AND due_date=?`,
        [farm.id, today]
      );

      const milk = milkToday[0];
      const task = tasks[0];

      let msg = `📊 *${farm.name} — Evening Summary*\n`;
      msg += `📅 ${new Date().toLocaleDateString('en-PK', { day:'numeric', month:'long' })}\n\n`;
      msg += `🥛 Milk Collected: ${Number(milk?.total_milk||0).toFixed(1)}L\n`;
      msg += `💰 Revenue: PKR ${Number(milk?.revenue||0).toLocaleString()}\n`;
      msg += `✅ Tasks: ${task?.done||0}/${task?.total||0} completed\n\n`;
      msg += `_Tomorrow's morning report will be sent at 6 AM_`;

      await pool.execute(
        'INSERT INTO alert_logs (farm_id,type,message,sent_to,channel,status) VALUES (?,?,?,?,?,?)',
        [farm.id, 'evening_summary', msg, 'all_managers', 'whatsapp', 'pending']
      );
    }
    console.log('Evening summaries generated');
  } catch (err) {
    console.error('Evening alert error:', err.message);
  }
}

async function breedingAlerts() {
  try {
    const today = new Date();
    const [animals] = await pool.execute(`
      SELECT a.*, f.name as farm_name
      FROM animals a JOIN farms f ON a.farm_id=f.id
      WHERE a.is_active=1`
    );

    for (const a of animals) {
      // 60-day pregnancy check
      if (a.last_delivery_date && !a.is_pregnant) {
        const days = Math.floor((today - new Date(a.last_delivery_date)) / 86400000);
        if (days >= 60) {
          await pool.execute(`
            INSERT IGNORE INTO alert_logs (farm_id,type,message,sent_to,channel,status)
            VALUES (?,?,?,?,?,?)`,
            [a.farm_id, 'breeding_alert',
             `🚨 Tag #${a.tag_number} (${a.name||'—'}) is ${days-60} days overdue for pregnancy`,
             'managers', 'whatsapp', 'pending']
          );
        }
      }
      // Delivery approaching
      if (a.expected_delivery && a.is_pregnant) {
        const daysLeft = Math.floor((new Date(a.expected_delivery) - today) / 86400000);
        if (daysLeft === 21) {
          await pool.execute(`
            INSERT INTO alert_logs (farm_id,type,message,sent_to,channel,status)
            VALUES (?,?,?,?,?,?)`,
            [a.farm_id, 'dry_off_alert',
             `🐄 Tag #${a.tag_number} (${a.name||'—'}) — DRY OFF NOW. Delivery in 21 days. Stop milking and increase feed.`,
             'managers', 'whatsapp', 'pending']
          );
        }
        if (daysLeft === 7) {
          await pool.execute(`
            INSERT INTO alert_logs (farm_id,type,message,sent_to,channel,status)
            VALUES (?,?,?,?,?,?)`,
            [a.farm_id, 'delivery_soon',
             `🍼 Tag #${a.tag_number} (${a.name||'—'}) — Delivery in 7 days! Prepare calving area.`,
             'managers', 'whatsapp', 'pending']
          );
        }
      }
    }
    console.log('Breeding alerts checked');
  } catch (err) {
    console.error('Breeding alert error:', err.message);
  }
}

module.exports = { morningAlerts, eveningAlerts, breedingAlerts };
