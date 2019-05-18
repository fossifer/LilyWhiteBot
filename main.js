/**
 * LilyWhiteBot
 * https://github.com/mrhso/LilyWhiteBot
 *
 * @author      vjudge1, Ishisashi
 * @description
 */
'use strict';

const https = require('https');
const irc = require('irc-upd');
const Telegraf = require('telegraf');
const QQBot = require('./lib/QQBot.js');
const WeChatBot = require('./lib/WeChatBotClient.js');
const discord = require('discord.js');
const proxy = require('./lib/proxy.js');

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
    log: (message, isError = false) => {
        let date = new Date();
        let zone = -date.getTimezoneOffset();
        let dateStr = new Date(date.getTime() + 60000 * zone).toISOString();
        let zoneStr;
        if (zone > 0) {
            zoneStr = `UTC+${zone / 60}`;
        } else if (zone === 0) {
            zoneStr = `UTC`;
        } else {
            zoneStr = `UTC${zone / 60}`;
        }
        let output = `[${dateStr.substring(0, 10)} ${dateStr.substring(11, 19)} (${zoneStr})] ${message}`;

        if (isError) {
            console.error(output);
        } else {
            console.log(output);
        }
    },
};

/**
 * 啟動機器人
 */
const config = require('./config.js');

if (config.IRC && !config.IRC.disabled) {
    // 載入 IRC 機器人程式
    let botcfg = config.IRC.bot;

    pluginManager.log('Starting IRCBot...');
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
        pluginManager.log('IRCBot Registered.');
    });

    ircClient.on('join', (channel, nick, message) => {
        if (nick === ircClient.nick) {
            pluginManager.log(`IRCBot has joined channel: ${channel} as ${nick}`);
        }
    });

    ircClient.on('error', (message) => {
        pluginManager.log(`IRCBot Error: ${message.command}`, true);
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
    pluginManager.log('Starting TelegramBot...');

    // 代理
    let myAgent = https.globalAgent;

    if (tgcfg.options.noCheckCertificate) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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
            apiRoot: tgcfg.options.apiRoot || "https://api.telegram.org",
        },
        username: tgcfg.bot.name,
    });

    tgBot.catch((err) => {
        pluginManager.log(`TelegramBot Error: ${err.message}`, true);
    });

    tgBot.startPolling(tgcfg.bot.timeout === undefined ? 30 : tgcfg.bot.timeout, tgcfg.bot.limit || 100);

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

    pluginManager.log('TelegramBot started');
}

if (config.QQ && !config.QQ.disabled) {
    let options = config.QQ.options || {};

    let qqbot = new QQBot({
        CoolQAirA: options.CoolQAirA,
        host: config.QQ.host || '127.0.0.1',
        port: config.QQ.port || 11235,
        unicode: options.unicode,
        dir: config.QQ.dir,
    });
    pluginManager.log('Starting QQBot...');

    qqbot.on('Error', (err) => {
        pluginManager.log(`QQBot Error: ${err.error.toString()} (${err.event})`, true);
    });

    qqbot.start();

    // 載入敏感詞清單
    let badwords = [];
    if (options.selfCensorship) {
        try {
            badwords = require('./badwords.js');
        } catch (ex) {
            pluginManager.log('Failed to load badwords.js', true);
        }
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

    pluginManager.log('QQBot started');
}

if (config.WeChat && !config.WeChat.disabled) {
    let options = config.WeChat.options || {};

    let wechatbot = new WeChatBot({
        CoolQAirA: options.CoolQAirA,
        host: config.QQ.host || '127.0.0.1',
        port: config.QQ.port || 11337,
    });
    pluginManager.log('Starting QQBot...');

    wechatbot.on('Error', (err) => {
        pluginManager.log(`WeChatBot Error: ${err.error.toString()} (${err.event})`, true);
    });

    wechatbot.start();

    // 載入敏感詞清單
    let ungoodwords = [];
    try {
        ungoodwords = require('./ungoodwords.js');
    } catch (ex) {
        pluginManager.log('Failed to load ungoodwords.js', true);
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

    pluginManager.log('WeChatBot started');
}

if (config.Discord && !config.Discord.disabled) {
    let botcfg = config.Discord.bot;

    pluginManager.log('Starting DiscordBot...');
    const discordClient = new discord.Client();

    discordClient.on('ready', (message) => {
        pluginManager.log('DiscordBot is ready.');
    });

    discordClient.on('error', (message) => {
        pluginManager.log(`DiscordBot Error: ${message.message}`, true);
    });

    discordClient.login(botcfg.token);

    let options = config.Discord.options || {};
    let options2 = {
        nickStyle: options.nickStyle,
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
pluginManager.config = config;
for (let plugin of config.plugins) {
    try {
        let p = require(`./plugins/${plugin}.js`)(pluginManager, config[plugin] || {});
        if (p) {
            pluginManager.plugins[plugin] = p;
        } else {
            pluginManager.plugins[plugin] = true;
        }
    } catch (ex) {
        pluginManager.log(`Error while loading plugin ${plugin}: ${ex.message}`, true);
    }
}
