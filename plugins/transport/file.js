/*
 * 集中處理檔案：將檔案上傳到圖床，取得URL並儲存至context中。
 *
 * 已知的問題：
 * Telegram音訊使用ogg格式，QQ則使用amr和silk，這個可以考慮互相轉換一下。
 */
'use strict';

const fs = require('fs');
const url = require('url');
const path = require('path');
const request = require('request');
const DWebp = require('cwebp').DWebp;

let options = {};
let servemedia;
let handlers;

/*
 * 轉檔
 */
const preprocessFileName = (name) => {
    if (path.extname(name) === '.webp' && servemedia.webp2png) {
        return name + '.png';
    } else {
        return name;
    }
};
const preprocessFile = (url, file) => {
    if (path.extname(url) === '.webp' && servemedia.webp2png) {
        return new DWebp(file).stream();
    } else {
        return file;
    }
};

/*
 * 儲存至本機快取
 */
const saveToCache = (file, fileid) => new Promise((resolve, reject) => {
    try {
        let t;
        let targetDir = servemedia.cachePath;
        let targetName = fileid;

        if (file.url && !path.extname(targetName)) {
            targetName += path.extname(file.url);
        }
        targetName = preprocessFileName(targetName);

        let targetPath = path.join(targetDir, targetName);
        let w = fs.createWriteStream(targetPath).on('error', (e) => {
            reject(e);
        });

        if (file.url) {
            // 下載
            preprocessFile(file.url, request.get(file.url)).on('end', () => {
                resolve(servemedia.serveUrl + targetName);
            }).pipe(w);
        } else if (file.path) {
            // 複製到cachePath
            fs.createReadStream(file.path).on('end', () => {
                resolve(servemedia.serveUrl + targetName);
            }).pipe(w);
        } else {
            reject('Invalid file');
        }
    } catch (e) {
        reject(e);
    }
});

/*
 * 上傳到 http://img.vim-cn.com
 */
const uploadToVimCN = (file) => new Promise((resolve, reject) => {
    let t;
    if (file.url) {
        // TODO: webp->png轉檔不正常
        //t = preprocessFile(file.url, request.get(file.url));
        t = request.get(file.url);
    } else if (file.path) {
        t = fs.createReadStream(file.path);
    } else {
        reject('Invalid file');
        return;
    }

    request.post({
        url: 'http://img.vim-cn.com/',
        formData: {
            name: t,
        },
    }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            resolve(body.trim());
        } else {
            reject(error);
        }
    });
});

/*
 * 上傳到自行架設的linx圖床上面
 */
const uploadToLinx = (file) => new Promise((resolve, reject) => {
    let name;

    const response = (error, response, body) => {
        if (!error && response.statusCode === 200) {
            resolve(body.trim());
        } else {
            reject(error);
        }
    };

    if (file.url) {
        name = preprocessFileName(path.basename(file.url));

        preprocessFile(file.url, request.get(file.url))
            .on('error', (e) => { reject(e); })
            .pipe(request.put({
                url: servemedia.linxApiUrl + name,
                headers: {
                    'Linx-Randomize': 'yes'
                }
            }, response));
    } else if (file.path) {
        name = path.basename(file.path);
        fs.createReadStream(file.path)
            .on('error', (e) => { reject(e); })
            .pipe(request.put({
                url: servemedia.linxApiUrl + name,
                headers: {
                    'Linx-Randomize': 'yes'
                }
            }, response));
    } else {
        reject('Invalid file');
    }
});

/*
 * 決定檔案去向
 */
const cacheFile = (getfile, fileid) => new Promise((resolve, reject) => {
    getfile.then((file) => {
        switch (servemedia.type) {
            case 'vimcn':
            case 'vim-cn':
                uploadToVimCN(file).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'self':
                saveToCache(file, fileid).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'linx':
                uploadToLinx(file).then((url) => resolve(url), (e) => reject(e));
                break;

            default:

        }
    }).catch((e) => reject(e));
});


/*
 * 處理來自Telegram的多媒體訊息
 */
const getTelegramFileUrl = fileid => new Promise((resolve, reject) => {
    handlers.get('Telegram').getFileLink(fileid).then((url) => {
        resolve({ url: url });
    }).catch((e) => {
        reject(e);
    });
});
const processTelegramFile = file => new Promise((resolve, reject) => {
    let type;
    switch (file.type) {
        case 'photo':
        case 'sticker':
            type = 'photo';
            break;
        case 'audio':
        case 'voice':
            type = 'audio';
            break;
        default:
            type = 'file';
    }

    cacheFile(getTelegramFileUrl(file.id), file.id).then((url) => {
        resolve({
            url: url,
            type: type,
        });
    }).catch((e) => reject(e));
});


/*
 * 處理來自QQ的多媒體訊息
 */
const getQQPhotoUrl = name => new Promise((resolve, reject) => {
    let p = path.join(servemedia.coolqCache, 'image', name) + '.cqimg';
    fs.readFile(p, (err, data) => {
        if (err) {
            reject(err);
        }
        let info = data.toString('ascii');
        let [ ,url] = info.match(/url=(.*?)[\r\n]/) || [];

        resolve({ url: url });
    });
});
const getQQVoicePath = (name) => Promise.resolve({ path: path.join(servemedia.coolqCache, 'record', name)});

const processQQFile = file => new Promise((resolve, reject) => {
    if (file.type === 'photo') {
        cacheFile(getQQPhotoUrl(file.id), file.id).then((url) => {
            resolve({
                url: url,
                type: 'photo',
            });
        }).catch((e) => reject(e));
    } else {
        cacheFile(getQQVoicePath(file.id), file.id).then((url) => {
            resolve({
                url: url,
                type: 'file',
            });
        }).catch((e) => reject(e));
    }
});


/*
 * 判斷訊息來源，將訊息中的每個檔案交給對應函式處理
 */
module.exports = {
    init: (opt) => {
        options = opt;
        servemedia = options.options.servemedia || {};
    },
    get handlers() { return handlers; },
    set handlers(h) { handlers = h; },
    process: context => new Promise((resolve, reject) => {
        let promises = [];

        if (context.extra.files && servemedia.type && servemedia.type !== 'none') {
            for (let file of context.extra.files) {
                if (file.client === 'Telegram') {
                    promises.push(processTelegramFile(file));
                } else if (file.client === 'QQ') {
                    promises.push(processQQFile(file));
                }
            }
        }

        Promise.all(promises).then((uploads) => {
            resolve(uploads);
        }).catch((e) => {
            reject(e);
        });
    }),
};
