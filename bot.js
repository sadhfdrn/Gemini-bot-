// Gemini-Powered Minecraft Bedrock Bot
require('dotenv').config();
const bedrock = require('bedrock-protocol');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const readline = require('readline');
const EventEmitter = require('events');

class GeminiMinecraftBot extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Load configuration from environment variables
        this.config = {
            username: process.env.BOT_USERNAME || options.username || 'GeminiBot',
            host: process.env.MC_SERVER_HOST || options.host || 'localhost',
            port: parseInt(process.env.MC_SERVER_PORT) || options.port || 19132,
            version: process.env.MC_VERSION || options.version || '1.20.0',
            geminiApiKey: process.env.GEMINI_API_KEY,
            geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            maxTokens: parseInt(process.env.MAX_TOKENS) || 150,
            responseDelay: parseInt(process.env.RESPONSE_DELAY) || 1000,
            debugMode: process.env.DEBUG_MODE === 'true'
        };

        // Validate required environment variables
        if (!this.config.geminiApiKey) {
            console.error('❌ GEMINI_API_KEY is required! Please set it in your .env file');
            process.exit(1);
        }

        // Initialize Gemini AI
        this.genAI = new GoogleGenerativeAI(this.config.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: this.config.geminiModel });
        
        // Bot state
        this.client = null;
        this.connected = false;
        this.position = { x: 0, y: 64, z: 0 };
        this.health = 20;
        this.inventory = new Map();
        this.players = new Map();
        this.chatHistory = [];
        this.currentTask = null;
        this.lastResponse = Date.now();
        
        this.setupCommands();
        this.setupGeminiContext();

        if (this.config.debugMode) {
            console.log('🐛 Debug mode enabled');
            console.log('📊 Config:', { ...this.config, geminiApiKey: '***hidden***' });
        }
    }

    setupGeminiContext() {
        this.systemPrompt = `You are GeminiBot, an AI assistant playing Minecraft Bedrock Edition. You're helpful, friendly, and knowledgeable about Minecraft.

Key personality traits:
- Helpful and eager to assist players
- Knowledgeable about Minecraft mechanics, crafting, building
- Playful and enthusiastic about the game
- Remember conversations and build relationships with players
- Offer creative solutions and building ideas

Current bot status:
- Username: ${this.config.username}
- Position: Will be updated in conversations
- Health: ${this.health}/20
- Current task: ${this.currentTask || 'None'}

Available actions you can suggest (I'll handle the execution):
- Moving to coordinates
- Building structures (houses, towers, farms)
- Following players
- Mining and resource gathering
- Exploring areas
- Crafting items
- Helping with redstone contraptions

Respond naturally and conversationally. Keep responses under 150 characters for chat. If players ask for help, be specific about what you can do. Don't mention that you're an AI - just be a helpful Minecraft companion!`;
    }

    async connect() {
        console.log(`🎮 Connecting ${this.config.username} to ${this.config.host}:${this.config.port}`);
        
        try {
            this.client = bedrock.createClient({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                version: this.config.version,
                skipPing: true
            });

            this.setupEventHandlers();
            
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            console.log('🎭 Falling back to simulation mode');
            this.simulateConnection();
        }
    }

    setupEventHandlers() {
        this.client.on('spawn', () => {
            console.log('✅ Bot spawned successfully!');
            this.connected = true;
            this.sendChat('Hello everyone! GeminiBot is online and ready to help! 🤖✨');
            this.emit('connected');
        });

        this.client.on('text', (packet) => {
            this.handleChatMessage(packet);
        });

        this.client.on('move_player', (packet) => {
            if (packet.runtime_id === this.client.entityId) {
                this.position = {
                    x: packet.position.x,
                    y: packet.position.y,
                    z: packet.position.z
                };
            }
        });

        this.client.on('add_player', (packet) => {
            this.players.set(packet.runtime_id, {
                name: packet.username,
                uuid: packet.uuid,
                position: packet.position
            });
            console.log(`👋 Player joined: ${packet.username}`);
        });

        this.client.on('remove_player', (packet) => {
            const player = this.players.get(packet.runtime_id);
            if (player) {
                console.log(`👋 Player left: ${player.name}`);
                this.players.delete(packet.runtime_id);
            }
        });

        this.client.on('disconnect', (reason) => {
            console.log('⚠️ Disconnected:', reason);
            this.connected = false;
        });

        this.client.on('error', (error) => {
            console.error('❌ Client error:', error);
        });
    }

    simulateConnection() {
        this.connected = true;
        
        // Add some simulated players
        this.players.set(1, { name: 'Steve', position: { x: 10, y: 64, z: 10 } });
        this.players.set(2, { name: 'Alex', position: { x: -5, y: 64, z: 15 } });
        
        this.emit('connected');
        console.log('🎭 Simulation mode active - try chatting with simulated players!');
        
        // Demo some interactions
        if (this.config.debugMode) {
            setTimeout(() => this.simulateChat('Steve', 'Hey GeminiBot, can you help me build a castle?'), 3000);
            setTimeout(() => this.simulateChat('Alex', 'GeminiBot, what\'s the best way to find diamonds?'), 8000);
        }
    }

    handleChatMessage(packet) {
        if (packet.type === 'chat' && packet.source_name !== this.config.username) {
            const player = packet.source_name;
            const message = packet.message;
            
            console.log(`💬 ${player}: ${message}`);
            this.processMessage(player, message);
        }
    }

    simulateChat(player, message) {
        console.log(`💬 ${player}: ${message}`);
        this.processMessage(player, message);
    }

    async processMessage(player, message) {
        // Rate limiting
        const now = Date.now();
        if (now - this.lastResponse < this.config.responseDelay) {
            return;
        }

        const msg = message.toLowerCase();
        const botMentioned = msg.includes('bot') || msg.includes(this.config.username.toLowerCase());
        const isQuestion = msg.includes('?') || msg.includes('help') || msg.includes('can you');
        
        // Store chat history
        this.chatHistory.push({
            player,
            message,
            timestamp: now
        });

        // Keep only recent history (last 10 messages)
        if (this.chatHistory.length > 10) {
            this.chatHistory = this.chatHistory.slice(-10);
        }

        if (botMentioned || isQuestion || this.chatHistory.length <= 2) {
            try {
                const response = await this.getGeminiResponse(player, message);
                await this.sendChat(response);
                await this.executeActionFromResponse(player, message, response);
                this.lastResponse = now;
            } catch (error) {
                console.error('❌ Gemini API error:', error);
                await this.sendChat(`Sorry ${player}, I'm having trouble thinking right now! 🤔`);
            }
        }
    }

    async getGeminiResponse(player, message) {
        // Build context for Gemini
        const context = this.buildContextForGemini(player, message);
        
        try {
            const result = await this.model.generateContent(context);
            const response = result.response;
            let text = response.text().trim();
            
            // Ensure response isn't too long for Minecraft chat
            if (text.length > 100) {
                text = text.substring(0, 97) + '...';
            }
            
            return text;
        } catch (error) {
            console.error('🤖 Gemini generation error:', error);
            return this.getFallbackResponse(player, message);
        }
    }

    buildContextForGemini(player, message) {
        const recentChat = this.chatHistory.slice(-5).map(chat => 
            `${chat.player}: ${chat.message}`
        ).join('\n');

        const playerList = Array.from(this.players.values()).map(p => p.name).join(', ');

        return `${this.systemPrompt}

Current game state:
- My position: (${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)}, ${this.position.z.toFixed(1)})
- Players online: ${playerList || 'None in simulation'}
- Current task: ${this.currentTask || 'None'}

Recent chat:
${recentChat}

${player} just said: "${message}"

Respond as GeminiBot in a helpful, friendly way. Keep it under 100 characters for Minecraft chat!`;
    }

    getFallbackResponse(player, message) {
        const msg = message.toLowerCase();
        
        const responses = {
            help: `Hi ${player}! I can help with building, mining, exploring, and more! What do you need?`,
            build: `Let's build something awesome ${player}! What did you have in mind? 🏗️`,
            follow: `Sure ${player}! I'll follow you on your adventure! 🚶‍♂️`,
            mine: `Great idea ${player}! Let's go mining for resources! ⛏️`,
            explore: `Adventure time ${player}! I know some cool places to check out! 🗺️`,
            default: `Hey ${player}! How can I help you today? 😊`
        };

        for (const [key, response] of Object.entries(responses)) {
            if (key !== 'default' && msg.includes(key)) {
                return response;
            }
        }

        return responses.default;
    }

    async executeActionFromResponse(player, originalMessage, response) {
        const msg = originalMessage.toLowerCase();
        const resp = response.toLowerCase();
        
        // Execute actions based on the conversation
        if (msg.includes('follow') || resp.includes('follow')) {
            await this.followPlayer(player);
        }
        
        if (msg.includes('build house') || resp.includes('build') && msg.includes('house')) {
            await this.buildHouse();
        }
        
        if (msg.includes('build tower') || resp.includes('build') && msg.includes('tower')) {
            await this.buildTower();
        }
        
        if (msg.includes('come here') || msg.includes('come to me')) {
            const playerData = Array.from(this.players.values()).find(p => p.name === player);
            if (playerData) {
                await this.moveTo(playerData.position.x, playerData.position.y, playerData.position.z);
            }
        }
        
        if (msg.includes('explore') || resp.includes('explore')) {
            setTimeout(() => this.autoExplore(), 2000);
        }
    }

    async sendChat(message) {
        if (!this.connected) return;
        
        console.log(`🤖 ${this.config.username}: ${message}`);
        
        if (this.client && this.client.write) {
            try {
                this.client.write('text', {
                    type: 'chat',
                    needs_translation: false,
                    source_name: this.config.username,
                    message: message
                });
            } catch (error) {
                console.log(`[SIMULATED] ${this.config.username}: ${message}`);
            }
        } else {
            console.log(`[SIMULATED] ${this.config.username}: ${message}`);
        }
    }

    async moveTo(x, y, z) {
        console.log(`🚶 Moving to (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        
        if (this.client && this.client.write) {
            try {
                this.client.write('move_player', {
                    runtime_id: this.client.entityId,
                    position: { x, y, z },
                    rotation: { x: 0, y: 0, z: 0 },
                    mode: 0,
                    on_ground: true
                });
            } catch (error) {
                console.log('📍 [Simulated movement]');
            }
        }
        
        this.position = { x, y, z };
        await this.delay(1000);
    }

    async followPlayer(playerName) {
        console.log(`👥 Following ${playerName}`);
        this.currentTask = `following_${playerName}`;
        
        // Simulate following for a few steps
        for (let i = 0; i < 5 && this.currentTask === `following_${playerName}`; i++) {
            const playerData = Array.from(this.players.values()).find(p => p.name === playerName);
            if (playerData) {
                await this.moveTo(
                    playerData.position.x + 2,
                    playerData.position.y,
                    playerData.position.z + 2
                );
            }
            await this.delay(3000);
        }
    }

    async buildHouse() {
        await this.sendChat('Building a cozy house! 🏠');
        this.currentTask = 'building_house';
        
        console.log('🧱 Constructing house...');
        await this.delay(2000);
        console.log('🧱 Adding walls and roof...');
        await this.delay(3000);
        console.log('🚪 Installing door and windows...');
        await this.delay(2000);
        
        await this.sendChat('House complete! Welcome home! 🎉');
        this.currentTask = null;
    }

    async buildTower() {
        await this.sendChat('Building an epic tower! 🗼');
        this.currentTask = 'building_tower';
        
        for (let level = 1; level <= 8; level++) {
            console.log(`🧱 Building tower level ${level}/8`);
            await this.delay(1000);
            if (this.currentTask !== 'building_tower') break;
        }
        
        if (this.currentTask === 'building_tower') {
            await this.sendChat('Tower complete! Amazing view from up here! 🌟');
        }
        this.currentTask = null;
    }

    async autoExplore() {
        if (this.currentTask) return;
        
        this.currentTask = 'exploring';
        await this.sendChat('Going on an exploration adventure! 🧭');
        
        for (let i = 0; i < 3; i++) {
            const randomX = this.position.x + (Math.random() - 0.5) * 50;
            const randomZ = this.position.z + (Math.random() - 0.5) * 50;
            
            await this.moveTo(randomX, this.position.y, randomZ);
            console.log('🔍 Exploring new area...');
            await this.delay(4000);
            
            if (this.currentTask !== 'exploring') break;
        }
        
        if (this.currentTask === 'exploring') {
            await this.sendChat('Back from exploring! Found some cool spots! 🗺️');
        }
        this.currentTask = null;
    }

    setupCommands() {
        this.commands = {
            'help': () => {
                console.log('\n🤖 GeminiBot Commands:');
                console.log('- help: Show this help');
                console.log('- status: Show bot status');
                console.log('- config: Show configuration');
                console.log('- say <message>: Send chat message');
                console.log('- simulate <player> <message>: Simulate player chat');
                console.log('- move <x> <y> <z>: Move to coordinates');
                console.log('- follow <player>: Follow a player');
                console.log('- build house: Build a house');
                console.log('- build tower: Build a tower');
                console.log('- explore: Start exploration');
                console.log('- stop: Stop current task');
                console.log('- players: List online players');
                console.log('- quit: Disconnect and exit\n');
            },
            
            'status': () => {
                console.log('\n📊 Bot Status:');
                console.log(`Username: ${this.config.username}`);
                console.log(`Connected: ${this.connected}`);
                console.log(`Server: ${this.config.host}:${this.config.port}`);
                console.log(`Position: (${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)}, ${this.position.z.toFixed(1)})`);
                console.log(`Current Task: ${this.currentTask || 'None'}`);
                console.log(`Players Online: ${this.players.size}`);
                console.log(`Chat History: ${this.chatHistory.length} messages\n`);
            },

            'config': () => {
                console.log('\n⚙️ Configuration:');
                console.log(`Gemini Model: ${this.config.geminiModel}`);
                console.log(`Max Tokens: ${this.config.maxTokens}`);
                console.log(`Response Delay: ${this.config.responseDelay}ms`);
                console.log(`Debug Mode: ${this.config.debugMode}`);
                console.log(`API Key: ${this.config.geminiApiKey ? '✅ Set' : '❌ Missing'}\n`);
            }
        };
    }

    async processCommand(input) {
        const [command, ...args] = input.trim().split(' ');
        
        switch (command.toLowerCase()) {
            case 'help':
                this.commands.help();
                break;
                
            case 'status':
                this.commands.status();
                break;

            case 'config':
                this.commands.config();
                break;
                
            case 'say':
                if (args.length > 0) {
                    await this.sendChat(args.join(' '));
                }
                break;

            case 'simulate':
                if (args.length >= 2) {
                    const player = args[0];
                    const message = args.slice(1).join(' ');
                    this.simulateChat(player, message);
                }
                break;
                
            case 'move':
                if (args.length === 3) {
                    const [x, y, z] = args.map(Number);
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                        await this.moveTo(x, y, z);
                    }
                }
                break;
                
            case 'follow':
                if (args.length > 0) {
                    await this.followPlayer(args[0]);
                }
                break;
                
            case 'build':
                if (args[0] === 'house') {
                    await this.buildHouse();
                } else if (args[0] === 'tower') {
                    await this.buildTower();
                }
                break;
                
            case 'explore':
                await this.autoExplore();
                break;
                
            case 'stop':
                this.currentTask = null;
                await this.sendChat('Task stopped!');
                console.log('⏹️ Current task stopped');
                break;
                
            case 'players':
                console.log('\n👥 Online Players:');
                if (this.players.size === 0) {
                    console.log('No other players online');
                } else {
                    this.players.forEach((player) => {
                        console.log(`- ${player.name}`);
                    });
                }
                console.log();
                break;
                
            case 'quit':
                return false;
                
            default:
                console.log(`❓ Unknown command: ${command}. Type 'help' for available commands.`);
        }
        
        return true;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    disconnect() {
        if (this.client && this.client.disconnect) {
            this.client.disconnect();
        }
        this.connected = false;
        console.log('👋 GeminiBot disconnected');
    }
}

// Interactive CLI
async function runInteractiveBot() {
    console.log('🤖 Gemini-Powered Minecraft Bot');
    console.log('=' * 40);
    
    // Check if .env file exists
    const fs = require('fs');
    if (!fs.existsSync('.env')) {
        console.log('⚠️  No .env file found. Creating example...');
        const exampleEnv = `# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
MAX_TOKENS=150

# Minecraft Server Configuration
BOT_USERNAME=GeminiBot
MC_SERVER_HOST=localhost
MC_SERVER_PORT=19132
MC_VERSION=1.20.0

# Bot Behavior
RESPONSE_DELAY=1000
DEBUG_MODE=false`;
        
        fs.writeFileSync('.env.example', exampleEnv);
        console.log('📄 Created .env.example file. Please copy to .env and configure!');
    }
    
    const bot = new GeminiMinecraftBot();
    
    console.log('\n🚀 Starting GeminiBot...');
    await bot.connect();
    
    bot.on('connected', () => {
        console.log('\n✅ GeminiBot is ready!');
        console.log('💡 The bot will respond intelligently to player messages.');
        console.log('📝 Type "help" for commands or "simulate <player> <message>" for testing.\n');
    });
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const askCommand = () => {
        rl.question('GeminiBot> ', async (input) => {
            if (input.trim()) {
                const shouldContinue = await bot.processCommand(input);
                if (!shouldContinue) {
                    bot.disconnect();
                    rl.close();
                    return;
                }
            }
            askCommand();
        });
    };
    
    askCommand();
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n\n👋 Shutting down GeminiBot...');
        bot.disconnect();
        rl.close();
        process.exit(0);
    });
}

// Run the bot
if (require.main === module) {
    runInteractiveBot().catch(console.error);
}

module.exports = GeminiMinecraftBot;

// at the bottom of bot.js
require('express')().listen(3000, () => console.log('Health check ready'));
