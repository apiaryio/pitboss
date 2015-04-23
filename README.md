[![Build
Status](https://secure.travis-ci.org/apiaryio/pitboss.png)](http://travis-ci.org/apiaryio/pitboss)

![Pitboss](http://s3.amazonaws.com/img.mdp.im/renobankclubinside4.jpg_%28705%C3%97453%29-20120923-100859.jpg)

# Pitboss-NG (next gen)

## A module for running untrusted code

```javascript
var Pitboss = require('pitboss-ng').Pitboss;

var untrustedCode = "var a = !true; a";

var sandbox = new Pitboss(untrustedCode, {
  memoryLimit: 32*1024, // 32 MB memory limit (default is 64 MB)
  timeout: 5*1000, // 5000 ms to perform tasks or die (default is 500 ms = 0.5 s)
  heartBeatTick: 100 // interval between memory-limit checks (default is 100 ms)
});

sandbox.run({
  context: {
    'foo': 'bar',
    'key': 'value' // context must be JSON.stringify positive
  },
  libraries: {
    myModule: path.join(__dirname, './my/own/module')
    // will be available as global "myModule" variable for the untrusted code
  }
}, function callback (err, result) {
  sandbox.kill(); // don't forget to kill the sandbox, if you don't need it anymore
});

// OR other option: libraries can be an array of system modules
sandbox.run({
  context: {},
  libraries: ['console', 'lodash'] // we will be using global "lodash" & "console"
}, function callback (err, result) {
  // finished, kill the sandboxed process
  sandbox.kill();
});
```

### Runs JS code and returns the last eval'd statement

```javascript
var assert = require('chai').assert;
var Pitboss = require('pitboss-ng').Pitboss;

var code = "num = num % 5;\nnum;"

var pitboss = new Pitboss(code);

pitboss.run({context: {'num': 23}}, function (err, result) {
  assert.equal(3, result);
  pitboss.kill(); // pitboss is not needed anymore, so kill the sandboxed process
});
```

### Allows you to pass you own libraries into sandboxed content

```javascript
var assert = require('chai').assert;
var Pitboss = require('pitboss-ng').Pitboss;

var code = "num = num % 5;\n console.log('from sandbox: ' + num);\n num;"

var pitboss = new Pitboss(code);

pitboss.run({context: {'num': 23}, libraries: ['console']}, function (err, result) {
  // will print "from sandbox: 5"
  assert.equal(3, result);
  pitboss.kill(); // pitboss is not needed anymore, so kill the sandboxed process
});
```

### Handles processes that take too damn long

```javascript
var assert = require('chai').assert;
var Pitboss = require('pitboss-ng').Pitboss;

var code = "while(true) { num % 3 };";

var pitboss = new Pitboss(code, {timeout: 2000});
pitboss.run({context: {'num': 23}}, function (err, result) {
  assert.equal("Timedout", err);
  pitboss.kill();
});
```

### Doesn't choke under pressure (or shitty code)

```javascript
var assert = require('chai').assert;
var Pitboss = require('pitboss-ng').Pitboss;

var code = "Not a JavaScript at all!";

var pitboss = new Pitboss(code, {timeout: 2000});

pitboss.run({context: {num: 23}}, function (err, result) {
  assert.include(err, "VM Syntax Error");
  assert.include(err, "Unexpected identifier");
  pitboss.kill();
});
```

### Doesn't handle this! But 'ulimit' or 'pidusage' does!

```javascript
var assert = require('chai').assert;
var Pitboss = require('pitboss-ng').Pitboss;

var code = "var str = ''; while (true) { str = str + 'Memory is a finite resource!'; }";

var pitboss = new Pitboss(code, {timeout: 10000});

pitboss.run({context: {num: 23}}, function (err, result) {
  assert.equal("Process failed", err);
  pitboss.kill();
});
```

And since Pitboss-NG forks each process, ulimit kills only the runner
