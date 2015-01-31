var log4js = require('log4js');

log4js.configure({
    appenders: [{
        type: 'console',
        category: "console"
    }, {
        type: "console",
        filename: 'logs/server.log',
        pattern: "_yyyy-MM-dd",
        alwaysIncludePattern: false,
        category: 'server'
    }],
    replaceConsole: true
});

module.exports = function(name) {
    return log4js.getLogger(name);
};