var test = require('tape');
var path = require('path');
var proxyquire = require('proxyquire');

test('fromArgs parses uber options', function (t) {
    t.plan(4);
    var options, bopts;
    var fromArgs = proxyquire('../bin/args', {
        "../": function(b, opts) {
            options = opts;
            bopts = b._options;
        }
    });
    fromArgs(['-n', 'index.js']);
    t.equal(options.watch, false);
    fromArgs(['--no-watch', 'index.js']);
    t.equal(options.watch, false);
    fromArgs(['-cf', path.resolve(__dirname, '../test-fixtures/cache.json'), 'index.js']);
    t.equal(bopts.cache._time['index.js'], 1439317977000);
    fromArgs(['--cache-file', path.resolve(__dirname, '../test-fixtures/cache.json'), 'index.js']);
    t.equal(bopts.cache._time['index.js'], 1439317977000);
});

