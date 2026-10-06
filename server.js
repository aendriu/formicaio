const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 7364;

// 1. ESPONE LE CARTELLE PUBBLICHE AL BROWSER
app.use(express.static(path.join(__dirname, 'public'))); // Per la pagina HTML
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Per mostrare le immagini

// Middleware per i caricamenti grezzi dell'ESP32
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));
// Middleware per il parsing JSON (per i dati del DHT11)
app.use(express.json());

// --- ROTTA ESP32: RICEVE LE FOTO ---
app.post('/api/upload-photo', (req, res) => {
    if (!req.body || req.body.length === 0) {
        return res.status(400).send('Nessuna immagine ricevuta');
    }

    const now = new Date();
    const giorno = String(now.getDate()).padStart(2, '0');
    const mese = String(now.getMonth() + 1).padStart(2, '0');
    const anno = now.getFullYear();
    const ore = String(now.getHours()).padStart(2, '0');
    const minuti = String(now.getMinutes()).padStart(2, '0');
    const secondi = String(now.getSeconds()).padStart(2, '0');
    const millisecondi = String(now.getMilliseconds()).padStart(3, '0');

    const fileName = `photo-${giorno}-${mese}-${anno}-${ore}-${minuti}-${secondi}-${millisecondi}.jpg`;
    const filePath = path.join(__dirname, 'uploads', fileName);

    fs.writeFile(filePath, req.body, (err) => {
        if (err) {
            console.error('Errore durante il salvataggio:', err);
            return res.status(500).send('Errore del server');
        }
        console.log(`Immagine salvata con successo: ${fileName} (${req.body.length} bytes)`);
        res.status(200).send('Foto ricevuta!');
    });
});

// --- NUOVA ROTTA: SALVATAGGIO DATI DHT11 SU CSV ---
app.post('/api/dht', (req, res) => {
    const { temperature, humidity } = req.body;

    if (temperature === undefined || humidity === undefined) {
        return res.status(400).send('Dati mancanti (temperature, humidity)');
    }

    const now = new Date();
    // Formato: YYYY-MM-DD HH:mm:ss
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const csvLine = `${timestamp},${temperature},${humidity}\n`;
    
    const csvPath = path.join(__dirname, 'dht_data.csv');
    
    // Se il file non esiste, crealo con l'intestazione
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, 'timestamp,temperature,humidity\n');
    }

    fs.appendFile(csvPath, csvLine, (err) => {
        if (err) {
            console.error('Errore scrittura CSV:', err);
            return res.status(500).send('Errore interno del server');
        }
        console.log(`[DHT11] Dati salvati: ${temperature}°C, ${humidity}%`);
        res.status(200).send('Dati salvati correttamente');
    });
});

// --- NUOVA ROTTA FRONTEND: ELENCO FOTO (CON PAGINAZIONE) ---
app.get('/api/photos', (req, res) => {
    const dirPath = path.join(__dirname, 'uploads');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0; // 0 = nessuna limitazione
    
    fs.readdir(dirPath, (err, files) => {
        if (err) return res.status(500).send('Errore lettura cartella');
        
        // Filtra solo i jpg, calcola la dimensione totale e ordina
        let totalSize = 0;
        const allPhotos = files
            .filter(file => file.endsWith('.jpg'))
            .map(file => {
                const stats = fs.statSync(path.join(dirPath, file));
                totalSize += stats.size;
                return {
                    name: file,
                    time: stats.mtime.getTime()
                };
            })
            .sort((a, b) => b.time - a.time)
            .map(f => f.name);

        let paginatedPhotos = allPhotos;
        if (limit > 0) {
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            paginatedPhotos = allPhotos.slice(startIndex, endIndex);
        }

        res.json({ 
            photos: paginatedPhotos, 
            totalSizeBytes: totalSize,
            totalPhotosCount: allPhotos.length,
            page: page,
            limit: limit
        });
    });
});

// --- NUOVA ROTTA: ULTIMO DATO DHT11 ---
app.get('/api/dht/latest', (req, res) => {
    const csvPath = path.join(__dirname, 'dht_data.csv');
    
    if (!fs.existsSync(csvPath)) {
        return res.json({ temperature: null, humidity: null, timestamp: null });
    }

    fs.readFile(csvPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Errore lettura file CSV');

        const lines = data.trim().split('\n');
        if (lines.length <= 1) {
            return res.json({ temperature: null, humidity: null, timestamp: null });
        }

        const lastLine = lines[lines.length - 1];
        const parts = lastLine.split(',');
        
        if (parts.length >= 3) {
            res.json({
                timestamp: parts[0],
                temperature: parseFloat(parts[1]),
                humidity: parseFloat(parts[2])
            });
        } else {
            res.json({ temperature: null, humidity: null, timestamp: null });
        }
    });
});

// --- ROTTA FRONTEND: ELIMINA UNA FOTO ---
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Sicurezza: impedisce path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).send('Nome file non valido');
    }
    
    const filePath = path.join(__dirname, 'uploads', filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Foto non trovata');
    }
    
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('Errore eliminazione:', err);
            return res.status(500).send('Errore del server');
        }
        console.log(`Foto eliminata: ${filename}`);
        res.status(200).send('Foto eliminata');
    });
});

// Crea le cartelle se non esistono
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
if (!fs.existsSync(path.join(__dirname, 'public'))) fs.mkdirSync(path.join(__dirname, 'public'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
