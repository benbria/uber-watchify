# uber-watchify Changelog

### v3.4.1
  - add `-n` and `--no-watch` to command line interface. (Omitted in code reset)

### v3.4.0
  - Reset codebase to `watchify`@3.3.1
  - Added `uber-watchify` changes on top of 3.3.1
  - removed hand-rolled `b.write` to use `jsonfile.writeFileSync`
  - cleaned up some logic
  - Previous code will live in frozen branch `legacy-2.4.0`

### v2.4.0
  - Fix for issue #3 (unable to use `browserify` > 9.0.7)

### v2.3.2
  - Fix typo for logging
  - Check if a directory exists before writing cache file

### v2.3.1
  - Merged in upstream changes
  - Fixed a bug in cli

### v2.0.1
  - Initial release on top of `watchify`@2.0.0



