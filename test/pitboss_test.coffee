{assert} = require 'chai'
{Runner, Pitboss} = require('../src/pitboss-ng')

describe "Pitboss running code", ->
  pitboss = null

  before ->
    code = """
      // EchoTron: returns the 'data' variable in a VM
      if(typeof data == 'undefined') {
        var data = null
      };
      data
    """
    pitboss = new Pitboss(code)

  after ->
    pitboss.runner.kill()

  it "should take a JSON encodable message", (done) ->
    pitboss.run context: {data: "test"}, (err, result) ->
      return done err if err

      pitboss.run context: {data: 456}, (err, resultB) ->
        return done err if err

        assert.strictEqual result, "test"
        assert.strictEqual resultB, 456
        done()


describe "Pitboss trying to access variables out of context", ->
  myVar = null
  pitboss = null

  before ->
    code = """
    if (typeof myVar == 'undefined') {
      var myVar;
    };
    myVar = "fromVM";
    myVar
    """
    myVar = "untouchable"
    pitboss = new Pitboss(code)

  after ->
    pitboss.runner.kill()

  it "should not allow for context variables changes", (done) ->

    pitboss.run context: {love: 'tender', myVar: myVar}, (err, result) ->
      assert.equal "fromVM", result
      assert.equal "untouchable", myVar
      done()


describe "Pitboss modules loading code", ->
  code = """
      console.error(data);
      data;
    """

  pitboss = null

  beforeEach ->
    pitboss = new Pitboss(code)

  afterEach ->
    pitboss.runner.kill()

  it "should not return an error when loaded module is used", (done) ->
    pitboss.run context: {data: "test"}, libraries: ['console'], (err, result) ->
      assert.equal undefined, err
      assert.equal "test", result
      done()

  it "should return an error when unknown module is used", (done) ->
    pitboss.run context: {data: "test"}, libraries: [], (err, result) ->
      assert.equal undefined, result
      assert.include err, 'VM Runtime Error: ReferenceError:'
      assert.include err, 'console is not defined'
      done()

describe "Running dubius code", ->
  code = """
      // EchoTron: returns the 'data' variable in a VM
      if(typeof data == 'undefined') {
        var data = null
      };
      data
    """

  pitboss = null

  before ->
    pitboss = new Pitboss(code)

  after ->
    pitboss.runner.kill()


  it "should take a JSON encodable message", (done) ->
    pitboss.run context: {data: 123}, (err, result) ->
      assert.equal 123, result
      done()

describe "Running shitty code", ->
  code = """
      WTF< this in not even code;
    """

  pitboss = null

  before ->
    pitboss = new Pitboss(code)

  after ->
    pitboss.runner.kill()

  it "should return the error", (done) ->
    pitboss.run context: {data: 123}, (err, result) ->
      assert.include err, 'VM Syntax Error: SyntaxError:'
      assert.include err, 'Unexpected identifier'
      assert.equal null, result
      done()

describe "Running infinite loop code", ->
  runner = null
  beforeEach ->
    @code = """
      if (typeof infinite != 'undefined' && infinite === true) {
        var a = true, b;
        while (a) {
          b = Math.random() * 1000;
          "This is an never ending loop!"
        };
      }
      "OK"
    """

  afterEach ->
    runner.kill()
    runner = null

  it "should timeout and restart fork", (done) ->
    runner = new Runner @code,
      timeout: 1000

    runner.run context: {infinite: true}, (err, result) ->
      assert.equal "Timedout", err
      runner.run context: {infinite: false}, (err, result) ->
        assert.equal "OK", result
        done()

  it "should happily allow for process failure (e.g. ulimit kills)", (done) ->
    runner = new Runner @code,
      timeout: 1000

    runner.run context: {infinite: true}, (err, result) ->
      assert.equal "Process Failed", err
      runner.run context: {infinite: false}, (err, result) ->

        assert.equal "OK", result
        done()

    # trigger manual kill
    runner.proc.kill('SIGKILL')
    return


describe "Running code which causes memory leak", ->
  runner = null
  doneCalled = false

  before ->
    code = """
      var a = 'a', b = true;
      while (b) {
        b = !!b;
        a = a + "--------------------------++++++++++++++++++++++++++++++++++a";
      };
      b
      """

    runner = new Runner code,
      timeout: 15000
      memoryLimit: 1024*100

  after ->
    runner?.kill()

  it "should end with MemoryExceeded error", (done) ->
    runner.run context: {infinite: true}, (err, result) ->
      assert.equal "MemoryExceeded", err
      if not doneCalled
        doneCalled = true
        return done()
