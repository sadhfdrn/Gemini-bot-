// modules/ConfigManager.js - Fixed version for Koyeb deployment
const fs = require('fs').promises;
const path = require('path');
function getEnv(key) {
    const raw = process.env[key];
    const value = typeof raw === 'string' ? raw.trim() : undefined;

    if (!value) {
        console.warn(`⚠️ Environment variable "${key}" is not set or empty`);
    } else {
        console.log(`✅ "${key}" loaded from environment: ${value.length} characters`);
    }

    return value;
}
class ConfigManager {
    constructor(initialOptions = {}) {
        this.configPath = path.join(__dirname, '../config/bot-config.json');
        this.defaultConfig = this.getDefaultConfig();
        this.config = {};
        this.watchers = new Map();
        this.validationRules = this.getValidationRules();
        
        // Load dotenv if available (for local development)
        this.loadDotenv();
        
        // Initialize configuration
        this.initializeConfig(initialOptions);
    }

    loadDotenv() {
        try {
            // Only load dotenv in development or if .env file exists
            if (process.env.NODE_ENV !== 'production' || require('fs').existsSync('.env')) {
                require('dotenv').config();
                console.log('📁 Loaded .env file');
            }
        } catch (error) {
            // dotenv not installed or not needed, that's ok
            console.log('⚠️ dotenv not available (this is normal in production)');
        }
    }

    getDefaultConfig() {
        // Helper function to safely get environment variables
        const getEnv = (key, defaultValue = undefined, type = 'string') => {
            let value = process.env[key];
            
            if (value === undefined || value === null || value === '') {
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
                    return value;
            }
        };

        return {
            // Connection settings
            host: getEnv('MINECRAFT_HOST', 'localhost'),
            port: getEnv('MINECRAFT_PORT', 19132, 'int'),
            username: getEnv('BOT_USERNAME', 'DragonSlayerBot'),
            version: getEnv('MINECRAFT_VERSION', '1.20.0'),
            skipPing: true,
            offlineMode: false,
            
            // AI Configuration - CRITICAL: Make this more flexible
            geminiApiKey: getEnv('GEMINI_API_KEY') || getEnv('GEMINI_KEY') || getEnv('API_KEY'),
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
            missionTimeout: getEnv('MISSION_TIMEOUT', 1800000, 'int'), // 30 minutes
            autoStartMission: getEnv('AUTO_START_MISSION', false, 'boolean'),
            teamMode: getEnv('TEAM_MODE', true, 'boolean'),
            maxTeamSize: getEnv('MAX_TEAM_SIZE', 4, 'int'),
            
            // Combat Settings
            combatDistance: getEnv('COMBAT_DISTANCE', 3.0, 'number'),
            fleeThreshold: getEnv('FLEE_THRESHOLD', 0.3, 'number'), // 30% health
            combatStrategy: getEnv('COMBAT_STRATEGY', 'balanced'), // aggressive, defensive, balanced
            
            // Navigation Settings
            pathfindingTimeout: getEnv('PATHFINDING_TIMEOUT', 10000, 'int'),
            movementSpeed: getEnv('MOVEMENT_SPEED', 4.317, 'number'), // blocks per second
            jumpHeight: getEnv('JUMP_HEIGHT', 1.25, 'number'),
            
            // Inventory Settings
            autoManageInventory: getEnv('AUTO_MANAGE_INVENTORY', true, 'boolean'),
            keepEssentialItems: getEnv('KEEP_ESSENTIAL_ITEMS', true, 'boolean'),
            craftingEnabled: getEnv('CRAFTING_ENABLED', true, 'boolean'),
            
            // Debug and Monitoring
            debugMode: getEnv('DEBUG_MODE', false, 'boolean'),
            logLevel: getEnv('LOG_LEVEL', 'info'), // error, warn, info, debug
            logPackets: getEnv('LOG_PACKETS', false, 'boolean'),
            simulationMode: getEnv('SIMULATION_MODE', false, 'boolean'),
            
            // Performance Settings
            tickRate: getEnv('TICK_RATE', 20, 'int'), // ticks per second
            maxMemoryUsage: getEnv('MAX_MEMORY_MB', 512, 'int'), // MB
            gcInterval: getEnv('GC_INTERVAL', 60000, 'int'), // milliseconds
            
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
            // Debug environment variables first
            this.debugEnvironment();
            
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
            console.error('❌ Config initialization failed:', error.message);
            console.error('🔍 Current environment check:');
            console.error('  - GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `[SET - ${process.env.GEMINI_API_KEY.length} chars]` : 'MISSING');
            
            // If it's specifically the API key that's missing, provide helpful guidance
            if (error.message.includes('geminiApiKey')) {
                console.error('');
                console.error('🚨 GEMINI_API_KEY is required but not found!');
                console.error('📋 Troubleshooting steps:');
                console.error('   1. Check that GEMINI_API_KEY is set in Koyeb dashboard');
                console.error('   2. Restart your Koyeb service after adding the variable');
                console.error('   3. Ensure there are no spaces in the variable name');
                console.error('   4. Try setting it as a Secret instead of Environment Variable');
                console.error('');
            }
            
            throw error;
        }
    }

    debugEnvironment() {
        console.log('🔍 Environment Debug Info:');
        console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
        console.log(`   Platform: ${process.platform}`);
        
        // Check critical variables
        const criticalVars = ['GEMINI_API_KEY', 'MINECRAFT_HOST', 'BOT_USERNAME'];
        criticalVars.forEach(varName => {
            const value = process.env[varName];
            const status = value ? '✅' : '❌';
            const display = varName.includes('KEY') ? 
                (value ? `[${value.length} chars]` : 'MISSING') : 
                (value || 'MISSING');
            console.log(`   ${status} ${varName}: ${display}`);
        });
    }

    // ... (rest of the methods remain the same as in the original)
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

    // ... (include all other methods from the original ConfigManager)
    
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
