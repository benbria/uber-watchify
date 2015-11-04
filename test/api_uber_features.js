var test = require('tape');
var watchify = require('../');
var browserify = require('browserify');
var vm = require('vm');
var lessify = require('node-lessify');
var xtend = require('xtend');

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var split = require('split');

var os = require('os');
var tmpdir = path.join((os.tmpdir || os.tmpDir)(), 'watchify-' + Math.random());

var fileOne = path.join(tmpdir, 'main.js');
var fileTwo = path.join(tmpdir, 'foobar.js');
var fileThree = path.join(tmpdir, 'null.js');
var fileFour = path.join(tmpdir, 'less.js');

var lessOne = path.join(tmpdir, 'less.less');
var lessTwo = path.join(tmpdir, 'less2.less');

mkdirp.sync(tmpdir);
fs.writeFileSync(fileOne, 'console.log(123456)');

test('api watch off', function (t) {
    t.plan(3);
    var w = watchify(browserify(fileOne, watchify.args()), {
        watch: false
    });
    w.on('update', function () {
        t.fail('Should not get an update event');
    });
    w.bundle(function (err, src) {
        t.ifError(err);
        t.equal(run(src), '123456\n');
        setTimeout(function () {
            fs.writeFile(fileOne, 'console.log(333)', function (err) {
                t.ifError(err);
            });
        }, 1000);
    });
});

fs.writeFileSync(fileTwo, 'console.log("boom")');

test('api cacheFile', function (t) {
    t.plan(6);
    var cacheFile = path.join(tmpdir, 'api.cache.json');
    var w = watchify(browserify(fileTwo, watchify.args()), {
        cacheFile: cacheFile
    });
    w.on('update', function () {
        var s = w.bundle(function (err, src) {
            t.ifError(err);
            t.equal(run(src), '333\n');
            w.close();
        });
        s.on('end', function() {
            w.write();
            var cache = watchify.getCache(cacheFile);
            t.equal(typeof(cache[fileTwo]), 'object');
        })
    });
    w.bundle(function (err, src) {
        t.ifError(err);
        t.equal(run(src), 'boom\n');
        setTimeout(function () {
            fs.writeFile(fileTwo, 'console.log(333)', function (err) {
                t.ifError(err);
            });
        }, 1000);
    });
});

fs.writeFileSync(fileThree, 'console.log("nope")');

test('api no change null', function(t) {
    t.plan(3);
    var cacheFile = path.join(tmpdir, 'null.cache.json');
    var w = watchify(browserify(fileThree, watchify.args()), {
        cacheFile: cacheFile,
        watch: false
    });
    var stream = w.bundle(function(err, src) {
        t.ifError(err);
        t.equal(run(src), 'nope\n');
        w.close();
        var stream = w.bundle();
        t.equal(stream, null);
    });
});

fs.writeFileSync(fileFour, 'require("./less.less")');
fs.writeFileSync(lessOne, '@import "./less2.less";');
fs.writeFileSync(lessTwo, 'html { color: red; }');

test('recompile transform dependents', function(t) {
    t.plan(9);

    var cacheFile = path.join(tmpdir, 'transform.cache.json');

    var browserifyInstance = function() {
        return watchify(
            browserify(fileFour, xtend(watchify.args(), {
                cache: watchify.getCache(cacheFile)
            })),
            {
                cacheFile: cacheFile,
                watch: false
            }
        )
            .transform(lessify);
    };

    var w = browserifyInstance();

    w.bundle(function (err, src) {
        t.ifError(err);
        t.notEqual(src.toString('utf8').indexOf('color:red'), -1);

        w.close();
        w.write();

        setTimeout(function () {
            fs.writeFile(lessTwo, 'html { color: green; }', function (err) {
                t.ifError(err);

                w = browserifyInstance();

                w.bundle(function (err, src) {
                    t.ifError(err);
                    t.assert(src, 'rebundled');
                    // :TRICKY: `src` can be undefined if rebundling didn't happen.
                    t.notEqual((src || new Buffer('')).toString('utf8').indexOf('color:green'), -1);

                    w.close();
                    w.write();

                    var cache = watchify.getCache(cacheFile);

                    var lessOneRealPath = fs.realpathSync(lessOne);
                    var lessTwoRealPath = fs.realpathSync(lessTwo);

                    var expectedTransformDeps = {};
                    expectedTransformDeps[lessOneRealPath] = [lessTwoRealPath];
                    t.deepEqual(cache._transformDeps, expectedTransformDeps);

                    t.assert(cache._files[lessOneRealPath], 'lessOne is cached');
                    t.assert(cache._files[lessTwoRealPath], 'lessTwo is cached');
                });
            });
        }, 1000);
    });
});

function run (src) {
    var output = '';
    function log (msg) { output += msg + '\n' }
    vm.runInNewContext(src, { console: { log: log } });
    return output;
}
