var test = require('tape');
var watchify = require('../');
var browserify = require('browserify');
var vm = require('vm');

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var split = require('split');

var os = require('os');
var tmpdir = path.join((os.tmpdir || os.tmpDir)(), 'watchify-' + Math.random());

var fileOne = path.join(tmpdir, 'main.js');
var fileTwo = path.join(tmpdir, 'foobar.js');
var fileThree = path.join(tmpdir, 'null.js');

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

function run (src) {
    var output = '';
    function log (msg) { output += msg + '\n' }
    vm.runInNewContext(src, { console: { log: log } });
    return output;
}
