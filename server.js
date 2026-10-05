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

// --- NUOVA ROTTA FRONTEND: ELENCO FOTO ---
app.get('/api/photos', (req, res) => {
    const dirPath = path.join(__dirname, 'uploads');
    
    fs.readdir(dirPath, (err, files) => {
        if (err) return res.status(500).send('Errore lettura cartella');
        
        // Filtra solo i jpg, calcola la dimensione totale e ordina
        let totalSize = 0;
        const photos = files
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

        res.json({ photos: photos, totalSizeBytes: totalSize });
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
