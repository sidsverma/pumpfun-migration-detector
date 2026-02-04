import express from 'express';
import * as path from 'path';
import * as fs from 'fs';

const app = express();
const PORT = 3000;

const DATA_FILE = path.join(__dirname, '..', 'data', 'migrations_latest.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Disable caching for all requests
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Serve static files
app.use(express.static(PUBLIC_DIR));

// API endpoint for migrations data
app.get('/api/migrations', (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return res.json({
                run_at: new Date().toISOString(),
                window_seconds: 0,
                migrations: []
            });
        }

        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        const json = JSON.parse(data);
        res.json(json);
    } catch (error) {
        console.error('Error reading migrations data:', error);
        res.status(500).json({ error: 'Failed to load migrations data' });
    }
});



// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🌐 Migration Dashboard running at: http://localhost:${PORT}`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api/migrations`);
    console.log(`\nPress Ctrl+C to stop the server.\n`);
});
