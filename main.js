/**
 * QQ-Telegram-IRC
 * https://github.com/vjudge1/LilyWhiteBot
 *
 * @author      vjudge1
 * @description
 */
'use strict';

const https = require('https');
const irc = require('irc');
const Telegraf = require('telegraf');
const QQBot = require('./lib/QQBot.js');
const WeChatBot = require('./lib/WeChatBotClient.js');
const proxy = require('./lib/proxy.js');

const {Context, Message} = require('./lib/handlers/Context.js');
const IRCMessageHandler = require('./lib/handlers/IRCMessageHandler.js');
const TelegramMessageHandler = require('./lib/handlers/TelegramMessageHandler.js');
const QQMessageHandler = require('./lib/handlers/QQMessageHandler.js');
const WeChatMessageHandler = require('./lib/handlers/WeChatMessageHandler.js');

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
        let date = new Date().toISOString();
        let output = `[${date.substring(0,10)} ${date.substring(11,19)}] ${message}`;

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
    // 載入IRC機器人程式
    let botcfg = config.IRC.bot;

    pluginManager.log('Starting IRCBot...');
    const ircClient = new irc.Client(botcfg.server, botcfg.nick, {
        userName: botcfg.userName,
        realName: botcfg.realName,
        port: botcfg.port,
        autoRejoin: true,
        channels: botcfg.channels || [],
        secure: botcfg.secure || false,
        floodProtection: botcfg.floodProtection || true,
        floodProtectionDelay: botcfg.floodProtectionDelay || 300,
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

    if (tgcfg.options.proxy && tgcfg.options.proxy.host) {
        myAgent = new proxy.HttpsProxyAgent({
            proxyHost: tgcfg.options.proxy.host,
            proxyPort: tgcfg.options.proxy.port,
        });
    }

    const tgBot = new Telegraf(tgcfg.bot.token, {
        telegram: {
            agent: myAgent,
        },
        username: tgcfg.bot.name,
    });

    tgBot.catch((err) => {
        pluginManager.log(`TelegramBot Error: ${err.message}`, true);
    });

    tgBot.startPolling();

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
        CoolQPro: options.CoolQPro,
        host: config.QQ.host || '127.0.0.1',
        port: config.QQ.port || 11235,
        unicode: options.unicode,
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
        CoolQPro: options.CoolQPro,
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
        CoolQPro: options.CoolQPro,
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
