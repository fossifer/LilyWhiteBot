/**
 * LilyWhiteBot
 * https://github.com/mrhso/LilyWhiteBot
 *
 * @author      vjudge1, Ishisashi
 * @description
 */
'use strict';

const winston = require('winston');

const {Context, Message} = require('./lib/handlers/Context.js');
const { loadConfig, checkDeprecatedConfig } = require('./lib/util.js');

const allHandlers = new Map([
    ['IRC', 'IRCMessageHandler'],
    ['Telegram', 'TelegramMessageHandler'],
    ['QQ', 'QQMessageHandler'],
    ['Discord', 'DiscordMessageHandler']
]);

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
    winston.error(`Uncaught exception:`, err);
});

process.on('rejectionHandled', promise => {
    // 忽略
});

const config = loadConfig('config');
if (config === null) {
    winston.error('No config file found. Exit.');
    process.exit(1);
}

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

checkDeprecatedConfig(config, 'QQ.host', 'cqsocketapi is no longer maintained, please use CoolQ HTTP API (https://cqhttp.cc/) instead.');
checkDeprecatedConfig(config, 'QQ.port');
checkDeprecatedConfig(config, 'QQ.qq', 'Move to QQ.bot.qq');
checkDeprecatedConfig(config, 'QQ.apiRoot', 'Move to QQ.bot.apiRoot');
checkDeprecatedConfig(config, 'QQ.accessToken', 'Move to QQ.bot.accessToken');
checkDeprecatedConfig(config, 'QQ.secret', 'Move to QQ.bot.secret');
checkDeprecatedConfig(config, 'QQ.listen', 'Move to QQ.bot.listen');
checkDeprecatedConfig(config, 'QQ.options.CoolQAirA', 'No longer used.');
checkDeprecatedConfig(config, 'Telegram.options.proxy', 'Moved to Telegram.bot.proxy');
checkDeprecatedConfig(config, 'Telegram.options.webhook', 'Moved to Telegram.bot.webhook');
checkDeprecatedConfig(config, 'Telegram.options.apiRoot', 'Moved to Telegram.bot.apiRoot');
checkDeprecatedConfig(config, 'Telegram.options.noCheckCertificate', 'No longer used, use NODE_TLS_REJECT_UNAUTHORIZED=0 instead.');
checkDeprecatedConfig(config, 'transport.options.hidenick');
checkDeprecatedConfig(config, 'transport.options.servemedia.coolqCache');
checkDeprecatedConfig(config, 'transport.options.servemedia.legacy');
checkDeprecatedConfig(config, 'transport.options.servemedia.webp2png', 'No longer used.');
checkDeprecatedConfig(config, 'transport.options.servemedia.webpPath', 'No longer used.');

// 启动各机器人
let enabledClients = [];
for (let type of allHandlers.keys()) {
    if (config[type] && !config[type].disabled) {
        enabledClients.push(type);
    }
}
winston.info(`Enabled clients: ${enabledClients.join(', ')}`);

for (let client of enabledClients) {
    winston.info(`Starting ${client} bot...`);

    const options = config[client];
    const Handler = require(`./lib/handlers/${allHandlers.get(client)}.js`);
    const handler = new Handler(options);
    handler.start();

    pluginManager.handlers.set(client, handler);
    pluginManager.handlerClasses.set(client, {
        object: Handler,
        options: options
    });

    winston.info(`${client} bot has started.`);
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
