var fromArgs = require('browserify/bin/args');
var watchify = require('../');
var defined = require('defined');
var xtend = require('xtend');

module.exports = function (args) {
    var cache, cacheFile, watch;
    args.forEach(function(arg, i, args) {
        if (arg === '-cf' || arg === '--cache-file') {
            cacheFile = args[i + 1];
            cache = watchify.getCache(cacheFile);
        }
        else if (arg === '-n' || arg === '--no-watch') {
            watch = false;
        }
    });

    var bopts = {};
    if (cache) {
        bopts.cache = cache;
    }
    var b = fromArgs(args, xtend(watchify.args(), bopts));

    var opts = {};
    var ignoreWatch = defined(b.argv['ignore-watch'], b.argv.iw);
    if (ignoreWatch) {
        opts.ignoreWatch = ignoreWatch;
    }
    if (cacheFile) {
        opts.cacheFile = cacheFile;
    }
    if (watch === false) {
        opts.watch = watch;
    }

    return watchify(b, xtend(opts, b.argv));
};
