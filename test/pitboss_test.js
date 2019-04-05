const assert = require('chai').assert;

const { Pitboss, Runner } = require('../lib/pitboss-ng');

describe('Pitboss running code', () => {
  let pitboss = null;
  const code = `// EchoTron: returns the 'data' variable in a VM
  if(typeof data === 'undefined') {
    var data = null
  };
  data`;

  before(function() {
    pitboss = new Pitboss(code);
  });

  after(function() {
    pitboss.kill();
  });

  it('should take a JSON encodable message', function(done) {
    pitboss.run(
      {
        context: {
          data: 'test',
        },
      },
      function(err, result) {
        if (err) {
          done(err);
          return;
        }
        pitboss.run(
          {
            context: {
              data: 456,
            },
          },
          function(err, resultB) {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(result, 'test');
            assert.strictEqual(resultB, 456);
            done();
          }
        );
      }
    );
  });
});

describe('Pitboss trying to access variables out of context', function() {
  let pitboss = null;
  let myVar = null;

  before(function() {
    const code = `if (typeof myVar === 'undefined') {
        var myVar;
      };
      myVar = "fromVM";
      myVar`;
    myVar = 'untouchable';
    pitboss = new Pitboss(code);
  });

  after(function() {
    pitboss.kill();
  });

  it('should not allow for context variables changes', function(done) {
    pitboss.run(
      {
        context: {
          love: 'tender',
          myVar: myVar,
        },
      },
      function(err, result) {
        assert.equal(result, 'fromVM');
        assert.equal(myVar, 'untouchable');
        done();
      }
    );
  });
});

describe('Pitboss modules loading code', function() {
  let pitboss = null;
  const code = `os.platform();
  console.log(data);
  data`;

  beforeEach(function() {
    pitboss = new Pitboss(code);
  });

  afterEach(function() {
    pitboss.kill();
  });

  it('should not return an error when loaded module is used', function(done) {
    pitboss.run(
      {
        context: {
          data: 'test',
        },
        libraries: ['os'],
      },
      function(err, result) {
        assert.isNull(err);
        assert.equal(result, 'test');
        done();
      }
    );
  });

  it('should return an error when unknown module is used', function(done) {
    pitboss.run(
      {
        context: {
          data: 'test',
        },
        libraries: [],
      },
      function(err, result) {
        assert.isUndefined(result);
        assert.include(err.toString(), 'VM Runtime Error: ReferenceError:');
        assert.include(err.toString(), 'os is not defined');
        done();
      }
    );
  });
});

describe('Running dubius code', function() {
  let pitboss = null;
  const code = `// EchoTron: returns the 'data' variable in a VM
    if(typeof data === 'undefined') {
      var data = null
    };
    data`;

  before(function() {
    pitboss = new Pitboss(code);
  });

  after(function() {
    pitboss.kill();
  });

  it('should take a JSON encodable message', function(done) {
    pitboss.run(
      {
        context: {
          data: 123,
        },
        libraries: ['console'],
      },
      function(err, result) {
        assert.equal(result, 123);
        done();
      }
    );
  });
});

describe('Running shitty code', function() {
  let pitboss = null;
  const code = 'WTF< this in not even code;';

  before(function() {
    pitboss = new Pitboss(code);
  });

  after(function() {
    pitboss.kill();
  });

  it('should return the error', function(done) {
    pitboss.run(
      {
        context: {
          data: 123,
        },
      },
      function(err, result) {
        assert.include(err, 'VM Syntax Error: SyntaxError:');
        assert.include(err, 'Unexpected identifier');
        assert.isUndefined(result);
        done();
      }
    );
  });
});

describe('Running infinite loop code', function() {
  let runner = null;
  const code = `if (typeof infinite != 'undefined' && infinite === true) {
    var a = true, b;
    while (a) {
      b = Math.random() * 1000;
      "This is an never ending loop!"
    };
  }
  "OK"`;

  afterEach(function() {
    runner.kill(1);
    runner = null;
  });

  it('should timeout and restart fork', function(done) {
    runner = new Runner(code, {
      timeout: 1000,
    });

    runner.run(
      {
        context: {
          infinite: true,
        },
      },
      function(err, result) {
        assert.equal('Timedout', err);
        runner.run(
          {
            context: {
              infinite: false,
            },
          },
          function(err, result) {
            assert.equal(result, 'OK');
            done();
          }
        );
      }
    );
  });

  it('should happily allow for process failure (e.g. ulimit kills)', function(done) {
    runner = new Runner(code, {
      timeout: 1000,
    });

    runner.run(
      {
        context: {
          infinite: true,
        },
      },
      function(err, result) {
        assert.equal('Process Failed', err);
        runner.run(
          {
            context: {
              infinite: false,
            },
          },
          function(err, result) {
            assert.equal(result, 'OK');
            done();
          }
        );
      }
    );

    runner.proc.kill('SIGKILL');
  });
});

describe('Running code which causes memory leak', function() {
  let runner = null;

  before(function() {
    const code = `
      var a = 'a', b = true;
      while (b) {
        b = !!b;
        a = a + "--------------------------++++++++++++++++++++++++++++++++++a";
      };
      b`;
    runner = new Runner(code, {
      timeout: 15000,
      memoryLimit: 1024 * 100,
    });
  });

  after(function() {
    runner.kill(1);
  });

  it('should end with MemoryExceeded error', function(done) {
    runner.run(
      {
        context: {
          infinite: true,
        },
      },
      function(err, result) {
        assert.equal(err, 'MemoryExceeded');
        done();
      }
    );
  });
});
