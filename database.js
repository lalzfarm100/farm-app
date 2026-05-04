const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'lalzfarm',
  port:     Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 30000,
});

async function initialize() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Database connected');

    // ── Farms (multi-tenant) ──────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS farms (
        id          VARCHAR(36)  PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        owner_name  VARCHAR(100),
        email       VARCHAR(100),
        phone       VARCHAR(20),
        address     TEXT,
        farm_type   VARCHAR(20)  DEFAULT 'mixed',
        logo_url    VARCHAR(500),
        lat         DECIMAL(10,7) DEFAULT 30.1575,
        lng         DECIMAL(10,7) DEFAULT 71.5249,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Users ─────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        farm_id     VARCHAR(36)  NOT NULL,
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(100) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        role        ENUM('owner','manager','staff') DEFAULT 'staff',
        phone       VARCHAR(20),
        whatsapp    VARCHAR(20),
        is_active   BOOLEAN      DEFAULT TRUE,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Animals ───────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS animals (
        id                  VARCHAR(36)  PRIMARY KEY,
        farm_id             VARCHAR(36)  NOT NULL,
        tag_number          VARCHAR(20)  NOT NULL,
        name                VARCHAR(50),
        breed               VARCHAR(50),
        farm_type           VARCHAR(10)  DEFAULT 'dairy',
        photo_url           VARCHAR(500),
        calf_photo_url      VARCHAR(500),
        date_of_birth       DATE,
        purchase_price      DECIMAL(12,2),
        estimated_price     DECIMAL(12,2),
        insemination_date   DATE,
        inseminated_with    VARCHAR(100),
        insemination_price  DECIMAL(10,2),
        pregnancy_check     DATE,
        pregnancy_confirmed ENUM('pending','yes','no') DEFAULT 'pending',
        is_pregnant         BOOLEAN      DEFAULT FALSE,
        expected_delivery   DATE,
        actual_delivery     DATE,
        last_delivery_date  DATE,
        next_pregnancy_due  DATE,
        calves_notes        TEXT,
        notes               TEXT,
        is_active           BOOLEAN      DEFAULT TRUE,
        created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Milking Records ───────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS milking (
        id          VARCHAR(36)  PRIMARY KEY,
        farm_id     VARCHAR(36)  NOT NULL,
        tag_number  VARCHAR(20),
        date        DATE         NOT NULL,
        session     VARCHAR(20)  DEFAULT 'both',
        morning     DECIMAL(8,2) DEFAULT 0,
        evening     DECIMAL(8,2) DEFAULT 0,
        sold        DECIMAL(8,2) DEFAULT 0,
        price       DECIMAL(8,2) DEFAULT 120,
        vendor      VARCHAR(100),
        notes       TEXT,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Vendors ───────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS vendors (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        farm_id     VARCHAR(36)  NOT NULL,
        name        VARCHAR(100) NOT NULL,
        phone       VARCHAR(20),
        rate        DECIMAL(8,2),
        notes       TEXT,
        is_active   BOOLEAN      DEFAULT TRUE,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Finance ───────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id          VARCHAR(36)  PRIMARY KEY,
        farm_id     VARCHAR(36)  NOT NULL,
        date        DATE         NOT NULL,
        category    VARCHAR(50)  NOT NULL,
        description TEXT,
        amount      DECIMAL(12,2) NOT NULL,
        party       VARCHAR(100),
        notes       TEXT,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS income (
        id          VARCHAR(36)  PRIMARY KEY,
        farm_id     VARCHAR(36)  NOT NULL,
        date        DATE         NOT NULL,
        category    VARCHAR(50)  NOT NULL,
        description TEXT,
        amount      DECIMAL(12,2) NOT NULL,
        party       VARCHAR(100),
        notes       TEXT,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Tasks ─────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        farm_id      VARCHAR(36)  NOT NULL,
        title        VARCHAR(200) NOT NULL,
        description  TEXT,
        due_date     DATE,
        assigned_to  INT,
        status       ENUM('pending','done','skipped') DEFAULT 'pending',
        priority     ENUM('low','medium','high','urgent') DEFAULT 'medium',
        category     VARCHAR(50),
        repeat_daily BOOLEAN      DEFAULT FALSE,
        created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Vaccinations ──────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS vaccinations (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        farm_id         VARCHAR(36)  NOT NULL,
        tag_number      VARCHAR(20)  NOT NULL,
        vaccine_name    VARCHAR(100) NOT NULL,
        given_date      DATE         NOT NULL,
        next_due_date   DATE,
        given_by        VARCHAR(100),
        batch_number    VARCHAR(50),
        cost            DECIMAL(8,2),
        notes           TEXT,
        created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Fodder Stock ──────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS fodder_stock (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        farm_id         VARCHAR(36)  NOT NULL,
        item_name       VARCHAR(100) NOT NULL,
        unit            VARCHAR(20)  DEFAULT 'kg',
        current_stock   DECIMAL(10,2) DEFAULT 0,
        daily_use       DECIMAL(10,2) DEFAULT 0,
        reorder_level   DECIMAL(10,2) DEFAULT 0,
        cost_per_unit   DECIMAL(8,2)  DEFAULT 0,
        last_updated    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
      )
    `);

    // ── Alert Logs ────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS alert_logs (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        farm_id     VARCHAR(36)  NOT NULL,
        type        VARCHAR(50),
        message     TEXT,
        sent_to     VARCHAR(100),
        channel     VARCHAR(20),
        status      VARCHAR(20)  DEFAULT 'sent',
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    conn.release();
    console.log('✅ All database tables ready');
  } catch (err) {
    console.error('❌ Database error:', err.message);
  }
}

module.exports = { pool, initialize };
