// Hot Reload Development Server
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const path = require('path');

const PORT = 35729;

// Start WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`🔥 Hot reload server running on ws://localhost:${PORT}`);

// Track connected clients
const clients = new Set();

wss.on('connection', ws => {
    clients.add(ws);
    console.log('📱 Extension connected');

    ws.on('close', () => {
        clients.delete(ws);
        console.log('📱 Extension disconnected');
    });
});

// Watch for file changes
const watcher = chokidar.watch(['manifest.json', 'background.js', 'popup/**/*', 'content/**/*'], {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    cwd: __dirname
});

// Debounce reload
let reloadTimeout = null;

function triggerReload(filePath) {
    if (reloadTimeout) {
        clearTimeout(reloadTimeout);
    }

    reloadTimeout = setTimeout(() => {
        console.log(`📝 Changed: ${filePath}`);
        console.log('🔄 Reloading extension...');

        clients.forEach(client => {
            if (client.readyState === 1) {
                // WebSocket.OPEN
                client.send('reload');
            }
        });
    }, 100);
}

watcher
    .on('change', triggerReload)
    .on('add', triggerReload)
    .on('ready', () => {
        console.log('👀 Watching for changes...');
        console.log('');
        console.log('Files watched:');
        console.log('  - manifest.json');
        console.log('  - background.js');
        console.log('  - popup/**/*');
        console.log('  - content/**/*');
        console.log('');
    });
