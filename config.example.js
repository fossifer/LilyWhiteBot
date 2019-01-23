/*
 * 機器人的設定檔
 *
 * 請參照註釋進行設定。設定好之後，請將檔案更名為 config.js
 */

module.exports = {
    "IRC": {
        "disabled": false,                  // 設為 true 之後會禁止 IRC 機器人
        "bot": {
            "server": "irc.freenode.net",
            "nick": "",                     // IRC 暱稱
            "userName": "",
            "realName": "",
            "channels": ["#channel1", "#channel2"],   // 需要加入的頻道
            "autoRejoin": true,
            "secure": true,
            "port": 6697,
            "floodProtection": true,
            "floodProtectionDelay": 300,
            "sasl": false,                  // 如果開啟 SASL，那麼需要正確設定前面的 userName 和下面的 sasl_password
            "sasl_password": "",
            "encoding": "UTF-8"
        },
        "options": {
            "maxLines": 4,                  // 一次性容許最多四行訊息（包括因為太長而被迫分割的）
        }
    },
    "Telegram": {
        "disabled": false,                  // 設為 true 之後會禁止 Telegram 機器人
        "bot": {
            "name": "",                     // Bot 的 username
            "token": "",                    // BotFather 給你的 Token，類似「123456789:q234fipjfjaewkflASDFASjaslkdf」
            "timeout": 30,                  // 報超時的秒數
            "limit": 100                    // 限定檢索的消息數
        },
        "options": {
            "proxy": {                      // 代理伺服器。僅支援 HTTPS 代理。
                "host": "",
                "port": 0
            },
            "checkCertificate": true,       // 默認不繞過證書驗證，有需求可以改成 false（如 GoAgent）
            "nickStyle": "username",        // 在其他群組中如何辨識使用者名稱：可取「username」（優先採用使用者名稱）、
                                            // 「fullname」（優先採用全名）、「firstname」（優先採用 First Name）
            "apiRoot": "https://api.telegram.org",   // Bot API 的根地址，必要的時候可以改成 IP，我的意思，，，不過考慮到證書的域名，這樣還是要把 checkCertificate 設置成 false 的。
        }
    },
    /*
      注意：QQ 機器人需要與酷 Q 和 https://github.com/vjudge1/cqsocketapi 配合使用！
     */
    "QQ": {
        "disabled": false,                  // 設定為 true 後會禁止 QQ 機器人。
        "qq": "10000",                      // Bot 的 QQ 號碼
        "options": {
            "selfCensorship": true,         // 敏感詞列表，位於 badwords.js
            "ignoreCash": true,             // 如果訊息疑似口令紅包則將其屏蔽
            "nickStyle": "groupcard",       // 暱稱，可取「groupcard」（優先採用群名片）、「nick」（優先採用暱稱）、「qq」（只用 QQ 號）
            "CoolQPro": false,              // 如果使用酷 Q Pro，可將其開啟
        },
        "host": "127.0.0.1",                // 酷 Q 所在環境的 IP
        "port": 11235                       // 酷 Q 的通信端口
    },

    "plugins": [
        "transport",                        // 啟用互聯功能，不想禁止互聯的話請勿移除
        "groupid-tg",                       // 取得目前 Telegram 群組的 ID，
                                            // 可在正式連接之前啟用該套件，然後在 Telegram 群中使用 /thisgroupid 取得ID
        "ircquery",                         // 允許查詢 IRC 的一些訊息
        "irccommand",                       // 允許向 IRC 發送一些命令（注意，不是 IRC 命令而是給頻道內機器人使用的命令）。
        "pia",
    ],

    "transport": {
        "groups": [
            // 說明：
            // 1. 可以填任意個群組
            // 2. 群組格式：「irc/#頻道」、「telegram/-12345678」或「qq/群號」
            // 3. 聊天軟體名不區分大小寫，可簡寫為 i、t、q。
            // 4. 如果需要，可以加入多個互聯體
            [
                'irc/#test',
                'telegram/-12345678',       // Telegram 群組號碼：可以先把 bot 拉到群組中，然後透過 /thisgroupid 來取得 id
                'qq/12345678'
                // 'QQ/87654321'            // 如果有這種需求，亦可以連接
            ]
            /*
             如果需要，可以繼續加
             [
                'i/#test2',
                't/@test2',
                ...
             ],
             ...
             */
        ],

        /*
        // 如果希望把同一軟體的多個群組連接到一起，可為不同的群組設置不同的別名，
        // 這樣互聯機器人在轉發訊息時會採用自訂群組名，以防混淆。
        "aliases": {
            'qq/87665432': '分部',
            'qq/87665432': ['簡稱', '群組全稱']
        },
         */

        /*
        // 如果不希望特定方向的轉發，例如 Telegram 群不向 QQ 轉發，請在下面設定
        "disables": {
            'qq/12345678': ['irc/#aaa']         // QQ 群 12345678 的訊息不會向 IRC 的 #aaa 頻道轉發
        },
         */

        "options": {
            "IRC": {
                "notify": {
                    "join": false,              // 有人進入頻道是否在其他群發出提醒
                    "rename": "onlyactive",     // 有人更名的話是否在其他群組發出提醒，可取
                                                // 「all」（所有人都提醒）、「onlyactive」（只有說過話的人更名才提醒）、
                                                // 「none」（不提醒）
                    "leave": "onlyactive",      // 有人離開頻道的話是否在其他群組提醒，也可取 all/onlyactive/none
                    "timeBeforeLeave": 600,     // 如果 leave 為 onlyactive 的話：最後一次說話後多長時間內離開才會提醒
                    "topic": true               // 頻道更換 Topic 時是否提醒
                },
                "colorize": {
                    /*
                       這裡可以設定機器人在 IRC 頻道中使用顏色。在啟用顏色功能之前，IRC 頻道的管理員需要解除頻道的 +c 模式，即
                       /msg ChanServ SET #頻道 MLOCK -c

                       轉發機器人的訊息有以下三種格式：
                       <T> [nick] message
                       <T> [nick] Re replyto 「repliedmessage」: message
                       <T> [nick] Fwd fwdfrom: message

                       （兩群互聯不會出現用於標識軟體的「<T>」）

                       可用顏色：white、black、navy、green、red、brown、purple、
                               olive、yellow、lightgreen、teal、cyan、blue、pink、gray、silver
                    */
                    "enabled": true,            // 是否允許在 IRC 頻道中使用顏色。
                    "broadcast": "green",       // < 整行通知的顏色 >
                    "client": "navy",           // 用於標記用戶端「<T>」的顏色
                    "nick": "colorful",            // nick 的顏色。除標準顏色外，亦可設為 colorful
                    "replyto": "brown",         // Re replyto 的顏色
                    "repliedmessage": "olive",  // 被 Re 的訊息的顏色
                    "fwdfrom": "cyan",          // Fwd fwdfrom 的顏色
                    "linesplit": "silver",      // 行分隔符的顏色

                    // 如果 nick 為 colorful，則從這些顏色中挑選。為了使顏色分佈均勻，建議使顏色數量為素數。
                    "nickcolors": ["green", "blue", "purple", "olive", "pink", "teal", "red"]
                },
                "receiveCommands": true,        // 是否允許 Telegram 和 QQ 使用 irccommand
                "allowQuery": true              // 是否允許其他群組查詢 IRC 頻道資訊
            },

            "Telegram": {
                "notify": {
                    "join": true,               // 有人加入群組的話是否提醒其他群組
                    "leave": true,              // 有人離開群組的話是否提醒其他群組
                    "pin": true                 // 管理員在頻道內 pin message（公告）的時候是否提醒其他群組
                },
                "forwardBots": {                // 指出在 Telegram 運行的傳話機器人，以便取得訊息中的真實暱稱
                    "XiaoT_bot": "[]",          // 目前僅支援 [] 和 <>（包圍暱稱的括弧）
                    "zhmrtbot": "[]",
                    "Sakura_fwdbot": "[]",
                    "orzdigbot": "[]",
                    "sauketubot": "skt",
                },
                "forwardCommands": true         // 如果有人使用 Telegram 命令亦轉發到其他群組（但由於 Telegram 設定的原因，Bot 無法看到命令結果）
            },

            "QQ": {
                "notify": {
                    "join": true,               // 有人加入 QQ 群的話是否提醒其他群組
                    "leave": true,              // 有人離開 QQ 群的話是否提醒其他群組
                    "setadmin": true,           // 是否提醒設定/取消管理員
                    "sysmessage": true,         // 是否提醒系統消息，包括禁言和全體禁言
                }
            },

            "paeeye": "//",                     // 在訊息前面使用「//」會阻止此條訊息向其他群組轉發。留空或省略則禁用本功能。
            "hidenick": false,                  // 轉發時不顯示暱稱（建議不要開啟）
            "servemedia": {
                /*
                   本節用於處理圖片等檔案。

                   type為檔案的處置方式，可取：
                   省略/留空/none：不處理。只顯示「<Photo>」或「[圖片]」等文字
                   self：將檔案保存在自己的伺服器中
                   vim-cn：將檔案上傳到 img.vim-cn.com
                   linx：將檔案上傳到一個 linx（https://github.com/andreimarcu/linx-server）伺服器中
                   uguu: 將檔案上傳到一個 uguu（https://github.com/nokonoko/Uguu）伺服器中

                   另外，如果使用酷 Q 的話，您需要定期自行清理酷 Q 的快取！
                 */
                "type": "",                     // 檔案的處置方式：省略/留空/none、self、vim-cn、imgur、sm.ms、linx
                "coolqCache": "",               // 酷 Q 快取存放位置，例如 /home/coolq/CoolQ/data（如果為 *nix 伺服器）或 C:\CoolQ\data（如果為 Windows 伺服器，注意 js 轉義）
                "cachePath": "",                // type 為 self 時有效：快取存放位置
                "serveUrl": "",                 // type 為 self 時有效：檔案 URL 的字首，一般需要以斜線結尾
                "linxApiUrl": "",               // type 為 linx 時有效：linx API 位址，一般以斜線結尾
                "UguuApiUrl": "",               // type 為 uguu 時有效：請使用 /api.php?d=upload-tool 結尾。
                "imgur": {                      // type 為 imgur 時有效
                    "apiUrl": "https://api.imgur.com/3/",     // 以斜線結尾
                    "clientId": ""              // 從 imgur 申請到的 client_id
                },
                "sizeLimit": 4096,              // 檔案最大大小，單位 KiB。0 表示不限制。限制僅對 Telegram 有效。

                // 是否把 Telegram 的 Sticker （webp 格式）轉為 PNG 格式。
                // 如果設為 true，那麼需要額外配置伺服器，具體步驟見 https://github.com/Intervox/node-webp
                "webp2png": false,
                "webpPath": "",                 // 如果無法取得 root 權限，可借此指定 dwebp 二進位檔案位址
            }
        }
    },

    "ircquery": {
        "disables": [                           // 不要在這些群組使用
            "qq/12345678"                       // 軟體名（qq/irc/telegram）要寫全而且小寫……
        ],

        /*
        // 如果是只希望在特定群組使用，用這個
        enables: [
            'qq/12345678'
        ]
         */

        "prefix": "irc",                        // 如果使用，命令會變成 /irctopic、/ircnames 等
    },

    "irccommand": {
        "echo": true,                           // 是否在目前的用戶端顯示命令已傳送
        // 其他設定同 ircquery
    }
};
