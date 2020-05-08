const fs = require('fs');
const yaml = require('js-yaml');
const winston = require('winston');

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
    } else if (isFileExists(`${name}.json`)) {
        winston.warn(`* DEPRECATED: ${name}.json format is deprecated, please use yaml format instead.`);
        return require(`./${name}.json`);
    } else {
        return null;
    }
};

// 检查已弃用设置
const checkDeprecatedConfig = (object, path, otherWarning = '') => {
    let current = object;
    let keys = path.split('.');
    for (let key of keys) {
        if (current === null || current === undefined || current[key] === null || current[key] === undefined) {
            return;
        } else {
            current = current[key];
        }
    }
    winston.warn(`* DEPRECATED: Config ${path} is deprecated. ${otherWarning}`);
};

const getFriendlySize = (size) => {
    if (size <= 1126) {
        return `${size.toLocaleString()} B`;
    } else if (size <= 1153433) {
        return `${(size / 1024).toLocaleString()} KiB`;
    } else if (size <= 1181116006) {
        return `${(size / 1048576).toLocaleString()} MiB`;
    } else {
        return `${(size / 1073741824).toLocaleString()} GiB`;
    }
};

const getFriendlyLocation = (latitude, longitude) => {
    let y = latitude;
    let x = longitude;

    y = y<0 ? `${-y}°S` : `${y}°N`;
    x = x<0 ? `${-x}°W` : `${x}°E`;

    return `${y}, ${x}`;
};

const copyObject = (obj) => {
    let r = {};
    for (let a in obj) {
        r[a] = obj[a];
    }
    return r;
};

module.exports = {
    isFileExists,
    loadConfig,
    checkDeprecatedConfig,
    getFriendlySize,
    getFriendlyLocation,
    copyObject,
};
