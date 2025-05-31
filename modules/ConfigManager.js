// modules/ConfigManager.js
const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
    constructor(initialOptions = {}) {
        this.configPath = path.join(__dirname, '../config/bot-config.json');
        this.defaultConfig = this.getDefaultConfig();
        this.config = {};
        this.watchers = new Map();
        this.validationRules = this.getValidationRules();
        
        // Initialize configuration
        this.initializeConfig(initialOptions);
    }

    getDefaultConfig() {
        return {
            // Connection settings
            host: process.env.MINECRAFT_HOST || 'localhost',
            port: parseInt(process.env.MINECRAFT_PORT) || 19132,
            username: process.env.BOT_USERNAME || 'DragonSlayerBot',
            version: process.env.MINECRAFT_VERSION || '1.20.0',
            skipPing: true,
            offlineMode: false,
            
            // AI Configuration
            geminiApiKey: process.env.GEMINI_API_KEY,
            geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            maxTokens: parseInt(process.env.MAX_TOKENS) || 1000,
            aiTemperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            aiTopP: parseFloat(process.env.AI_TOP_P) || 0.9,
            aiTopK: parseInt(process.env.AI_TOP_K) || 40,
            
            // Bot Behavior
            chatCooldown: parseInt(process.env.CHAT_COOLDOWN) || 2000,
            autoResponse: process.env.AUTO_RESPONSE !== 'false',
            learningEnabled: process.env.LEARNING_ENABLED !== 'false',
            aggressiveMode: process.env.AGGRESSIVE_MODE === 'true',
            helpfulMode: process.env.HELPFUL_MODE !== 'false',
            
            // Mission Settings
            missionTimeout: parseInt(process.env.MISSION_TIMEOUT) || 1800000, // 30 minutes
            autoStartMission: process.env.AUTO_START_MISSION === 'true',
            teamMode: process.env.TEAM_MODE !== 'false',
            maxTeamSize: parseInt(process.env.MAX_TEAM_SIZE) || 4,
            
            // Combat Settings
            combatDistance: parseFloat(process.env.COMBAT_DISTANCE) || 3.0,
            fleeThreshold: parseFloat(process.env.FLEE_THRESHOLD) || 0.3, // 30% health
            combatStrategy: process.env.COMBAT_STRATEGY || 'balanced', // aggressive, defensive, balanced
            
            // Navigation Settings
            pathfindingTimeout: parseInt(process.env.PATHFINDING_TIMEOUT) || 10000,
            movementSpeed: parseFloat(process.env.MOVEMENT_SPEED) || 4.317, // blocks per second
            jumpHeight: parseFloat(process.env.JUMP_HEIGHT) || 1.25,
            
            // Inventory Settings
            autoManageInventory: process.env.AUTO_MANAGE_INVENTORY !== 'false',
            keepEssentialItems: process.env.KEEP_ESSENTIAL_ITEMS !== 'false',
            craftingEnabled: process.env.CRAFTING_ENABLED !== 'false',
            
            // Debug and Monitoring
            debugMode: process.env.DEBUG_MODE === 'true',
            logLevel: process.env.LOG_LEVEL || 'info', // error, warn, info, debug
            logPackets: process.env.LOG_PACKETS === 'true',
            simulationMode: process.env.SIMULATION_MODE === 'true',
            
            // Performance Settings
            tickRate: parseInt(process.env.TICK_RATE) || 20, // ticks per second
            maxMemoryUsage: parseInt(process.env.MAX_MEMORY_MB) || 512, // MB
            gcInterval: parseInt(process.env.GC_INTERVAL) || 60000, // milliseconds
            
            // Learning System
            learningDataPath: process.env.LEARNING_DATA_PATH || './data/learning',
            maxLearningEntries: parseInt(process.env.MAX_LEARNING_ENTRIES) || 10000,
            learningDecayRate: parseFloat(process.env.LEARNING_DECAY_RATE) || 0.1,
            
            // Security Settings
            allowedCommands: process.env.ALLOWED_COMMANDS ? process.env.ALLOWED_COMMANDS.split(',') : ['help', 'status', 'mission'],
            adminUsers: process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',') : [],
            rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
            maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 30,
            
            // Advanced Features
            multiServerMode: process.env.MULTI_SERVER_MODE === 'true',
            backupEnabled: process.env.BACKUP_ENABLED !== 'false',
            metricsEnabled: process.env.METRICS_ENABLED === 'true',
            webhookUrl: process.env.WEBHOOK_URL,
            
            // Experimental Features
            experimentalFeatures: {
                advancedAI: process.env.EXPERIMENTAL_ADVANCED_AI === 'true',
                predictiveNavigation: process.env.EXPERIMENTAL_PREDICTIVE_NAV === 'true',
                dynamicDifficulty: process.env.EXPERIMENTAL_DYNAMIC_DIFFICULTY === 'true',
                socialLearning: process.env.EXPERIMENTAL_SOCIAL_LEARNING === 'true'
            }
        };
    }

    getValidationRules() {
        return {
            host: { type: 'string', required: true, minLength: 1 },
            port: { type: 'number', min: 1, max: 65535 },
            username: { type: 'string', required: true, minLength: 1, maxLength: 16 },
            geminiApiKey: { type: 'string', required: true, minLength: 1 },
            maxTokens: { type: 'number', min: 1, max: 8192 },
            aiTemperature: { type: 'number', min: 0, max: 2 },
            aiTopP: { type: 'number', min: 0, max: 1 },
            aiTopK: { type: 'number', min: 1, max: 100 },
            chatCooldown: { type: 'number', min: 0, max: 10000 },
            missionTimeout: { type: 'number', min: 60000, max: 7200000 }, // 1 minute to 2 hours
            maxTeamSize: { type: 'number', min: 1, max: 20 },
            combatDistance: { type: 'number', min: 1, max: 10 },
            fleeThreshold: { type: 'number', min: 0.1, max: 0.9 },
            pathfindingTimeout: { type: 'number', min: 1000, max: 60000 },
            tickRate: { type: 'number', min: 1, max: 100 },
            maxMemoryUsage: { type: 'number', min: 128, max: 4096 },
            maxLearningEntries: { type: 'number', min: 100, max: 100000 },
            maxRequestsPerMinute: { type: 'number', min: 1, max: 1000 },
            logLevel: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
            combatStrategy: { type: 'string', enum: ['aggressive', 'defensive', 'balanced'] }
        };
    }

    async initializeConfig(initialOptions) {
        try {
            // Load config from file if it exists
            const fileConfig = await this.loadConfigFromFile();
            
            // Merge configurations: defaults -> file -> environment -> initial options
            this.config = { 
                ...this.defaultConfig, 
                ...fileConfig, 
                ...this.getEnvironmentOverrides(),
                ...initialOptions 
            };
            
            // Validate the final configuration
            this.validateConfig();
            
            // Save the merged config back to file
            await this.saveConfigToFile();
            
            console.log('⚙️ Configuration initialized successfully');
            
        } catch (error) {
            console.warn('⚠️ Config initialization warning:', error.message);
            // Fall back to default config
            this.config = { ...this.defaultConfig, ...initialOptions };
        }
    }

    async loadConfigFromFile() {
        try {
            // Ensure config directory exists
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });
            
            const configData = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to load config file:', error.message);
            }
            return {};
        }
    }

    async saveConfigToFile() {
        try {
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });
            
            // Create a clean version without sensitive data for file storage
            const cleanConfig = { ...this.config };
            delete cleanConfig.geminiApiKey; // Don't save API key to file
            
            await fs.writeFile(this.configPath, JSON.stringify(cleanConfig, null, 2));
        } catch (error) {
            console.warn('Failed to save config file:', error.message);
        }
    }

    getEnvironmentOverrides() {
        // This method extracts any additional environment variables
        // that might not be in the default config
        const overrides = {};
        
        // Check for dynamic environment variables
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('BOT_')) {
                const configKey = key.substring(4).toLowerCase().replace(/_/g, '');
                overrides[configKey] = process.env[key];
            }
        });
        
        return overrides;
    }

    validateConfig() {
        const errors = [];
        
        Object.entries(this.validationRules).forEach(([key, rule]) => {
            const value = this.config[key];
            
            // Check required fields
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`${key} is required`);
                return;
            }
            
            if (value === undefined || value === null) return;
            
            // Type validation
            if (rule.type === 'string' && typeof value !== 'string') {
                errors.push(`${key} must be a string`);
            } else if (rule.type === 'number' && typeof value !== 'number') {
                errors.push(`${key} must be a number`);
            } else if (rule.type === 'boolean' && typeof value !== 'boolean') {
                errors.push(`${key} must be a boolean`);
            }
            
            // Range validation for numbers
            if (rule.type === 'number' && typeof value === 'number') {
                if (rule.min !== undefined && value < rule.min) {
                    errors.push(`${key} must be at least ${rule.min}`);
                }
                if (rule.max !== undefined && value > rule.max) {
                    errors.push(`${key} must be at most ${rule.max}`);
                }
            }
            
            // Length validation for strings
            if (rule.type === 'string' && typeof value === 'string') {
                if (rule.minLength !== undefined && value.length < rule.minLength) {
                    errors.push(`${key} must be at least ${rule.minLength} characters`);
                }
                if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                    errors.push(`${key} must be at most ${rule.maxLength} characters`);
                }
            }
            
            // Enum validation
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
            }
        });
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
        }
    }

    getConfig() {
        return { ...this.config };
    }

    getPublicConfig() {
        // Return config without sensitive information
        const publicConfig = { ...this.config };
        delete publicConfig.geminiApiKey;
        delete publicConfig.webhookUrl;
        delete publicConfig.adminUsers;
        return publicConfig;
    }

    updateConfig(updates) {
        // Validate updates
        const tempConfig = { ...this.config, ...updates };
        const oldConfig = { ...this.config };
        this.config = tempConfig;
        
        try {
            this.validateConfig();
        } catch (error) {
            // Rollback on validation failure
            this.config = oldConfig;
            throw error;
        }
        
        // Save to file
        this.saveConfigToFile().catch(error => {
            console.warn('Failed to save config after update:', error.message);
        });
        
        // Notify watchers
        Object.keys(updates).forEach(key => {
            this.notifyWatchers(key, updates[key], oldConfig[key]);
        });
        
        console.log('⚙️ Configuration updated:', Object.keys(updates));
    }

    watchConfig(key, callback) {
        if (!this.watchers.has(key)) {
            this.watchers.set(key, new Set());
        }
        this.watchers.get(key).add(callback);
        
        // Return unwatch function
        return () => {
            const keyWatchers = this.watchers.get(key);
            if (keyWatchers) {
                keyWatchers.delete(callback);
                if (keyWatchers.size === 0) {
                    this.watchers.delete(key);
                }
            }
        };
    }

    notifyWatchers(key, newValue, oldValue) {
        const keyWatchers = this.watchers.get(key);
        if (keyWatchers) {
            keyWatchers.forEach(callback => {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error('Config watcher error:', error);
                }
            });
        }
    }

    get(key, defaultValue = undefined) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    set(key, value) {
        this.updateConfig({ [key]: value });
    }

    has(key) {
        return this.config[key] !== undefined;
    }

    reset() {
        const oldConfig = { ...this.config };
        this.config = { ...this.defaultConfig };
        
        // Notify all watchers
        Object.keys(oldConfig).forEach(key => {
            if (oldConfig[key] !== this.config[key]) {
                this.notifyWatchers(key, this.config[key], oldConfig[key]);
            }
        });
        
        this.saveConfigToFile().catch(error => {
            console.warn('Failed to save config after reset:', error.message);
        });
        
        console.log('⚙️ Configuration reset to defaults');
    }

    async backup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(path.dirname(this.configPath), `bot-config-backup-${timestamp}.json`);
            
            await fs.writeFile(backupPath, JSON.stringify(this.getPublicConfig(), null, 2));
            console.log(`💾 Configuration backed up to: ${backupPath}`);
            return backupPath;
        } catch (error) {
            console.error('Failed to backup configuration:', error);
            throw error;
        }
    }

    async restore(backupPath) {
        try {
            const backupData = await fs.readFile(backupPath, 'utf8');
            const backupConfig = JSON.parse(backupData);
            
            this.updateConfig(backupConfig);
            console.log(`📁 Configuration restored from: ${backupPath}`);
        } catch (error) {
            console.error('Failed to restore configuration:', error);
            throw error;
        }
    }

    getStats() {
        return {
            configSize: Object.keys(this.config).length,
            watchersCount: Array.from(this.watchers.values()).reduce((sum, set) => sum + set.size, 0),
            lastModified: this.lastModified || new Date(),
            validationRules: Object.keys(this.validationRules).length
        };
    }
}

module.exports = ConfigManager;