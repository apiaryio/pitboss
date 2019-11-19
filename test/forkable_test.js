const { assert } = require('chai');
const { fork } = require('child_process');

describe('The forkable process', function() {
  const referenceErrorMsg = 'VM Runtime Error: ReferenceError:';
  const syntaxErrorMsg = 'VM Runtime Error: SyntaxError:';
  const typeErrorMsg = 'VM Runtime Error: TypeError:';

  beforeEach(function(done) {
    this.runner = fork('./lib/forkable.js');
    this.runner.once('message', (msg) => done(msg !== 'ready'));
  });

  afterEach(function() {
    if (this.runner != null) {
      if (typeof this.runner.kill === 'function') {
        this.runner.kill();
      }
    }
    this.runner = null;
  });

  describe('basic operation', function() {
    beforeEach(function() {
      this.code = `// EchoTron: returns the 'data' variable in a VM
      if(typeof data === "undefined") {
        var data = 1
      };
      data`;
    });

    it('run without errors', function(done) {
      this.runner.on('message', function(msg) {
        assert.equal(msg.id, '123');
        assert.strictEqual(msg.result, 1);
        done();
      });
      this.runner.send({
        code: this.code,
      });
      this.runner.send({
        id: '123',
        context: {},
      });
    });
  });

  describe('running code that assumes priviledge', function() {
    beforeEach(function() {
      this.code = `require('http');
      123;`;
    });

    it('should fail on require', function(done) {
      this.runner.on('message', function(msg) {
        assert.equal(msg.id, '123');
        assert.equal(msg.result, null);
        assert.include(msg.error, 'require is not defined');
        assert.include(msg.error, referenceErrorMsg);
        done();
      });
      this.runner.send({
        code: this.code,
      });
      this.runner.send({
        id: '123',
        context: {},
      });
    });
  });

  describe('Running code that uses JSON global', function() {
    beforeEach(function() {
      this.code = 'JSON.stringify({});';
    });

    it('should work as expected', function(done) {
      this.runner.on('message', function(msg) {
        assert.equal(msg.id, '123');
        assert.equal(msg.result, '{}');
        done();
      });
      this.runner.send({
        code: this.code,
      });
      this.runner.send({
        id: '123',
        context: {},
      });
    });
  });

  describe('Running code that uses Buffer', function() {
    beforeEach(function() {
      this.code = `var buf = new Buffer('abc');
      buf.toString();`;
    });

    it('should keep working', function(done) {
      this.runner.on('message', function(msg) {
        assert.equal(msg.id, 'XYZ');
        assert.equal(msg.result, 'abc');
        done();
      });
      this.runner.send({
        code: this.code,
      });
      this.runner.send({
        id: 'XYZ',
        context: {},
      });
    });
  });
  describe('Running shitty code', function() {
    beforeEach(function() {
      this.code = "This isn't even Javascript!!!!";
    });

    it('should return errors on running of bad syntax code', function(done) {
      this.runner.on('message', function(msg) {
        assert.equal(msg.id, '123');
        assert.equal(msg.result, void 0);
        assert.include(msg.error, syntaxErrorMsg);
        assert.include(msg.error, 'Unexpected identifier');
        done();
      });
      this.runner.send({
        code: this.code,
      });
      this.runner.send({
        id: '123',
        context: {},
      });
    });
  });
  describe('Running runtime error code', function() {
    beforeEach(function() {
      this.code = `var foo = [];
      foo[data][123];`;
    });

    it('should happily suck up and relay the errors', function(done) {
      this.runner.on('message', function(msg) {
        assert.equal(msg.id, '123');
        assert.equal(msg.result, void 0);
        assert.include(msg.error, typeErrorMsg);
        assert.include(msg.error, "Cannot read property '123' of undefined");
        done();
      });
      this.runner.send({
        code: this.code,
      });
      this.runner.send({
        id: '123',
        context: {
          data: 'foo',
        },
      });
    });
  });

  describe('requiring libraries in context', function() {
    describe('from array', function() {
      beforeEach(function() {
        this.code = `if(vm == undefined){
          throw('vm is undefined');
        }
        null`;
      });

      it('should require and pass library to the context under variriable with module name', function(done) {
        this.runner.on('message', function(msg) {
          assert.equal(msg.id, '123');
          assert.equal(msg.result, null);
          assert.equal(msg.error, null);
          done();
        });
        this.runner.send({
          code: this.code,
        });
        this.runner.send({
          id: '123',
          context: {
            data: 'foo',
          },
          libraries: ['vm'],
        });
      });
    });

    describe('from object for specifiyng context variable name', function() {
      beforeEach(function() {
        this.code = `if(vmFooBar == undefined){
          throw('vmFooBar is undefined');
        }
        null`;
      });

      it('should require and pass library to the context under variable with key name', function(done) {
        this.runner.on('message', function(msg) {
          assert.equal(msg.id, '123');
          assert.equal(msg.result, null);
          assert.equal(msg.error, null);
          done();
        });
        this.runner.send({
          code: this.code,
        });
        this.runner.send({
          id: '123',
          context: {
            data: 'foo',
          },
          libraries: {
            vmFooBar: 'vm',
          },
        });
      });
    });

    describe('from unintentional other type', function() {
      beforeEach(function() {
        this.code = `var a = 'result';
        a`;
      });

      it('should raise and exception telling that it expects array or object', function(done) {
        this.runner.on('message', function(msg) {
          assert.equal(msg.id, '1234');
          assert.equal(msg.result, void 0);
          assert.equal(
            msg.error,
            'Pitboss error: Libraries must be defined by an array or by an object.'
          );
          done();
        });
        this.runner.send({
          code: this.code,
        });
        this.runner.send({
          id: '1234',
          context: {
            data: 'foo',
          },
          libraries: 'vm',
        });
      });
    });
  });
});
