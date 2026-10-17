const fs = require('node:fs');
const crypto = require('node:crypto');
const source = fs.readFileSync('index.html', 'utf8');
const version = process.env.CF_PAGES_COMMIT_SHA || crypto.createHash('sha256').update(source + fs.readFileSync('stability.js', 'utf8') + fs.readFileSync('stability.css', 'utf8') + fs.readFileSync('project-actions.js', 'utf8') + fs.readFileSync('media-quality.js', 'utf8') + fs.readFileSync('image-models.js', 'utf8') + fs.readFileSync('image-models.css', 'utf8') + fs.readFileSync('video-models.js', 'utf8') + fs.readFileSync('video-models.css', 'utf8') + fs.readFileSync('topup.css', 'utf8') + fs.readFileSync('media-creation.js', 'utf8') + fs.readFileSync('media-creation.css', 'utf8')).digest('hex');
if (!/^[a-f0-9]{12,64}$/.test(version)) throw new Error('Invalid release identifier');
fs.writeFileSync('index.html', source.replaceAll('__ANIS_BUILD__', version));
fs.writeFileSync('release.json', JSON.stringify({ version }));
console.log('Built ANIS AI release', version.slice(0, 12));
