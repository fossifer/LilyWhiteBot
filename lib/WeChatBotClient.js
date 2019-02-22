/*
 * 微信机器人
 *
 * 注意：
 * ① 需要事先手动运行 WeChatBotServer.js
 * ② 原型程序，请勿用于生产环境！
 */

'use strict';

const dgram = require('dgram');
const EventEmitter = require('events');

const MAX_LEN = 1200;

const base642str = str => Buffer.from(str, 'base64').toString();
const str2base64 = str => Buffer.from(str).toString('base64');

class WeChatBot extends EventEmitter {
    constructor (options = {}) {
        super();
        this._started = false;
        this._debug = options.debug || false;
        this._serverHost = options.host || '127.0.0.1';
        this._serverPort = options.port || 11337;
        this._nick = '';
        this._timeoutCounter = 0;
        this._timeoutTimer = null;
    }

    _log(message, isError) {
        if (this._debug) {
            let dateStr = new Date().toISOString();
            let output = `[${dateStr.substring(0,10)} ${dateStr.substring(11,19)}] ${message}`;

            if (isError) {
                console.error(output);
            } else {
                console.log(output);
            }
        }
    }

    start() {
        if (this._started) {
            return;
        }

        this._socket = dgram.createSocket('udp4');

        this._timeoutCounter = 0;
        this._timeoutTimer = setInterval(() => {
            if (this._started) {
                this._timeoutCounter++;
                if (this._timeoutCounter >= 300) {
                    this._timeoutCounter = 0;
                    this.emit('Timeout');
                }
            }
        }, 1000);

        this._socket.on('message', (msg, rinfo) => {
            this._log(`recv: ${msg}`);

            try {

                let frames = msg.toString().split(' ');

                let command = frames[0];

                // 除錯用
                // this.emit('Raw', msg.toString());

                let msgdata;

                switch (command) {
                    case 'ServerHello':
                        this._timeoutCounter = 0;
                        break;

                    case 'Message':
                        // TODO 现在只接受文字消息
                        if (parseInt(frames[1]) === 1) {
                            this.emit('Message', {
                                type: parseInt(frames[1]),
                                time: parseInt(frames[2]),
                                from: frames[3],
                                to: frames[4],
                                content: base642str(frames[5])
                            });
                        }
                        break;

                    default:
                        // 其他訊息
                        this._log(`Unknown message: ${msg.toString()}`);
                        break;
                }
            } catch (ex) {
                this.emit('Error', {
                    event: 'receive',
                    context: msg.toString(),
                    error: ex,
                });
            }
        });

        this._socket.on('listening', () => {
            var address = this._socket.address();
            this._log(`Server listening at ${address.address}:${address.port}`);
            this._clientPort = address.port;

            const sayHello = () => {
                if (this._started) {
                    let hello = `ClientHello ${this._clientPort}`;
                    this._socket.send(hello, 0, hello.length, this._serverPort, this._serverHost);

                    setTimeout(sayHello, 120000);
                }
            };
            sayHello();
        });

        this._started = true;
        this._socket.bind();
    }

    stop() {
        if (!this._started) {
            return;
        }

        this._socket.close();
        this._started = false;

        if (this._timeoutTimer) {
            clearInterval(this._timeoutTimer);
            this._timeoutTimer = null;
        }

        this._nick = '';
    }

    _rawSend(msg) {
        try {
            this._socket.send(msg, 0, msg.length < MAX_LEN ? msg.length : MAX_LEN, this._serverPort, this._serverHost);
        } catch (ex) {
            this.emit('Error', {
                event: 'send',
                context: msg,
                error: ex,
            });
        }
    }

    send(target, message) {
        let answer = `Message ${target} ${str2base64(message)}`;
        this._rawSend(answer);
    }
}

module.exports = WeChatBot;
