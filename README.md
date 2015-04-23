[![Build
Status](https://secure.travis-ci.org/apiaryio/pitboss.png)](http://travis-ci.org/apiaryio/pitboss)

![Pitboss](http://s3.amazonaws.com/img.mdp.im/renobankclubinside4.jpg_%28705%C3%97453%29-20120923-100859.jpg)

# Pitboss-NG (next gen)

## A module for running untrusted code


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
