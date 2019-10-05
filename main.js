/**
 * LilyWhiteBot
 * https://github.com/mrhso/LilyWhiteBot
 *
 * @author      vjudge1, Ishisashi
 * @description
 */
'use strict';

const fs = require('fs');
const https = require('https');
const irc = require('irc-upd');
const Telegraf = require('telegraf');
const QQBot = require('./lib/QQBot.js');
const WeChatBot = require('./lib/WeChatBotClient.js');
const discord = require('discord.js');
const proxy = require('./lib/proxy.js');
const winston = require('winston');
const yaml = require('js-yaml');

const {Context, Message} = require('./lib/handlers/Context.js');
const IRCMessageHandler = require('./lib/handlers/IRCMessageHandler.js');
const TelegramMessageHandler = require('./lib/handlers/TelegramMessageHandler.js');
const QQMessageHandler = require('./lib/handlers/QQMessageHandler.js');
const WeChatMessageHandler = require('./lib/handlers/WeChatMessageHandler.js');
const DiscordMessageHandler = require('./lib/handlers/DiscordMessageHandler.js');

// 所有擴充套件包括傳話機器人都只與該物件打交道
const pluginManager = {
    handlers: new Map(),
    handlerClasses: new Map(),
    config: {},
    global: {
        Context,
        Message,
    },
    plugins: {},
};

// 日志初始化
const logFormat = winston.format(info => {
    info.level = info.level.toUpperCase();
    if (info.stack) {
        info.message = `${info.message}\n${info.stack}`;
    }
    return info;
});
winston.add(new winston.transports.Console({
    format: winston.format.combine(
        logFormat(),
        winston.format.colorize(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} [${info.level}] ${info.message}`)
    ),
}));

process.on('unhandledRejection', (reason, promise) => {
    promise.catch(e => {
        winston.error('Unhandled Rejection: ', e);
    });
});

process.on('uncaughtException', (err, origin) => {
    winston.error(`Caught exception: ${err}`);
    winston.error(`Exception origin: ${origin}`);
});

process.on('rejectionHandled', promise => {
    // 忽略
});

// 用于加载配置文件
const isFileExists = (name) => {
    try {
        fs.accessSync(name, fs.constants.R_OK);
        return true;
    } catch (err) {
        return false;
    }
}

// 加载配置文件
const loadConfig = (name) => {
    // 优先读取yaml格式配置文件
    if (isFileExists(`${name}.yml`)) {
        return yaml.safeLoad(fs.readFileSync(`${name}.yml`, 'utf8'));
    } else if (isFileExists(`${name}.yaml`)) {
        return yaml.safeLoad(fs.readFileSync(`${name}.yaml`, 'utf8'));
    } else if (isFileExists(`${name}.js`)) {
        winston.warn(`* DEPRECATED: ${name}.js format is deprecated, please use yaml format instead.`);
        return require(`./${name}.js`);
    } else {
        return null;
    }
};

const config = loadConfig('config');

// 日志等级、文件设置
if (config.logging && config.logging.level) {
    winston.level = config.logging.level;
} else {
    winston.level = 'info';
}

if (config.logging && config.logging.logfile) {
    const files = new winston.transports.File({
        filename: config.logging.logfile,
        format: winston.format.combine(
            logFormat(),
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(info => `${info.timestamp} [${info.level}] ${info.message}`)
        )
    });
    winston.add(files);
}

// 欢迎信息
winston.info('LilyWhiteBot: Multi-platform message transport bot.');
winston.info(`Version: ${require('./package.json').version}`);
winston.info();
let enabledClients = [];
for (let type of ['IRC', 'Telegram', 'QQ', 'WeChat', 'Discord']) {
    if (config[type] && !config[type].disabled) {
        enabledClients.push(type);
    }
}
winston.info(`Enabled clients: ${enabledClients.join(', ')}`);

// 載入 IRC 機器人程式
if (config.IRC && !config.IRC.disabled) {
    let botcfg = config.IRC.bot;

    winston.info('Starting IRCBot...');
    const ircClient = new irc.Client(botcfg.server, botcfg.nick, {
        userName: botcfg.userName,
        realName: botcfg.realName,
        port: botcfg.port,
        autoRejoin: true,
        channels: botcfg.channels || [],
        secure: botcfg.secure || false,
        floodProtection: botcfg.floodProtection === undefined ? true : botcfg.floodProtection,
        floodProtectionDelay: botcfg.floodProtectionDelay === undefined ? 300 : botcfg.floodProtectionDelay,
        sasl: botcfg.SASL,
        password: botcfg.sasl_password,
        encoding: botcfg.encoding || 'UTF-8',
        autoConnect: false,
    });

    ircClient.on('registered', (message) => {
        winston.info('IRCBot has been registered.');
    });

    ircClient.on('join', (channel, nick, message) => {
        if (nick === ircClient.nick) {
            winston.info(`IRCBot has joined channel: ${channel} as ${nick}`);
        }
    });

    ircClient.on('error', (message) => {
        winston.error(`IRCBot error: ${message.command} (${(message.args || []).join(' ')})`);
    });

    ircClient.connect();

    let options = config.IRC.options || {};
    let options2 = {
        maxLines: options.maxLines,
        keepSilence: options.keepSilence,
    };
    const ircHandler = new IRCMessageHandler(ircClient, options2);
    pluginManager.handlers.set('IRC', ircHandler);
    pluginManager.handlerClasses.set('IRC', {
        object: IRCMessageHandler,
        options: options2
    });
}

if (config.Telegram && !config.Telegram.disabled) {
    let tgcfg = config.Telegram;
    winston.info('Starting TelegramBot...');

    // 代理
    let myAgent = https.globalAgent;

    if (tgcfg.options.noCheckCertificate) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    if (tgcfg.options.proxy && tgcfg.options.proxy.host) {
        myAgent = new proxy.HttpsProxyAgent({
            proxyHost: tgcfg.options.proxy.host,
            proxyPort: tgcfg.options.proxy.port,
        });
    }

    const tgBot = new Telegraf(tgcfg.bot.token, {
        telegram: {
            agent: myAgent,
            apiRoot: tgcfg.options.apiRoot || 'https://api.telegram.org',
        },
        username: tgcfg.bot.name,
    });

    tgBot.catch((err) => {
        winston.error(`TelegramBot error: ${err.message}`, err);
    });

    tgBot.startPolling(tgcfg.bot.timeout || 30, tgcfg.bot.limit || 100);

    let options2 = {
        botName: tgcfg.bot.name,
        nickStyle: tgcfg.options.nickStyle,
        keepSilence: tgcfg.options.keepSilence,
    };

    const telegramHandler = new TelegramMessageHandler(tgBot, options2);
    pluginManager.handlers.set('Telegram', telegramHandler);
    pluginManager.handlerClasses.set('Telegram', {
        object: TelegramMessageHandler,
        options: options2
    });

    winston.info('TelegramBot has started.');
}

if (config.QQ && !config.QQ.disabled) {
    let options = config.QQ.options || {};

    // TODO 兼容旧版本机器人
    if (!config.QQ.apiRoot) {

    } else {

    }

    let qqbot = new QQBot({
        CoolQAirA: options.CoolQAirA,
        host: config.QQ.host || '127.0.0.1',
        port: config.QQ.port || 11235,
        unicode: options.unicode,
        dir: config.QQ.dir,
    });
    winston.info('Starting QQBot...');

    qqbot.on('Error', (err) => {
        winston.error(`QQBot error: ${err.error.toString()} (${err.event})`);
    });

    qqbot.start();

    // 載入敏感詞清單
    let badwords = null;
    if (options.selfCensorship) {
        try {
            badwords = loadConfig('badwords');
        } catch (ex) {
            winston.warn('Unable to load badwords list', true);
        }
    }
    if (badwords === null) {
        badwords = [];
    }

    let options2 = {
        qq: config.QQ.qq,
        selfCensorship: options.selfCensorship,
        ignoreCash: options.ignoreCash,
        badwords: badwords,
        nickStyle: options.nickStyle,
        CoolQAirA: options.CoolQAirA,
        keepSilence: options.keepSilence,
    };

    const qqHandler = new QQMessageHandler(qqbot, options2);
    pluginManager.handlers.set('QQ', qqHandler);
    pluginManager.handlerClasses.set('QQ', {
        object: QQMessageHandler,
        options: options2,
    });

    winston.info('QQBot has started.');
}

if (config.WeChat && !config.WeChat.disabled) {
    let options = config.WeChat.options || {};

    let wechatbot = new WeChatBot({
        CoolQAirA: options.CoolQAirA,
        host: config.QQ.host || '127.0.0.1',
        port: config.QQ.port || 11337,
    });
    winston.info('Starting WeChatBot...');

    wechatbot.on('Error', (err) => {
        winston.error(`WeChatBot Error: ${err.error.toString()} (${err.event})`);
    });

    wechatbot.start();

    // 載入敏感詞清單
    let ungoodwords = null;
    if (options.selfCensorship) {
        try {
            ungoodwords = loadConfig('ungoodwords');
        } catch (ex) {
            winston.warn('Unable to load ungoodwords.js.', true);
        }
    }
    if (ungoodwords === null) {
        ungoodwords = [];
    }

    let options2 = {
        ungoodwords: ungoodwords,
        keepSilence: options.keepSilence,
    };

    const wechatHandler = new WeChatMessageHandler(wechatbot, options2);
    pluginManager.handlers.set('WeChat', wechatHandler);
    pluginManager.handlerClasses.set('WeChat', {
        object: QQMessageHandler,
        options: options2,
    });

    winston.info('WeChatBot has started.');
}

if (config.Discord && !config.Discord.disabled) {
    let botcfg = config.Discord.bot;

    winston.info('Starting DiscordBot...');
    const discordClient = new discord.Client();

    discordClient.on('ready', (message) => {
        winston.info('DiscordBot is ready.');
    });

    discordClient.on('error', (message) => {
        winston.error(`DiscordBot Error: ${message.message}`);
    });

    discordClient.login(botcfg.token);

    let options = config.Discord.options || {};
    let options2 = {
        nickStyle: options.nickStyle,
        useProxyURL: options.useProxyURL,
    };

    const discordHandler = new DiscordMessageHandler(discordClient);
    pluginManager.handlers.set('Discord', discordHandler);
    pluginManager.handlerClasses.set('Discord', {
        object: DiscordMessageHandler,
        options: options2,
    });
}

/**
 * 載入擴充套件
 */
winston.info();
winston.info(`Loading plugins...`);
pluginManager.config = config;
for (let plugin of config.plugins) {
    try {
        winston.info(`Loading plugin: ${plugin}`);
        let p = require(`./plugins/${plugin}.js`)(pluginManager, config[plugin] || {});
        if (p) {
            pluginManager.plugins[plugin] = p;
        } else {
            pluginManager.plugins[plugin] = true;
        }
    } catch (ex) {
        winston.error(`Error while loading plugin ${plugin}: `, ex);
    }
}
if (!config.plugins || config.plugins.length === 0) {
    winston.info('No plugins loaded.');
}
