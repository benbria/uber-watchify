# uber-watchify

[watchify](https://github.com/substack/watchify), with some bonus features.

## NOTICE: uber-watchify is currently broken with browserify 9.0.8

If you're running into trouble, then downgrade your browserify to 9.0.7.  Details [here](https://github.com/substack/node-browserify/issues/1203).


`watchify` does some great stuff. `uber-watchify` takes it one step further. For big bundles,
with lots of transforms, the bundling takes a long time (with jQuery and tranforms we are talking around
30 seconds). If you have incorporated watchify into your build system, and have it run on every start up,
this can be costly. Watchify already uses browserify's internal cache, but it only does so in memory. `uber-watchify`
attempts to solve this problem by persisting the cache to disk.

# additions

1. Load/Write a cache file

accept a new option to load/write a pre-existing cache file, namely, `cacheFile`. Therefore, first builds run off the cache, as
well as subsequent ones. Provide a method `w.write()`, which at the user's discretion, will write out the cache to disk.

2. Add an explicit `watch` option

original watchify _always_ watches. If you don't want to write a separate task, and also use uber-watchify for just
regular build commands, you can turn off the watching so the process exits.

3. If nothing changed, do nothing.

If you start a build, kill the process, and restart it while nothing in browserify has changed, don't do anything.
`w.bundle()` will now check all the modification times of the files you are bundling. If nothing has changed, `w.bundle()` will
simply return `null`.

# example

```javascript
var cacheFile = path.resolve(__dirname, 'browserify/benbria.cache.json');
var w = watchify(browserify({
    cache: watchify.getCache(cacheFile),
    packageCache: {},
    fullPaths: true,
    entries: [path.resolve(__dirname, 'browserify/benbria.coffee')],
    extensions: ['.js']
}), {
    cacheFile: cacheFile
});

```

then to watch:

```javascript
var bundle = function() {
    var stream = w.bundle();
    if (!stream) {
        return;
    }
    stream
    .pipe(source('bundle.js'))
    .pipe(gulp.dest('browserify'))
    .on('end', function() {
        w.write();
    });
};
w.on('update', bundle);
bundle();
```

# new api changes

## option `cacheFile`

A full path to the cache file you wish to save to. It will be created if it doesn't exist

## option `watch`

Whether to setup watch listeners. Defaults to `true`

## method `watchify.getCache(file)`

convenience method to load a `json` cache file, and if it doesn't exist will give you a blank object.
Pass this to browserify's `cache` option.

## method `w.write()`

write out the cache to the specified `cacheFile`. Generally you do this once your transform stream gets its `end`
event.

## api `w.bundle([cb])`

same as before, but will now return `null` if the cache is still valid. (a new cache is invalid)

# new cli options

## --cache-file or -cf

A full path to the cache file you wish to save to. It will be created if it doesn't exist

## --no-watch or -n

Whether to setup watch listeners. Defaults to `true`

# example

`>uber-watchify main.js --no-watch --cache-file main.browserify.cache.json -o bundle.js`

# license

MIT
