var through = require('through2');
var path = require('path');
var chokidar = require('chokidar');
var xtend = require('xtend');
var anymatch = require('anymatch');
var mkdirp = require('mkdirp');
var fs = require('fs');

module.exports = watchify;
module.exports.args = {
    cache: {}, packageCache: {}
};
module.exports.getCache = function(cacheFile) {
    try {
        return require(cacheFile);
    } catch (err) {
        return {};
    }
};

function watchify (b, opts) {
    if (!opts) opts = {};
    var cacheFile = opts.cacheFile;
    var cache = b._options.cache || {};
    if (!cache._files) cache._files = {};
    if (!cache._time) cache._time = {};
    var invalid = false;
    var pkgcache = b._options.packageCache;
    var delay = typeof opts.delay === 'number' ? opts.delay : 600;
    var changingDeps = {};
    var pending = false;
    var updating = false;

    var wopts = {persistent: true};
    if (opts.ignoreWatch) {
        var ignored = opts.ignoreWatch !== true
            ? opts.ignoreWatch
            : '**/node_modules/**';
    }
    if (opts.poll || typeof opts.poll === 'number') {
        wopts.usePolling = true;
        wopts.interval = opts.poll !== true
            ? opts.poll
            : undefined;
    }

    if (cache) {
        b.on('reset', collect);
        update();
        collect();
    }

    function update() {
        if (Object.keys(cache) === 2) {
            invalid = true;
            return;
        } else {
            invalid = false;
        }

        Object.keys(cache._time).forEach(function(file) {
            try {
                var stats = fs.statSync(file);
            } catch (err) {}
            if (!stats || cache._time[file] !== stats.mtime.getTime()) {
                b.emit('log', 'Watchify cache: dep updated or removed: ' + path.basename(file));
                cleanEntry(cache._files[file], file);
                invalid = true;
            }
        });
    }

    function collect () {
        b.pipeline.get('deps').push(through.obj(function(row, enc, next) {
            var file = row.expose ? b._expose[row.id] : row.file;
            cache[file] = {
                source: row.source,
                deps: xtend({}, row.deps)
            };
            try {
                var stats = fs.statSync(file);
            } catch (err) {}
            if (stats) {
                cache._files[file] = file;
                cache._time[file] = stats.mtime.getTime();
            }
            this.push(row);
            next();
        }));
    }

    b.on('file', function (file) {
        watchFile(file);
    });

    b.on('package', function (pkg) {
        var file = path.join(pkg.__dirname, 'package.json');
        watchFile(file);
        if (pkgcache) pkgcache[file] = pkg;
    });

    b.on('reset', reset);
    reset();

    function reset () {
        var time = null;
        var bytes = 0;
        b.pipeline.get('record').on('end', function () {
            time = Date.now();
        });

        b.pipeline.get('wrap').push(through(write, end));
        function write (buf, enc, next) {
            bytes += buf.length;
            this.push(buf);
            next();
        }
        function end () {
            var delta = Date.now() - time;
            b.emit('time', delta);
            b.emit('bytes', bytes);
            b.emit('log', bytes + ' bytes written ('
                + (delta / 1000).toFixed(2) + ' seconds)'
            );
            this.push(null);
        }
    }

    var fwatchers = {};
    var fwatcherFiles = {};
    var ignoredFiles = {};

    b.on('transform', function (tr, mfile) {
        tr.on('file', function (dep) {
            watchFile(mfile, dep);
        });
    });
    b.on('bundle', function (bundle) {
        updating = true;
        bundle.on('error', onend);
        bundle.on('end', onend);
        function onend () { updating = false }
    });

    function watchFile (file, dep) {
        dep = dep || file;
        if (ignored) {
            if (!ignoredFiles.hasOwnProperty(file)) {
                ignoredFiles[file] = anymatch(ignored, file);
            }
            if (ignoredFiles[file]) return;
        }
        if (!fwatchers[file]) fwatchers[file] = [];
        if (!fwatcherFiles[file]) fwatcherFiles[file] = [];
        if (fwatcherFiles[file].indexOf(dep) >= 0) return;

        var w = b._watcher(dep, wopts);
        w.setMaxListeners(0);
        w.on('error', b.emit.bind(b, 'error'));
        w.on('change', function () {
            invalidate(file);
        });
        fwatchers[file].push(w);
        fwatcherFiles[file].push(dep);
    }

    function cleanEntry(id, file) {
        delete cache._files[file];
        delete cache._time[file];
        delete cache[id];
        return;
    }

    function invalidate (id) {
        if (cache && cache[id]) {
            cleanEntry(id, cache[id].file);
        }
        invalid = true;
        if (pkgcache) delete pkgcache[id];
        changingDeps[id] = true;
        if (updating) return;

        if (fwatchers[id]) {
            fwatchers[id].forEach(function (w) {
                w.close();
            });
            delete fwatchers[id];
            delete fwatcherFiles[id];
        }

        // wait for the disk/editor to quiet down first:
        if (!pending) setTimeout(function () {
            pending = false;
            if (!updating) {
                b.emit('update', Object.keys(changingDeps));
                changingDeps = {};
            }
        }, delay);
        pending = true;
    }

    b.close = function () {
        Object.keys(fwatchers).forEach(function (id) {
            fwatchers[id].forEach(function (w) { w.close() });
        });
    };

    b._watcher = function (file, opts) {
        return chokidar.watch(file, opts);
    };

    b.write = function(opts) {
        try {
            if (!fs.existsSync(path.dirname(cacheFile))) {
                mkdirp.sync(path.dirname(cacheFile));
            }
            if (!opts) opts = {};
            fs.writeFileSync(cacheFile, '{');
            var first = true;
            for (var prop in cache) {
                if (cache.hasOwnProperty(prop)) {
                    if (first) first = false;
                    else fs.appendFileSync(cacheFile, ',');
                    fs.appendFileSync(cacheFile, JSON.stringify(prop) + ':' + JSON.stringify(cache[prop]))
                }
            }
            fs.appendFileSync(cacheFile, '}');
        } catch (err) {
            b.emit('log', 'Erroring writing cache file ' + err.message);
        }
    };

    var _bundle = b.bundle;

    b.bundle = function(cb) {
        if (invalid) {
            invalid = false;
            var args = 'function' === typeof(cb) ? [cb] : [];
            return _bundle.apply(b, args);
        } else {
            if ('function' === typeof(cb)) {
                b.emit('log', 'Cache is still valid');
                cb();
            } else {
                return null;
            }
        }
    };

    return b;
}
