// modules/ConfigManager.js - Fixed for async environment loading
const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
    constructor(initialOptions = {}) {
        this.configPath = path.join(__dirname, '../config/bot-config.json');
        this.config = {};
        this.watchers = new Map();
        this.isInitialized = false;
        
        // Don't initialize immediately - let the caller do it
        this.initialOptions = initialOptions;
    }

    async initialize() {
        if (this.isInitialized) return this.config;
        
        // Load dotenv first
        await this.loadDotenv();
        
        // Wait a moment for environment to settle
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Now initialize config
        this.defaultConfig = this.getDefaultConfig();
        this.validationRules = this.getValidationRules();
        
        await this.initializeConfig(this.initialOptions);
        this.isInitialized = true;
        
        return this.config;
    }

    async loadDotenv() {
        try {
            // Always try to load dotenv
            require('dotenv').config();
            console.log('📁 Loaded .env file');
            
            // Debug what we got
            console.log('🔍 Post-dotenv Environment Check:');
            const criticalVars = ['GEMINI_API_KEY', 'MINECRAFT_HOST', 'BOT_USERNAME', 'MINECRAFT_PORT'];
            criticalVars.forEach(varName => {
                const value = process.env[varName];
                const status = value && value.trim() ? '✅' : '❌';
                let display;
                
                if (varName.includes('KEY')) {
                    display = value ? `[${value.length} chars]` : 'MISSING';
                } else {
                    display = value || 'MISSING';
                }
                console.log(`   ${status} ${varName}: ${display}`);
            });
            
        } catch (error) {
            console.log('⚠️ dotenv not available:', error.message);
        }
    }

    getDefaultConfig() {
        // Helper function with better error handling
        const getEnv = (key, defaultValue = undefined, type = 'string') => {
            let value = process.env[key];
            
            // Handle empty strings as undefined
            if (value === undefined || value === null || value === '' || value === 'undefined') {
                console.log(`⚠️ ${key} is empty, using default: ${defaultValue}`);
                return defaultValue;
            }
            
            switch (type) {
                case 'number':
                    const num = parseFloat(value);
                    return isNaN(num) ? defaultValue : num;
                case 'boolean':
                    return value.toLowerCase() === 'true';
                case 'int':
                    const int = parseInt(value);
                    return isNaN(int) ? defaultValue : int;
                default:
                    return value.trim(); // Always trim strings
            }
        };

        const config = {
            // Connection settings
            host: getEnv('MINECRAFT_HOST', 'localhost'),
            port: getEnv('MINECRAFT_PORT', 19132, 'int'),
            username: getEnv('BOT_USERNAME', 'DragonSlayerBot'),
            version: getEnv('MINECRAFT_VERSION', '1.20.0'),
            skipPing: true,
            offlineMode: false,
            
            // AI Configuration - Multiple fallbacks for API key
            geminiApiKey: getEnv('GEMINI_API_KEY') || 
                         getEnv('GEMINI_KEY') || 
                         getEnv('API_KEY') || 
                         getEnv('GOOGLE_API_KEY'),
            geminiModel: getEnv('GEMINI_MODEL', 'gemini-1.5-flash'),
            maxTokens: getEnv('MAX_TOKENS', 1000, 'int'),
            aiTemperature: getEnv('AI_TEMPERATURE', 0.7, 'number'),
            aiTopP: getEnv('AI_TOP_P', 0.9, 'number'),
            aiTopK: getEnv('AI_TOP_K', 40, 'int'),
            
            // Bot Behavior
            chatCooldown: getEnv('CHAT_COOLDOWN', 2000, 'int'),
            autoResponse: getEnv('AUTO_RESPONSE', true, 'boolean'),
            learningEnabled: getEnv('LEARNING_ENABLED', true, 'boolean'),
            aggressiveMode: getEnv('AGGRESSIVE_MODE', false, 'boolean'),
            helpfulMode: getEnv('HELPFUL_MODE', true, 'boolean'),
            
            // Mission Settings
            missionTimeout: getEnv('MISSION_TIMEOUT', 1800000, 'int'),
            autoStartMission: getEnv('AUTO_START_MISSION', false, 'boolean'),
            teamMode: getEnv('TEAM_MODE', true, 'boolean'),
            maxTeamSize: getEnv('MAX_TEAM_SIZE', 4, 'int'),
            
            // Combat Settings
            combatDistance: getEnv('COMBAT_DISTANCE', 3.0, 'number'),
            fleeThreshold: getEnv('FLEE_THRESHOLD', 0.3, 'number'),
            combatStrategy: getEnv('COMBAT_STRATEGY', 'balanced'),
            
            // Navigation Settings
            pathfindingTimeout: getEnv('PATHFINDING_TIMEOUT', 10000, 'int'),
            movementSpeed: getEnv('MOVEMENT_SPEED', 4.317, 'number'),
            jumpHeight: getEnv('JUMP_HEIGHT', 1.25, 'number'),
            
            // Inventory Settings
            autoManageInventory: getEnv('AUTO_MANAGE_INVENTORY', true, 'boolean'),
            keepEssentialItems: getEnv('KEEP_ESSENTIAL_ITEMS', true, 'boolean'),
            craftingEnabled: getEnv('CRAFTING_ENABLED', true, 'boolean'),
            
            // Debug and Monitoring
            debugMode: getEnv('DEBUG_MODE', false, 'boolean'),
            logLevel: getEnv('LOG_LEVEL', 'info'),
            logPackets: getEnv('LOG_PACKETS', false, 'boolean'),
            simulationMode: getEnv('SIMULATION_MODE', false, 'boolean'),
            
            // Performance Settings
            tickRate: getEnv('TICK_RATE', 20, 'int'),
            maxMemoryUsage: getEnv('MAX_MEMORY_MB', 512, 'int'),
            gcInterval: getEnv('GC_INTERVAL', 60000, 'int'),
            
            // Learning System
            learningDataPath: getEnv('LEARNING_DATA_PATH', './data/learning'),
            maxLearningEntries: getEnv('MAX_LEARNING_ENTRIES', 10000, 'int'),
            learningDecayRate: getEnv('LEARNING_DECAY_RATE', 0.1, 'number'),
            
            // Security Settings
            allowedCommands: getEnv('ALLOWED_COMMANDS') ? getEnv('ALLOWED_COMMANDS').split(',') : ['help', 'status', 'mission'],
            adminUsers: getEnv('ADMIN_USERS') ? getEnv('ADMIN_USERS').split(',') : [],
            rateLimitEnabled: getEnv('RATE_LIMIT_ENABLED', true, 'boolean'),
            maxRequestsPerMinute: getEnv('MAX_REQUESTS_PER_MINUTE', 30, 'int'),
            
            // Advanced Features
            multiServerMode: getEnv('MULTI_SERVER_MODE', false, 'boolean'),
            backupEnabled: getEnv('BACKUP_ENABLED', true, 'boolean'),
            metricsEnabled: getEnv('METRICS_ENABLED', false, 'boolean'),
            webhookUrl: getEnv('WEBHOOK_URL'),
            
            // Experimental Features
            experimentalFeatures: {
                advancedAI: getEnv('EXPERIMENTAL_ADVANCED_AI', false, 'boolean'),
                predictiveNavigation: getEnv('EXPERIMENTAL_PREDICTIVE_NAV', false, 'boolean'),
                dynamicDifficulty: getEnv('EXPERIMENTAL_DYNAMIC_DIFFICULTY', false, 'boolean'),
                socialLearning: getEnv('EXPERIMENTAL_SOCIAL_LEARNING', false, 'boolean')
            }
        };

        // Debug the critical values
        console.log('🔧 Configuration values loaded:');
        console.log(`   geminiApiKey: ${config.geminiApiKey ? `[${config.geminiApiKey.length} chars]` : 'MISSING'}`);
        console.log(`   host: ${config.host}`);
        console.log(`   username: ${config.username}`);
        console.log(`   port: ${config.port}`);

        return config;
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
            missionTimeout: { type: 'number', min: 60000, max: 7200000 },
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
            
            // Merge configurations
            this.config = { 
                ...this.defaultConfig, 
                ...fileConfig, 
                ...this.getEnvironmentOverrides(),
                ...initialOptions 
            };
            
            // Final debug before validation
            console.log('🔍 Final config before validation:');
            console.log(`   geminiApiKey: ${this.config.geminiApiKey ? `[${this.config.geminiApiKey.length} chars]` : 'MISSING'}`);
            console.log(`   username: ${this.config.username}`);
            
            // Validate the final configuration
            this.validateConfig();
            
            // Save the merged config back to file
            await this.saveConfigToFile();
            
            console.log('⚙️ Configuration initialized successfully');
            
        } catch (error) {
            console.error('❌ Config initialization failed:', error.message);
            
            // Enhanced error reporting
            if (error.message.includes('geminiApiKey')) {
                console.error('🚨 GEMINI_API_KEY validation failed!');
                console.error('🔍 Debug info:');
                console.error(`   - process.env.GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? `[${process.env.GEMINI_API_KEY.length} chars]` : 'undefined'}`);
                console.error(`   - config.geminiApiKey: ${this.config?.geminiApiKey ? `[${this.config.geminiApiKey.length} chars]` : 'undefined'}`);
                console.error(`   - Type: ${typeof this.config?.geminiApiKey}`);
            }
            
            throw error;
        }
    }

    async loadConfigFromFile() {
        try {
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
            
            const cleanConfig = { ...this.config };
            delete cleanConfig.geminiApiKey;
            
            await fs.writeFile(this.configPath, JSON.stringify(cleanConfig, null, 2));
        } catch (error) {
            console.warn('Failed to save config file:', error.message);
        }
    }

    getEnvironmentOverrides() {
        const overrides = {};
        
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
            
            if (rule.required && (value === undefined || value === null || value === '' || value === 'undefined')) {
                errors.push(`${key} is required but got: ${typeof value} "${value}"`);
                return;
            }
            
            if (value === undefined || value === null || value === '') return;
            
            // Type validation
            if (rule.type === 'string' && typeof value !== 'string') {
                errors.push(`${key} must be a string, got ${typeof value}`);
            } else if (rule.type === 'number' && typeof value !== 'number') {
                errors.push(`${key} must be a number, got ${typeof value}`);
            } else if (rule.type === 'boolean' && typeof value !== 'boolean') {
                errors.push(`${key} must be a boolean, got ${typeof value}`);
            }
            
            // Additional validations...
            if (rule.type === 'number' && typeof value === 'number') {
                if (rule.min !== undefined && value < rule.min) {
                    errors.push(`${key} must be at least ${rule.min}`);
                }
                if (rule.max !== undefined && value > rule.max) {
                    errors.push(`${key} must be at most ${rule.max}`);
                }
            }
            
            if (rule.type === 'string' && typeof value === 'string') {
                if (rule.minLength !== undefined && value.length < rule.minLength) {
                    errors.push(`${key} must be at least ${rule.minLength} characters`);
                }
                if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                    errors.push(`${key} must be at most ${rule.maxLength} characters`);
                }
            }
            
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
            }
        });
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
        }
    }

    // All other methods remain the same...
    getConfig() {
        return { ...this.config };
    }

    getPublicConfig() {
        const publicConfig = { ...this.config };
        delete publicConfig.geminiApiKey;
        delete publicConfig.webhookUrl;
        delete publicConfig.adminUsers;
        return publicConfig;
    }

    // ... (rest of methods remain unchanged)
}

module.exports = ConfigManager;
