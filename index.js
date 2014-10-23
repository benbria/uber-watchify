'use strict';
var through = require('through2');
var fs = require('fs');
var path = require('path');
var chokidar = require('chokidar');

module.exports = watchify;
module.exports.args = {
    cache: {}, packageCache: {}, fullPaths: true
};

function watchify (b, opts) {
    if (!opts) opts = {};
    var cacheFile = opts.cacheFile;
    var watch = !!opts.watch;
    var cache = b._options.cache || (function(){
        try {
            var c = fs.readFileSync(cacheFile);
            b._options.cache = c;
            return c;
        } catch (err) {
            return {};
        }
    })();
    var pkgcache = b._options.packageCache;
    var changingDeps = {};
    var pending = false;
    if (watch) listen();
    reset();

    function dep(dep) {
        if (typeof dep.id === 'string') {
            cache[dep.id] = dep;
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

    function watchFile (file) {
        fs.lstat(file, function (err, stat) {
            if (err || stat.isDirectory()) return;
            watchFile_(file);
        });
    }

    function watchFile_ (file) {
        if (!fwatchers[file]) fwatchers[file] = [];
        if (!fwatcherFiles[file]) fwatcherFiles[file] = [];
        if (fwatcherFiles[file].indexOf(file) >= 0) return;

        var w = chokidar.watch(file, {persistent: true});
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
        w.on('error', b.emit.bind(b, 'error'));
        w.on('change', function () {
            invalidate(mfile);
        });
        fwatchers[mfile].push(w);
        fwatcherFiles[mfile].push(file);
    }

    function invalidate (id) {
        if (cache) delete cache[id];
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

    b.close = function () {
        Object.keys(fwatchers).forEach(function (id) {
            fwatchers[id].forEach(function (w) { w.close(); });
        });
    };

    b.write = function(opts, cb) {
        if (!opts) opts = {};
        var sync = opts.sync || true;
        var writeFn = !sync && typeof(cb) === 'function' ? fs.writeFile : fs.writeFileSync;
        writeFn(cacheFile, JSON.stringify(cache), {}, cb);
    }

    var _bundle = b.bundle;

    // Override browserify's bundle. We want to support loading, updating, and persisting the
    // cache without having to have listeners on all the time. So we turn on the above event listeners
    // only while bundling and emitting.
    b.bundle = function() {
        if (!watch) {
            listen();
        }
        return _bundle.call(b).on('end', function() {
            console.log('Got the end event on the bundle stream');
            if (!watch) {
                stopListening();
            }
        });
    }

    return b;
}
