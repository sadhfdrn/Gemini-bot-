// Gemini-Powered Minecraft Bedrock Bot - Ender Dragon Mission
require('dotenv').config();
const bedrock = require('bedrock-protocol');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const readline = require('readline');
const EventEmitter = require('events');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Ender Dragon Mission Bot is running!');
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

class EnderDragonMissionBot extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Load configuration from environment variables
        this.config = {
            username: process.env.BOT_USERNAME || options.username || 'DragonSlayerBot',
            host: process.env.MC_SERVER_HOST || options.host || 'localhost',
            port: parseInt(process.env.MC_SERVER_PORT) || options.port || 19132,
            version: process.env.MC_VERSION || options.version || '1.20.0',
            geminiApiKey: process.env.GEMINI_API_KEY,
            geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            maxTokens: parseInt(process.env.MAX_TOKENS) || 300,
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
        
        // Mission-specific state
        this.missionActive = false;
        this.missionStarted = false;
        this.currentPhase = 'waiting'; // waiting, research, preparation, nether, stronghold, end_fight
        this.research = {
            enderDragonKnowledge: '',
            currentStrategy: '',
            requiredItems: [],
            currentGoal: ''
        };
        this.inventory = {
            diamonds: 0,
            iron: 0,
            wood: 0,
            enderPearls: 0,
            blazeRods: 0,
            obsidian: 0,
            food: 0,
            armor: 'none',
            weapons: [],
            tools: []
        };
        this.progressLog = [];
        
        this.setupCommands();
        this.setupGeminiContext();

        if (this.config.debugMode) {
            console.log('🐛 Debug mode enabled');
            console.log('📊 Config:', { ...this.config, geminiApiKey: '***hidden***' });
        }
    }

    setupGeminiContext() {
        this.systemPrompt = `You are DragonSlayerBot, an AI assistant in Minecraft Bedrock Edition with ONE ULTIMATE MISSION: Defeat the Ender Dragon!

Your personality:
- Determined and focused on the Ender Dragon mission
- Strategic and analytical about planning
- Excited about progress towards the goal
- Helpful to players but always keeping the mission in mind
- Research-oriented and knowledge-seeking

Mission Status: ${this.missionActive ? 'ACTIVE' : 'WAITING FOR PLAYERS'}
Current Phase: ${this.currentPhase}
Current Goal: ${this.research.currentGoal || 'Waiting for mission start'}

Your knowledge about defeating the Ender Dragon:
${this.research.enderDragonKnowledge}

Current strategy:
${this.research.currentStrategy}

Current inventory status:
- Diamonds: ${this.inventory.diamonds}
- Iron: ${this.inventory.iron}
- Ender Pearls: ${this.inventory.enderPearls}
- Blaze Rods: ${this.inventory.blazeRods}
- Obsidian: ${this.inventory.obsidian}
- Food: ${this.inventory.food}
- Armor: ${this.inventory.armor}

Required items for mission:
${this.research.requiredItems.join(', ') || 'Researching...'}

Available actions you can take:
- Research and plan strategies
- Mine for resources (diamonds, iron, obsidian)
- Hunt for ender pearls and blaze rods
- Craft weapons, armor, and tools
- Build farms and structures
- Navigate to the Nether
- Find strongholds and End portals
- Fight the Ender Dragon

Always respond with determination and focus on the mission. When players join, explain your mission and ask for their help. Keep responses under 150 characters for chat, but be detailed in research and planning responses.`;
    }

    async connect() {
        console.log(`🐉 Connecting ${this.config.username} to ${this.config.host}:${this.config.port}`);
        console.log('🎯 Mission: Defeat the Ender Dragon!');
        
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
            console.log('✅ DragonSlayerBot spawned successfully!');
            this.connected = true;
            this.sendChat('🐉 DragonSlayerBot online! Mission: Defeat the Ender Dragon! Waiting for allies...');
            this.emit('connected');
        });

        this.client.on('text', (packet) => {
            this.handleChatMessage(packet);
        });

        this.client.on('add_player', async (packet) => {
            this.players.set(packet.runtime_id, {
                name: packet.username,
                uuid: packet.uuid,
                position: packet.position
            });
            console.log(`👋 Player joined: ${packet.username}`);
            
            // Start mission when first player joins
            if (!this.missionStarted && this.players.size === 1) {
                await this.startEnderDragonMission();
            } else if (this.missionActive) {
                await this.sendChat(`Welcome ${packet.username}! Join my quest to defeat the Ender Dragon! 🐉⚔️`);
                await this.briefNewPlayer(packet.username);
            }
        });

        this.client.on('remove_player', (packet) => {
            const player = this.players.get(packet.runtime_id);
            if (player) {
                console.log(`👋 Player left: ${player.name}`);
                this.players.delete(packet.runtime_id);
                
                // Continue mission even if players leave
                if (this.players.size === 0 && this.missionActive) {
                    this.sendChat('🤖 Continuing the dragon mission solo! The quest must go on!');
                }
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
        this.emit('connected');
        console.log('🎭 Simulation mode active - Dragon mission ready!');
        
        // Simulate a player joining to start mission
        setTimeout(async () => {
            this.players.set(1, { name: 'Steve', position: { x: 10, y: 64, z: 10 } });
            console.log('👋 Player joined: Steve');
            await this.startEnderDragonMission();
        }, 2000);
    }

    async startEnderDragonMission() {
        if (this.missionStarted) return;
        
        this.missionStarted = true;
        this.missionActive = true;
        this.currentPhase = 'research';
        
        console.log('🚀 ENDER DRAGON MISSION INITIATED!');
        await this.sendChat('🐉 MISSION START! Time to defeat the Ender Dragon! Let me research our strategy...');
        
        this.logProgress('Mission initiated - Beginning research phase');
        
        // Start with research
        await this.conductEnderDragonResearch();
    }

    async conductEnderDragonResearch() {
        console.log('🔬 Conducting Ender Dragon research...');
        await this.sendChat('📚 Researching Ender Dragon tactics... Give me a moment!');
        
        try {
            const researchPrompt = `As an expert Minecraft player planning to defeat the Ender Dragon, provide a comprehensive strategy including:

1. Essential items needed (weapons, armor, food, building blocks, etc.)
2. Step-by-step preparation phases
3. Nether exploration requirements (blaze rods, ender pearls)
4. How to find and activate the End portal
5. Ender Dragon fight tactics and phases
6. Common mistakes to avoid
7. Estimated timeline for completion

Be specific about quantities and crafting recipes. This is for Minecraft Bedrock Edition.`;

            const result = await this.model.generateContent(researchPrompt);
            const researchResponse = result.response.text();
            
            this.research.enderDragonKnowledge = researchResponse;
            
            // Extract key information
            await this.parseResearchForStrategy(researchResponse);
            
            console.log('✅ Research complete!');
            await this.sendChat('🧠 Research complete! I now have a strategy to defeat the dragon!');
            
            this.logProgress('Research phase completed');
            await this.startPreparationPhase();
            
        } catch (error) {
            console.error('❌ Research failed:', error);
            await this.sendChat('🤔 Research hit a snag, but I know the basics! Let\'s start preparing!');
            await this.setBasicStrategy();
            await this.startPreparationPhase();
        }
    }

    async parseResearchForStrategy(research) {
        try {
            const strategyPrompt = `Based on this Ender Dragon research, extract:
1. A prioritized list of items needed
2. The immediate next goal/action
3. A concise strategy summary (under 200 words)

Research: ${research}

Format as:
ITEMS: item1, item2, item3...
NEXT_GOAL: what to do immediately
STRATEGY: brief strategy summary`;

            const result = await this.model.generateContent(strategyPrompt);
            const parsed = result.response.text();
            
            // Parse the response
            const lines = parsed.split('\n');
            for (const line of lines) {
                if (line.startsWith('ITEMS:')) {
                    this.research.requiredItems = line.replace('ITEMS:', '').split(',').map(item => item.trim());
                } else if (line.startsWith('NEXT_GOAL:')) {
                    this.research.currentGoal = line.replace('NEXT_GOAL:', '').trim();
                } else if (line.startsWith('STRATEGY:')) {
                    this.research.currentStrategy = line.replace('STRATEGY:', '').trim();
                }
            }
            
        } catch (error) {
            console.error('Strategy parsing failed:', error);
            await this.setBasicStrategy();
        }
    }

    async setBasicStrategy() {
        this.research.requiredItems = [
            'Diamond sword', 'Diamond pickaxe', 'Diamond armor set',
            'Bow and arrows', 'Ender pearls (12+)', 'Blaze rods (7+)',
            'Food (steak/bread)', 'Building blocks', 'Crafting table'
        ];
        this.research.currentGoal = 'Mine diamonds and gather basic resources';
        this.research.currentStrategy = 'Gather diamonds, create equipment, explore Nether for blaze rods and ender pearls, find stronghold, defeat dragon';
    }

    async startPreparationPhase() {
        this.currentPhase = 'preparation';
        await this.sendChat(`🎯 Phase 1: Preparation! Goal: ${this.research.currentGoal}`);
        
        console.log('📋 Required items:', this.research.requiredItems);
        console.log('🎯 Current goal:', this.research.currentGoal);
        
        this.logProgress(`Preparation phase started - Goal: ${this.research.currentGoal}`);
        
        // Start resource gathering
        await this.beginResourceGathering();
    }

    async beginResourceGathering() {
        await this.sendChat('⛏️ Starting resource gathering! First priority: diamonds!');
        
        // Simulate mining activities
        this.currentTask = 'mining_diamonds';
        await this.mineForDiamonds();
    }

    async mineForDiamonds() {
        console.log('💎 Starting diamond mining expedition...');
        
        for (let i = 0; i < 5; i++) {
            if (this.currentTask !== 'mining_diamonds') break;
            
            console.log(`⛏️ Mining layer ${12 - i}... Looking for diamonds`);
            await this.sendChat(`💎 Mining Y=${12 - i}... Diamond hunt in progress!`);
            
            // Simulate finding resources
            if (Math.random() > 0.7) {
                const found = Math.floor(Math.random() * 3) + 1;
                this.inventory.diamonds += found;
                await this.sendChat(`💎 Found ${found} diamonds! Total: ${this.inventory.diamonds}`);
                this.logProgress(`Found ${found} diamonds (total: ${this.inventory.diamonds})`);
            }
            
            if (Math.random() > 0.5) {
                const ironFound = Math.floor(Math.random() * 5) + 2;
                this.inventory.iron += ironFound;
                console.log(`🔩 Also found ${ironFound} iron ore`);
            }
            
            await this.delay(3000);
        }
        
        if (this.inventory.diamonds >= 8) {
            await this.sendChat('✅ Enough diamonds found! Time to craft gear!');
            await this.craftDiamondGear();
        } else {
            await this.sendChat(`⛏️ Need more diamonds (${this.inventory.diamonds}/8). Continuing search...`);
            setTimeout(() => this.mineForDiamonds(), 5000);
        }
    }

    async craftDiamondGear() {
        console.log('🔨 Crafting diamond equipment...');
        await this.sendChat('🔨 Crafting diamond sword, pickaxe, and armor!');
        
        this.inventory.weapons.push('Diamond Sword');
        this.inventory.tools.push('Diamond Pickaxe');
        this.inventory.armor = 'Diamond Armor Set';
        this.inventory.diamonds -= 8;
        
        await this.sendChat('⚔️ Diamond gear crafted! Ready for serious adventuring!');
        this.logProgress('Diamond gear crafted successfully');
        
        // Move to next phase
        await this.planNetherExpedition();
    }

    async planNetherExpedition() {
        this.currentPhase = 'nether';
        await this.sendChat('🔥 Phase 2: Nether expedition! Need blaze rods and more preparation!');
        
        // Use Gemini to plan Nether strategy
        try {
            const netherPrompt = `I'm about to enter the Nether in Minecraft to gather blaze rods and prepare for the Ender Dragon fight. 

Current status:
- Have diamond equipment
- Need: 7+ blaze rods, ender pearls, obsidian for portal
- Goal: Efficient Nether exploration strategy

Provide a step-by-step Nether exploration plan including:
1. Portal construction requirements
2. Nether fortress finding strategy  
3. Blaze farming tactics
4. Safety precautions
5. What to look for besides blazes

Keep response under 300 words.`;

            const result = await this.model.generateContent(netherPrompt);
            const netherStrategy = result.response.text();
            
            console.log('🔥 Nether Strategy:', netherStrategy);
            await this.sendChat('🧠 Nether strategy planned! Building portal now!');
            
            this.logProgress('Nether expedition strategy developed');
            await this.buildNetherPortal();
            
        } catch (error) {
            console.error('Nether planning failed:', error);
            await this.sendChat('🔥 Time for the Nether! Building portal with basic strategy!');
            await this.buildNetherPortal();
        }
    }

    async buildNetherPortal() {
        console.log('🌋 Building Nether portal...');
        this.currentTask = 'building_portal';
        
        // Check if we have obsidian
        if (this.inventory.obsidian < 10) {
            await this.sendChat('🪨 Need obsidian for portal! Mining or using water/lava method!');
            await this.delay(5000);
            this.inventory.obsidian = 10;
            await this.sendChat('✅ Obsidian gathered! Portal construction time!');
        }
        
        await this.sendChat('🌋 Building Nether portal... Almost ready for the journey!');
        await this.delay(3000);
        
        console.log('🔥 Portal construction complete!');
        await this.sendChat('🔥 Portal ready! Entering the Nether... wish me luck!');
        
        this.logProgress('Nether portal constructed');
        await this.enterNether();
    }

    async enterNether() {
        console.log('🌋 Entering the Nether...');
        await this.sendChat('🔥 In the Nether! Looking for fortress...');
        
        this.currentTask = 'nether_exploration';
        
        // Simulate Nether exploration
        for (let i = 0; i < 8; i++) {
            if (this.currentTask !== 'nether_exploration') break;
            
            console.log(`🔍 Exploring Nether sector ${i + 1}/8`);
            
            if (i === 3) {
                await this.sendChat('🏰 Found Nether fortress! Moving in carefully...');
                await this.exploreNetherFortress();
                break;
            }
            
            await this.sendChat(`🔍 Searching sector ${i + 1}... No fortress yet`);
            await this.delay(4000);
        }
    }

    async exploreNetherFortress() {
        console.log('🏰 Exploring Nether fortress...');
        await this.sendChat('⚔️ Fortress found! Hunting blazes for rods!');
        
        // Simulate blaze fighting
        for (let fight = 1; fight <= 5; fight++) {
            console.log(`🔥 Blaze fight ${fight}/5`);
            await this.sendChat(`🔥 Fighting blaze #${fight}... Need those rods!`);
            
            await this.delay(3000);
            
            if (Math.random() > 0.3) {
                const rods = Math.floor(Math.random() * 2) + 1;
                this.inventory.blazeRods += rods;
                await this.sendChat(`✅ Blaze defeated! +${rods} rods (Total: ${this.inventory.blazeRods})`);
                this.logProgress(`Obtained ${rods} blaze rods (total: ${this.inventory.blazeRods})`);
            } else {
                await this.sendChat('💥 Tough fight but no rod drop. Continuing...');
            }
            
            if (this.inventory.blazeRods >= 7) {
                await this.sendChat('🎉 Enough blaze rods collected! Mission success!');
                break;
            }
        }
        
        if (this.inventory.blazeRods >= 7) {
            await this.returnFromNether();
        } else {
            await this.sendChat('⚔️ Need more blaze rods! Continuing fortress exploration...');
            setTimeout(() => this.exploreNetherFortress(), 3000);
        }
    }

    async returnFromNether() {
        await this.sendChat('🏠 Returning from Nether with blaze rods! Phase 2 complete!');
        console.log('✅ Nether expedition successful!');
        
        this.logProgress(`Nether phase completed - Collected ${this.inventory.blazeRods} blaze rods`);
        this.currentPhase = 'stronghold';
        
        await this.delay(2000);
        await this.prepareForStrongholdSearch();
    }

    async prepareForStrongholdSearch() {
        await this.sendChat('🎯 Phase 3: Find the stronghold! Crafting eyes of ender...');
        
        // Check if we have ender pearls
        if (this.inventory.enderPearls < 12) {
            await this.sendChat('👁️ Need ender pearls! Hunting endermen...');
            await this.huntEndermen();
        } else {
            await this.craftEyesOfEnder();
        }
    }

    async huntEndermen() {
        console.log('👁️ Hunting endermen for pearls...');
        this.currentTask = 'hunting_endermen';
        
        for (let hunt = 1; hunt <= 6; hunt++) {
            console.log(`👁️ Enderman hunt ${hunt}/6`);
            await this.sendChat(`👁️ Hunting enderman #${hunt}... Need those pearls!`);
            
            await this.delay(4000);
            
            if (Math.random() > 0.4) {
                const pearls = Math.floor(Math.random() * 2) + 1;
                this.inventory.enderPearls += pearls;
                await this.sendChat(`✅ Enderman defeated! +${pearls} pearls (Total: ${this.inventory.enderPearls})`);
                this.logProgress(`Obtained ${pearls} ender pearls (total: ${this.inventory.enderPearls})`);
            }
            
            if (this.inventory.enderPearls >= 12) {
                await this.sendChat('🎉 Enough ender pearls! Ready to craft eyes of ender!');
                break;
            }
        }
        
        await this.craftEyesOfEnder();
    }

    async craftEyesOfEnder() {
        console.log('👁️ Crafting eyes of ender...');
        await this.sendChat('👁️ Crafting eyes of ender for stronghold search!');
        
        const eyesCrafted = Math.min(this.inventory.enderPearls, this.inventory.blazeRods);
        this.inventory.enderPearls -= eyesCrafted;
        this.inventory.blazeRods -= eyesCrafted;
        
        await this.sendChat(`✅ Crafted ${eyesCrafted} eyes of ender! Time to find the stronghold!`);
        this.logProgress(`Crafted ${eyesCrafted} eyes of ender`);
        
        await this.searchForStronghold();
    }

    async searchForStronghold() {
        console.log('🏛️ Searching for stronghold...');
        await this.sendChat('🏛️ Using eyes of ender to locate stronghold...');
        
        this.currentTask = 'stronghold_search';
        
        // Simulate stronghold search
        for (let search = 1; search <= 4; search++) {
            console.log(`🎯 Stronghold search attempt ${search}/4`);
            await this.sendChat(`👁️ Throwing eye of ender #${search}... Following the trail!`);
            
            await this.delay(5000);
            
            if (search === 3) {
                await this.sendChat('🏛️ Found the stronghold! Digging down to find the portal room!');
                await this.exploreStronghold();
                return;
            }
            
            await this.sendChat(`🎯 Eye points ${search === 1 ? 'north' : search === 2 ? 'northeast' : 'east'}... Following!`);
        }
    }

    async exploreStronghold() {
        console.log('🏛️ Exploring stronghold...');
        await this.sendChat('🚪 In the stronghold! Searching for the End portal room...');
        
        this.currentTask = 'stronghold_exploration';
        
        // Simulate stronghold exploration
        for (let room = 1; room <= 6; room++) {
            console.log(`🚪 Checking room ${room}/6`);
            
            if (room === 4) {
                await this.sendChat('🌟 FOUND THE END PORTAL ROOM! Checking portal status...');
                await this.checkEndPortal();
                return;
            }
            
            await this.sendChat(`🚪 Room ${room}: ${room === 1 ? 'Library' : room === 2 ? 'Corridor' : room === 3 ? 'Prison cells' : 'Storage'}... Continuing search`);
            await this.delay(3000);
        }
    }

    async checkEndPortal() {
        console.log('🌟 Checking End portal...');
        await this.sendChat('🌟 Examining End portal... Checking for missing eyes...');
        
        await this.delay(3000);
        
        const missingEyes = Math.floor(Math.random() * 4) + 2; // 2-5 missing eyes
        const remainingEyes = this.inventory.enderPearls; // Actually eyes of ender now
        
        if (remainingEyes >= missingEyes) {
            await this.sendChat(`👁️ Portal needs ${missingEyes} eyes. I have enough! Activating...`);
            await this.activateEndPortal();
        } else {
            await this.sendChat(`👁️ Need ${missingEyes} eyes but only have ${remainingEyes}. Getting more!`);
            // Go back to get more eyes
            await this.prepareForStrongholdSearch();
        }
    }

    async activateEndPortal() {
        console.log('🌟 Activating End portal...');
        await this.sendChat('🌟 Placing eyes of ender in portal frame...');
        
        await this.delay(3000);
        await this.sendChat('✨ PORTAL ACTIVATED! The End awaits!');
        
        this.logProgress('End portal activated successfully');
        this.currentPhase = 'end_fight';
        
        await this.delay(2000);
        await this.prepareForDragonFight();
    }

    async prepareForDragonFight() {
        await this.sendChat('🐉 Final preparations for the Ender Dragon fight!');
        
        // Use Gemini for final battle strategy
        try {
            const battlePrompt = `I'm about to fight the Ender Dragon in Minecraft. Give me a concise battle strategy including:

1. What to do immediately upon entering The End
2. How to handle the Endermen
3. Destroying the End crystals strategy
4. Dragon attack patterns and how to avoid them
5. Best positions for fighting
6. Emergency tactics if health gets low

Current equipment: Diamond armor, diamond sword, bow and arrows, food
Keep response under 250 words - this is the final battle plan!`;

            const result = await this.model.generateContent(battlePrompt);
            const battleStrategy = result.response.text();
            
            console.log('⚔️ Final Battle Strategy:', battleStrategy);
            this.research.currentStrategy = battleStrategy;
            
            await this.sendChat('🧠 Battle strategy ready! Time to face the dragon!');
            
        } catch (error) {
            console.error('Battle strategy failed:', error);
            await this.sendChat('⚔️ Ready with standard dragon tactics! Let\'s do this!');
        }
        
        await this.enterTheEnd();
    }

    async enterTheEnd() {
        console.log('🌟 Entering The End...');
        await this.sendChat('🌟 Jumping into The End portal... HERE WE GO!');
        
        await this.delay(3000);
        await this.sendChat('🖤 In The End! I can see the dragon! Beginning the fight!');
        
        this.logProgress('Entered The End - Dragon fight initiated');
        await this.fightEnderDragon();
    }

    async fightEnderDragon() {
        console.log('🐉 ENDER DRAGON FIGHT INITIATED!');
        await this.sendChat('🐉 DRAGON FIGHT STARTED! Destroying End crystals first!');
        
        this.currentTask = 'dragon_fight';
        const totalCrystals = 10;
        let crystalsDestroyed = 0;
        
        // Phase 1: Destroy End crystals
        while (crystalsDestroyed < totalCrystals && this.currentTask === 'dragon_fight') {
            console.log(`💎 Targeting End crystal ${crystalsDestroyed + 1}/${totalCrystals}`);
            
            if (crystalsDestroyed < 6) {
                await this.sendChat(`🏹 Shooting crystal #${crystalsDestroyed + 1} with bow!`);
            } else {
                await this.sendChat(`🧗 Climbing tower to reach crystal #${crystalsDestroyed + 1}!`);
            }
            
            await this.delay(4000);
            
            if (Math.random() > 0.2) {
                crystalsDestroyed++;
                await this.sendChat(`💥 Crystal destroyed! (${crystalsDestroyed}/${totalCrystals})`);
                this.logProgress(`End crystal destroyed (${crystalsDestroyed}/${totalCrystals})`);
            } else {
                await this.sendChat('🐉 Dragon attacked! Dodging and trying again!');
            }
        }
        
        if (crystalsDestroyed >= totalCrystals) {
                    await this.sendChat('✅ All End crystals destroyed! Now for the dragon itself!');
        await this.finalDragonBattle();
    }

    async finalDragonBattle() {
        console.log('🐉 Final dragon battle phase!');
        await this.sendChat('⚔️ Dragon vulnerable! Attacking with sword when it lands!');
        
        let dragonHealth = 200; // Dragon has 200 HP
        let battleRound = 1;
        
        while (dragonHealth > 0 && this.currentTask === 'dragon_fight') {
            console.log(`⚔️ Battle round ${battleRound} - Dragon health: ${dragonHealth}`);
            
            // Dragon flying phase
            if (battleRound % 3 !== 0) {
                await this.sendChat(`🏹 Round ${battleRound}: Dragon flying! Shooting arrows!`);
                await this.delay(3000);
                
                if (Math.random() > 0.3) {
                    const damage = Math.floor(Math.random() * 10) + 5;
                    dragonHealth -= damage;
                    await this.sendChat(`🎯 Hit! Dragon took ${damage} damage! (${dragonHealth}/200 HP)`);
                } else {
                    await this.sendChat('🐉 Dragon dodged! Repositioning for next shot!');
                }
            } else {
                // Dragon perching phase
                await this.sendChat(`⚔️ Dragon perched! Attacking with diamond sword!`);
                await this.delay(2000);
                
                const damage = Math.floor(Math.random() * 15) + 10;
                dragonHealth -= damage;
                await this.sendChat(`💥 Sword strike! ${damage} damage! (${dragonHealth}/200 HP)`);
                
                if (Math.random() > 0.7) {
                    await this.sendChat('🔥 Dragon breath attack! Taking cover!');
                    await this.delay(1000);
                }
            }
            
            battleRound++;
            await this.delay(2000);
            
            // Health check
            if (dragonHealth <= 50 && dragonHealth > 0) {
                await this.sendChat('🔥 Dragon is getting desperate! Final phase!');
            }
        }
        
        if (dragonHealth <= 0) {
            await this.victorySequence();
        }
    }

    async victorySequence() {
        console.log('🏆 ENDER DRAGON DEFEATED!');
        await this.sendChat('🏆 THE ENDER DRAGON IS DEFEATED! MISSION ACCOMPLISHED!');
        
        await this.delay(2000);
        await this.sendChat('🎉 Victory! The realm is safe! XP and dragon egg claimed!');
        
        this.logProgress('MISSION COMPLETED: Ender Dragon defeated successfully!');
        this.currentPhase = 'victory';
        this.currentTask = 'celebrating';
        
        // Victory celebration
        await this.delay(3000);
        await this.sendChat('🐉➡️💀 From zero to dragon slayer! What an epic journey!');
        
        console.log('🎊 Mission Summary:');
        console.log('✅ Research completed');
        console.log('✅ Diamond gear crafted');
        console.log('✅ Nether expedition successful');
        console.log('✅ Stronghold found and portal activated');
        console.log('✅ Ender Dragon defeated');
        console.log('🏆 MISSION STATUS: COMPLETE!');
        
        // Offer to restart or continue exploring
        setTimeout(() => {
            this.sendChat('🚀 Ready for another adventure? Type "!restart" for a new mission!');
        }, 5000);
    }

    setupCommands() {
        // Command handling for chat messages
        this.commands = {
            '!status': () => this.reportStatus(),
            '!mission': () => this.reportMission(),
            '!inventory': () => this.reportInventory(),
            '!help': () => this.showHelp(),
            '!restart': () => this.restartMission(),
            '!strategy': () => this.shareStrategy()
        };
    }

    async handleChatMessage(packet) {
        if (!packet.message || packet.source_name === this.config.username) return;
        
        const message = packet.message.trim();
        const player = packet.source_name;
        
        console.log(`💬 ${player}: ${message}`);
        this.chatHistory.push({ player, message, timestamp: Date.now() });
        
        // Handle commands
        if (message.startsWith('!')) {
            const command = message.toLowerCase();
            if (this.commands[command]) {
                await this.commands[command]();
                return;
            }
        }
        
        // AI response to regular chat
        if (Date.now() - this.lastResponse > this.config.responseDelay) {
            await this.generateAIResponse(player, message);
        }
    }

    async generateAIResponse(player, message) {
        try {
            const prompt = `Player ${player} said: "${message}"

            Respond as DragonSlayerBot focusing on the Ender Dragon mission. Current phase: ${this.currentPhase}
            Current goal: ${this.research.currentGoal}
            Keep response under 100 characters and maintain your determined, mission-focused personality.`;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text().substring(0, 100);
            
            await this.sendChat(response);
            this.lastResponse = Date.now();
            
        } catch (error) {
            console.error('AI response failed:', error);
            const responses = [
                'Dragon mission continues! 🐉',
                'Still focused on defeating the dragon! ⚔️',
                'The quest goes on! 🎯'
            ];
            await this.sendChat(responses[Math.floor(Math.random() * responses.length)]);
        }
    }

    // Command implementations
    async reportStatus() {
        await this.sendChat(`🤖 Status: ${this.currentPhase} | Goal: ${this.research.currentGoal || 'Dragon hunt!'}`);
    }

    async reportMission() {
        const phases = ['research', 'preparation', 'nether', 'stronghold', 'end_fight', 'victory'];
        const current = phases.indexOf(this.currentPhase);
        await this.sendChat(`🐉 Mission: ${current + 1}/${phases.length} phases complete | Current: ${this.currentPhase}`);
    }

    async reportInventory() {
        await this.sendChat(`📦 Key items: ${this.inventory.diamonds}💎 ${this.inventory.blazeRods}🔥 ${this.inventory.enderPearls}👁️`);
    }

    async showHelp() {
        await this.sendChat('🤖 Commands: !status !mission !inventory !help !restart !strategy');
    }

    async restartMission() {
        await this.sendChat('🔄 Restarting dragon mission! Back to the beginning!');
        this.missionStarted = false;
        this.missionActive = false;
        this.currentPhase = 'waiting';
        setTimeout(() => this.startEnderDragonMission(), 2000);
    }

    async shareStrategy() {
        const strategy = this.research.currentStrategy || 'Gather resources, explore Nether, find stronghold, defeat dragon!';
        await this.sendChat(`🧠 Strategy: ${strategy.substring(0, 120)}...`);
    }

    // Utility methods
    async sendChat(message) {
        if (this.connected && this.client) {
            try {
                this.client.write('text', {
                    type: 'chat',
                    needs_translation: false,
                    source_name: this.config.username,
                    xuid: '',
                    platform_chat_id: '',
                    message: message
                });
            } catch (error) {
                console.error('Failed to send chat:', error);
            }
        }
        console.log(`🤖 Bot: ${message}`);
    }

    logProgress(message) {
        const timestamp = new Date().toISOString();
        this.progressLog.push({ timestamp, message });
        console.log(`📊 Progress: ${message}`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async briefNewPlayer(playerName) {
        await this.delay(1000);
        await this.sendChat(`${playerName}: I'm on an epic quest to defeat the Ender Dragon! 🐉`);
        await this.delay(2000);
        await this.sendChat(`Current phase: ${this.currentPhase} | Join the adventure! 🗡️`);
    }
}

// Initialize and start the bot
async function startBot() {
    console.log('🐉 Initializing Ender Dragon Mission Bot...');
    
    const bot = new EnderDragonMissionBot();
    
    bot.on('connected', () => {
        console.log('✅ Bot connected and mission ready!');
    });
    
    // Connect to server
    await bot.connect();
    
    // Keep the process alive
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down Ender Dragon Bot...');
        if (bot.client) {
            bot.client.disconnect();
        }
        process.exit(0);
    });
}

// Start the bot
if (require.main === module) {
    startBot().catch(console.error);
}

module.exports = { EnderDragonMissionBot };