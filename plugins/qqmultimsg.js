/*
* Get qq multi forward messages
*
* command: '!qmulti'
* types: [
*     'qq/123456'
* ]
*/

'use strict';

const format = require('string-format');

module.exports = (pluginManager, options) => {
    const bridge = pluginManager.plugins.transport;

    if (!bridge || !pluginManager.handlers.has('QQ')) {
        return;
    }

    let command = options.command || '!qmulti';

    bridge.addCommand(command, (context) => {
        if (context.isPrivate) {
          if (['Telegram', 'IRC', 'Discord'].includes(context._from_client)) {
              let handler = pluginManager.handlers.get(context._from_client);
              let qqHandler = pluginManager.handlers.get('QQ');
              qqHandler._client.getForwardMsg(context.param.split(' ')[0]).then(res=>{
                let target = context._from_client == 'IRC' ? context.from : context.to;
                if (res.status=='ok') {
                  // console.log(res.data)
                  res.data.forEach(msg=>{
                    let message = qqHandler.parseMessage(msg.message);
                    let meta = {
                        nick: msg.nickname||msg.user_id,
                        from: msg.user_id,
                        to: msg.group_id,
                        text: message.text,
                        client_short: 'Q',
                        client_full: 'QQ',
                    };
                    
                    
                    if (message.extra.multimsg) {
                      meta.text+=`\n[私聊机器人使用 ${command} ${message.extra.multimsg[0]} 以${message.extra.multimsg[1]}]`;
                    }
                    
                    let output = format('[{nick}] {text}', meta);
                    
                    // 处理图片和音频附件
                    for (let file of message.extra.images) {
                        output += '\n' + file;
                    }
                    for (let file of message.extra.records) {
                        output += '\n' + file;
                    }
                    for (let file of message.extra.videos) {
                        output += '\n' + file;
                    }
                    
                    handler.say(target, output);
                  })
                } else {
                  handler.say(target, `找不到指定的合并转发消息。`);
                }
              });
              
          }
        }
    }, options);
};
