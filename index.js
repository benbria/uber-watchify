'use strict';
var through = require('through2'),
fs          = require('fs'),
path        = require('path'),
chokidar    = require('chokidar'),
mkdirp      = require('mkdirp');

module.exports = watchify;
module.exports.args = function() {
    return { cache: {}, packageCache: {}, fullPaths: true, watch: true };
};
module.exports.getCache = function(cacheFile) {
    try {
        return require(cacheFile);
    } catch (err) {
        return {};
    }
};

function resolveStats(id, b) {
    var stats;
    try {
        stats = fs.statSync(id);
    } catch (err) {
        b.emit('log', 'Failed initial statSync of ' + id);
        var basedir = b._options.basedir || process.cwd();
        try {
            stats = fs.statSync(b._bresolve.sync(id, {basedir: basedir}));
        } catch (err) {
            b.emit('log', 'Failed second statSync of ' + id + '. Not caching.');
        }
    } finally {
        return stats;
    }
};

function watchify(b, opts) {
    if (!opts) opts = {};
    var cacheFile = opts.cacheFile;
    var watch = typeof(opts.watch) !== 'undefined' ? opts.watch : module.exports.args().watch;
    var cache = b._options.cache || {};
    if (!cache._files) cache._files = {};
    if (!cache._time) cache._time = {};
    var invalid = false;
    var pkgcache = b._options.packageCache;
    var changingDeps = {};
    var pending = false;
    if (watch) listen();
    reset();
    update();

    function dep(dep) {
        if (typeof dep.id === 'string') {
            var stats = resolveStats(dep.id, b);
            if (!stats) return;
            cache[dep.id] = dep;
            cache._files[dep.file] = dep.id;
            cache._time[dep.file] = stats.mtime.getTime();
        }
        if ((typeof dep.file === 'string') && watch) {
            watchFile(dep.file);
        }
    }

    function file(file) {
        watchFile(file);
    }

    function _package(pkg) {
        watchFile(path.join(pkg.__dirname, 'package.json'));
    }

    function transform(tr, mfile) {
        tr.on('file', function (file) {
            watchDepFile(mfile, file);
        });
    }

    function listen() {
        b.on('dep', dep);
        if (!watch) return;
        b.on('file', file);
        b.on('package', _package);
        b.on('reset', reset);
        b.on('transform', transform);
    }

    function stopListening() {
        b.removeListener('dep', dep);
        if (!watch) return;
        b.removeListener('file', file);
        b.removeListener('package', _package);
        b.removeListener('reset', reset);
    }

    function reset() {
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

    function watchFile(file) {
        fs.lstat(file, function (err, stat) {
            if (err || stat.isDirectory()) return;
            watchFile_(file);
        });
    }

    function watchFile_(file) {
        if (!fwatchers[file]) fwatchers[file] = [];
        if (!fwatcherFiles[file]) fwatcherFiles[file] = [];
        if (fwatcherFiles[file].indexOf(file) >= 0) return;

        var w = chokidar.watch(file, {persistent: true});
        w.setMaxListeners(0);
        w.on('error', b.emit.bind(b, 'error'));
        w.on('change', function () {
            invalidate(file);
        });
        fwatchers[file].push(w);
        fwatcherFiles[file].push(file);
    }

    function watchDepFile(mfile, file) {
        if (!fwatchers[mfile]) fwatchers[mfile] = [];
        if (!fwatcherFiles[mfile]) fwatcherFiles[mfile] = [];
        if (fwatcherFiles[mfile].indexOf(file) >= 0) return;

        var w = chokidar.watch(file, {persistent: true});
        w.setMaxListeners(0);
        w.on('error', b.emit.bind(b, 'error'));
        w.on('change', function () {
            invalidate(mfile);
        });
        fwatchers[mfile].push(w);
        fwatcherFiles[mfile].push(file);
    }

    function cacheEmpty(cache) {
        var entries = (function() {
            var keys = Object.keys(cache);
            var results = [];
            for (var i = 0; i < keys.length; i++) {
                var entry = keys[i];
                if (entry !== '_time' && entry !== '_files') {
                    results.push(entry);
                }
            }
            return results;
        })();
        return entries.length === 0;
    }

    function cleanEntry(id, file) {
        delete cache._files[file];
        delete cache._time[file];
        delete cache[id];
        return;
    }

    function update() {
        if (cacheEmpty(cache)) {
          invalid = true;
          return;
        }

        invalid = false;

        Object.keys(cache._time).forEach(function(file) {
            var stats = resolveStats(file, b);
            if (!stats || cache._time[file] !== stats.mtime.getTime()) {
                b.emit('log', 'Watchify cache: dep updated or removed: ' + path.basename(file));
                cleanEntry(cache._files[file], file);
            }
        });
    }

    function invalidate(id) {
        if (cache && cache[id]) {
            cleanEntry(id, cache[id].file);
        }
        invalid = true;
        if (fwatchers[id]) {
            fwatchers[id].forEach(function (w) {
                w.close();
            });
            delete fwatchers[id];
            delete fwatcherFiles[id];
        }
        changingDeps[id] = true;

        // wait for the disk/editor to quiet down first:
        if (!pending) setTimeout(function () {
            pending = false;
            b.emit('update', Object.keys(changingDeps));
            changingDeps = {};

        }, opts.delay || 600);
        pending = true;
    }

    b.close = function() {
        Object.keys(fwatchers).forEach(function (id) {
            fwatchers[id].forEach(function (w) { w.close(); });
        });
    };

    // TODO
    // Create an all encompassing stream-json-to-file. If one of the json's properties exceeds the
    // v8 memory limit, this will still die.
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

    // Override browserify's bundle. We want to support loading, updating, and persisting the
    // cache without having to have listeners on all the time. So we turn on the above event listeners
    // only while bundling and emitting.
    b.bundle = function(cb) {
        if (invalid) {
            invalid = false;
            if (!watch) {
                listen();
            }
            if (typeof(cb) === 'function') {
                return _bundle.call(b, cb);
            }
            else {
                return _bundle.call(b).on('end', function() {
                    if (!watch) {
                        stopListening();
                    }
                });
            }
        } else {
            if (watch) {
                setImmediate(function() {
                    Object.keys(cache).forEach(function(key) {
                        if (key === '_time' || key === '_files') return;
                        watchFile(key);
                    });
                });
                // set to true, because we didn't actual bundle anything yet, but want this
                // set for the next `update`
                b._bundled = true;
            }
            if (typeof(cb) === 'function') {
                cb(new Error('Cache is still valid.'), null);
            } else {
                return null;
            }
        }
    };

    return b;
}
