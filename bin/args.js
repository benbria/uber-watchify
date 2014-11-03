var fromArgs    = require('browserify/bin/args');
var watchify    = require('../');
var extend      = require('xtend');
var superArgs   = {}

process.argv.slice(3).forEach(function(arg, i, args) {
    if (arg === '-n' || args === '--no-watch') {
        superArgs.watch = false;
    } else if (arg === '-cf' || arg === '--cache-file') {
        superArgs.cache = watchify.getCache(args[i + 1]);
    }
});

module.exports = function (args) {
    return watchify(fromArgs(
        process.argv.slice(2),
        extend(watchify.args(), superArgs)
    ), superArgs);
};
