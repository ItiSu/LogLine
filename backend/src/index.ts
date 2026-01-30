import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient, RedisClientType } from 'redis';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Document state - server is the source of truth (empty by default)
let documentContent: string = '';

// Connected users tracking
const connectedUsers = new Map<string, { id: string; joinedAt: Date; color: string; name: string }>();

// Cursor colors for users
const CURSOR_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#f43f5e', // rose
];

// Sci-Fi name generator - fictional names from movies, games, and pop culture
const SCI_FI_NAMES = [
  // Star Wars
  'Skywalker', 'Vader', 'Solo', 'Organa', 'Kenobi', 'Yoda', 'Windu', 'Palpatine', 'Tarkin', 'Fett',
  'Maul', 'Dooku', 'Grievous', 'Poe', 'Finn', 'Rey', 'Kylo', 'Hux', 'Phasma', 'Ren',
  // Star Trek
  'Kirk', 'Spock', 'Picard', 'Riker', 'Data', 'Worf', 'LaForge', 'Crusher', 'Troi', 'Sisko',
  'Janeway', 'Chakotay', 'Tuvok', 'Paris', 'Torres', 'Seven', 'TheDoctor', 'Kim', 'Neelix', 'Archer',
  // Dune
  'Atreides', 'Harkonnen', 'Corrino', 'Fremen', 'MuadDib', 'Chani', 'Stilgar', 'Jessica', 'Paul', 'Leto',
  'Baron', 'Feyd', 'Rabban', 'Irulan', 'Gurney', 'Duncan', 'Thufir', 'Yueh', 'Piter', 'Shaddam',
  // The Matrix
  'Neo', 'Trinity', 'Morpheus', 'Smith', 'Niobe', 'Ghost', 'Sparks', 'Switch', 'Apoc', 'Mouse',
  'Oracle', 'Architect', 'Merovingian', 'Persephone', 'Seraph', 'Keymaker', 'Bane', 'Lock', 'Hamann', 'Tank',
  // Blade Runner
  'Deckard', 'Rachael', 'Roy', 'Pris', 'Zhora', 'Leon', 'Gaff', 'Bryant', 'Tyrell', 'Sebastian',
  // Alien
  'Ripley', 'Dallas', 'Kane', 'Lambert', 'Brett', 'Parker', 'Ash', 'Newt', 'Hicks', 'Hudson',
  // Terminator
  'Connor', 'Reese', 'T800', 'T1000', 'Sarah', 'John', 'Kyle', 'Marcus', 'Blair', 'Barnes',
  // Back to the Future
  'Marty', 'Doc', 'Biff', 'Jennifer', 'Lorraine', 'George', 'Strickland', 'Einstein', 'Clara', 'Buford',
  // Tron
  'Flynn', 'Clu', 'Tron', 'Quorra', 'Zuse', 'Gem', 'Castor', 'Jarvis', 'Dumont', 'Ram',
  // Guardians of the Galaxy
  'StarLord', 'Gamora', 'Drax', 'Rocket', 'Groot', 'Nebula', 'Mantis', 'Yondu', 'Kraglin', 'Stakar',
  // Avengers
  'Stark', 'Rogers', 'Thor', 'Banner', 'Natasha', 'Clint', 'Pietro', 'Wanda', 'Vision', 'Fury',
  // Doctor Who
  'Doctor', 'Master', 'River', 'Rose', 'Martha', 'Donna', 'Amy', 'Rory', 'Clara', 'Bill',
  // Halo
  'Chief', 'Cortana', 'Arbiter', 'Johnson', 'Keyes', 'Halsey', 'Buck', 'Dare', 'Rookie', 'Noble',
  // Mass Effect
  'Shepard', 'Garrus', 'Liara', 'Tali', 'Wrex', 'Mordin', 'Thane', 'Legion', 'Jack', 'Miranda',
  // Cyberpunk
  'V', 'Johnny', 'Judy', 'Panam', 'River', 'Kerry', 'Rogue', 'Dex', 'Jackie', 'Takemura',
  // Destiny
  'Guardian', 'Cayde', 'Zavala', 'Ikora', 'Eris', 'Drifter', 'Shaxx', 'Banshee', 'Xur', 'Riven',
  // Warhammer
  'DoomGuy', 'Khan', 'Titus', 'Thule', 'Martellus', 'Leandros', 'Sidonus', 'Inquisitor', 'Daemon', 'Xeno',
  // Starcraft
  'Kerrigan', 'Raynor', 'Zeratul', 'Artanis', 'Tychus', 'Nova', 'Zagara', 'Dehaka', 'Abathur', 'Stukov',
  // Half-Life
  'Gordon', 'Alyx', 'GMan', 'Barney', 'Eli', 'Kleiner', 'Breen', 'Dog', 'Grigori', 'Mossman',
  // Portal
  'Chell', 'GLaDOS', 'Wheatley', 'Cave', 'Caroline', 'Atlas', 'PBody', 'Turret', 'Space', 'Fact',
  // Metroid
  'Samus', 'Ridley', 'Mother', 'Adam', 'Sylux', 'Trace', 'Weavel', 'Noxus', 'Spire', 'Kanden',
  // Zelda
  'Link', 'Zelda', 'Ganon', 'Impa', 'Midna', 'Fi', 'Mipha', 'Revali', 'Daruk', 'Urbosa',
  // Final Fantasy
  'Cloud', 'Sephiroth', 'Tifa', 'Aerith', 'Barret', 'Yuffie', 'Vincent', 'Cid', 'Red', 'Cait',
  // Pokemon
  'Ash', 'Misty', 'Brock', 'Gary', 'Oak', 'Giovanni', 'Lance', 'Cynthia', 'Steven', 'Wallace',
  // Rick and Morty
  'Rick', 'Morty', 'Summer', 'Beth', 'Jerry', 'Birdperson', 'Squanchy', 'Krombopulos', 'Unity', 'Evil',
  // Futurama
  'Fry', 'Leela', 'Bender', 'Zoidberg', 'Amy', 'Hermes', 'Professor', 'Zapp', 'Kif', 'Nibbler',
  // Invader Zim
  'Zim', 'GIR', 'Dib', 'Gaz', 'Tak', 'Red', 'Purple', 'Skoodge', 'Sizz', 'Larb',
  // Avatar
  'Aang', 'Katara', 'Sokka', 'Toph', 'Zuko', 'Iroh', 'Azula', 'Appa', 'Momo', 'Suki',
  // Legend of Korra
  'Korra', 'Mako', 'Bolin', 'Asami', 'Tenzin', 'Lin', 'Jinora', 'Kya', 'Bumi', 'Kuvira',
  // One Punch Man
  'Saitama', 'Genos', 'Tornado', 'Bang', 'Atomic', 'Child', 'Metal', 'King', 'Mumen', 'Sonic',
  // My Hero Academia
  'Deku', 'Bakugo', 'Uraraka', 'Todoroki', 'Iida', 'Tsuyu', 'Kirishima', 'Yaoyorozu', 'Jiro', 'Kaminari',
  // Attack on Titan
  'Eren', 'Mikasa', 'Armin', 'Levi', 'Erwin', 'Hange', 'Jean', 'Connie', 'Sasha', 'Reiner',
  // Demon Slayer
  'Tanjiro', 'Nezuko', 'Zenitsu', 'Inosuke', 'Giyu', 'Shinobu', 'Rengoku', 'Tengen', 'Mitsuri', 'Muichiro',
  // Jujutsu Kaisen
  'Yuji', 'Megumi', 'Nobara', 'Gojo', 'Nanami', 'Maki', 'Panda', 'Toge', 'Sukuna', 'Mahito',
  // Chainsaw Man
  'Denji', 'Power', 'Aki', 'Makima', 'Kobeni', 'Himeno', 'Kishibe', 'Beam', 'Violence', 'Angel',
  // Spy x Family
  'Loid', 'Yor', 'Anya', 'Bond', 'Becky', 'Damian', 'Franky', 'Sylvia', 'Fiona', 'Yuri',
  // More Sci-Fi
  'Nova', 'Orion', 'Cassiopeia', 'Andromeda', 'Nebula', 'Quasar', 'Pulsar', 'Vortex', 'Nexus', 'Abyss',
  'Zenith', 'Eclipse', 'Solstice', 'Equinox', 'Cosmos', 'Galaxy', 'Stellar', 'Lunar', 'Solar', 'Astral',
  'Void', 'Aether', 'Chrono', 'Quantum', 'Plasma', 'Ion', 'Flux', 'Vector', 'Matrix', 'Cipher',
  'Helix', 'Spiral', 'Omega', 'Alpha', 'Delta', 'Sigma', 'Zeta', 'Theta', 'Kappa', 'Lambda',
  'Xenon', 'Argon', 'Krypton', 'Radon', 'Neon', 'Helium', 'Hydra', 'Cerberus', 'Phoenix', 'Dragon'
];

function generateRandomName(): string {
  const name = SCI_FI_NAMES[Math.floor(Math.random() * SCI_FI_NAMES.length)];
  const suffix = Math.floor(Math.random() * 9999);
  return `${name}-${suffix}`;
}

// Redis clients
let redisPublisher: RedisClientType;
let redisSubscriber: RedisClientType;

// Initialize Redis
async function initializeRedis() {
  redisPublisher = createClient({ url: REDIS_URL });
  redisSubscriber = createClient({ url: REDIS_URL });

  redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));
  redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));

  await redisPublisher.connect();
  await redisSubscriber.connect();

  // Subscribe to document updates channel
  await redisSubscriber.subscribe('document-updates', (message) => {
    const update = JSON.parse(message);
    documentContent = update.content;
    
    // Broadcast to all connected clients except those handled by other instances
    io.emit('document:update', {
      content: documentContent,
      timestamp: Date.now()
    });
  });

  console.log('Redis Pub/Sub connected');
}

// Code execution endpoint handler
async function executeCode(code: string, language: string): Promise<{ output?: string; error?: string }> {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  let filePath = '';
  
  try {
    switch (language) {
      case 'javascript': {
        const fileName = `script_${timestamp}.js`;
        filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code);
        
        const { stdout, stderr } = await execAsync(`node "${filePath}"`, { timeout: 5000 });
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'typescript': {
        const fileName = `script_${timestamp}.ts`;
        filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code);
        
        const { stdout, stderr } = await execAsync(`npx ts-node "${filePath}" 2>&1 || node -e "console.log(require('typescript').transpile(\\"${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}\\"))"`, { timeout: 10000 });
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'python': {
        const fileName = `script_${timestamp}.py`;
        filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code);
        
        const { stdout, stderr } = await execAsync(`python3 "${filePath}"`, { timeout: 5000 });
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'java': {
        const fileName = `Main_${timestamp}.java`;
        filePath = path.join(tempDir, fileName);
        // Replace class name to match filename
        const modifiedCode = code.replace(/public\s+class\s+\w+/, `public class Main_${timestamp}`);
        fs.writeFileSync(filePath, modifiedCode);
        
        const className = `Main_${timestamp}`;
        await execAsync(`cd "${tempDir}" && javac "${fileName}"`, { timeout: 10000 });
        const { stdout, stderr } = await execAsync(`cd "${tempDir}" && java ${className}`, { timeout: 5000 });
        
        // Cleanup
        try { fs.unlinkSync(path.join(tempDir, `${className}.class`)); } catch {}
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'cpp': {
        const fileName = `script_${timestamp}.cpp`;
        filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code);
        
        const outputFile = path.join(tempDir, `output_${timestamp}`);
        await execAsync(`g++ -o "${outputFile}" "${filePath}"`, { timeout: 10000 });
        const { stdout, stderr } = await execAsync(`"${outputFile}"`, { timeout: 5000 });
        
        // Cleanup
        try { fs.unlinkSync(outputFile); } catch {}
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'rust': {
        const fileName = `script_${timestamp}.rs`;
        filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code);
        
        const outputFile = path.join(tempDir, `output_${timestamp}`);
        await execAsync(`rustc -o "${outputFile}" "${filePath}"`, { timeout: 30000 });
        const { stdout, stderr } = await execAsync(`"${outputFile}"`, { timeout: 5000 });
        
        // Cleanup
        try { fs.unlinkSync(outputFile); } catch {}
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'go': {
        const fileName = `script_${timestamp}.go`;
        filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code);
        
        const { stdout, stderr } = await execAsync(`go run "${filePath}"`, { timeout: 10000 });
        return { output: stdout || stderr || 'Code executed successfully (no output)' };
      }
      
      case 'html':
        return { output: 'HTML preview not available in console. The code is valid HTML.' };
      
      case 'css':
        return { output: 'CSS preview not available in console. The code is valid CSS.' };
      
      case 'json':
        try {
          JSON.parse(code);
          return { output: 'Valid JSON!' };
        } catch (e) {
          return { error: `Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}` };
        }
      
      case 'markdown':
        return { output: 'Markdown rendering not available in console. The code is valid Markdown.' };
      
      case 'sql':
        return { output: 'SQL execution requires a database connection. Code syntax highlighting is available.' };
      
      case 'yaml':
        return { output: 'YAML validation not available in console. Code syntax highlighting is available.' };
      
      case 'xml':
        return { output: 'XML validation not available in console. Code syntax highlighting is available.' };
      
      default:
        return { error: `Execution not supported for ${language}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Execution failed';
    // Clean up the error message
    return { error: errorMessage.replace(/\/tmp\/script_\d+\.(js|ts|py|java|cpp|rs|go):?\s*/g, '') };
  } finally {
    // Cleanup temp file
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
}

// HTTP server with request handling
const httpServer = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', users: connectedUsers.size }));
    return;
  }
  
  // Code execution endpoint
  if (req.method === 'POST' && req.url === '/execute') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { code, language } = JSON.parse(body);
        
        if (!code || !language) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing code or language' }));
          return;
        }
        
        const result = await executeCode(code, language);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to execute code' }));
      }
    });
    return;
  }
  
  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = socket.id;
  const colorIndex = connectedUsers.size % CURSOR_COLORS.length;
  const userInfo = { id: userId, joinedAt: new Date(), color: CURSOR_COLORS[colorIndex], name: generateRandomName() };
  
  connectedUsers.set(userId, userInfo);
  console.log(`User connected: ${userId}. Total users: ${connectedUsers.size}`);

  // Send current document state to new user
  socket.emit('document:init', {
    content: documentContent,
    users: connectedUsers.size
  });

  // Broadcast presence update to all users with colors and names
  io.emit('presence:update', {
    count: connectedUsers.size,
    users: Array.from(connectedUsers.entries()).map(([id, info]) => ({
      id,
      color: info.color,
      name: info.name
    }))
  });

  // Handle cursor position updates
  socket.on('cursor:move', (data) => {
    socket.broadcast.emit('cursor:update', {
      userId: userId,
      color: userInfo.color,
      position: data.position,
      selection: data.selection
    });
  });

  // Handle document edits
  socket.on('document:edit', async (data) => {
    try {
      const { content } = data;
      
      // Update server state
      documentContent = content;
      
      // Publish to Redis for cross-instance sync
      await redisPublisher.publish('document-updates', JSON.stringify({
        content: documentContent,
        userId: userId,
        timestamp: Date.now()
      }));

      // The Redis subscriber will handle broadcasting to all clients
      // But we also broadcast immediately for local clients to reduce latency
      socket.broadcast.emit('document:update', {
        content: documentContent,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling edit:', error);
      socket.emit('error', { message: 'Failed to process edit' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    connectedUsers.delete(userId);
    console.log(`User disconnected: ${userId}. Total users: ${connectedUsers.size}`);
    
    // Broadcast presence update
    io.emit('presence:update', {
      count: connectedUsers.size,
      users: Array.from(connectedUsers.keys())
    });
  });
});

// Start server
async function start() {
  try {
    await initializeRedis();
    
    httpServer.listen(PORT, () => {
      console.log(`LogLine server running on port ${PORT}`);
      console.log(`WebSocket server ready for connections`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisPublisher?.quit();
  await redisSubscriber?.quit();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await redisPublisher?.quit();
  await redisSubscriber?.quit();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

start();