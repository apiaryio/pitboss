[![Build
Status](https://secure.travis-ci.org/apiaryio/pitboss.png)](http://travis-ci.org/apiaryio/pitboss)

![Pitboss](http://s3.amazonaws.com/img.mdp.im/renobankclubinside4.jpg_%28705%C3%97453%29-20120923-100859.jpg)

# Pitboss
## A module for running untrusted code


### Runs JS code and returns the last eval'd statement

    code = """
      num = num % 5;
      num;
    """
    pitboss = new Pitboss(code)
    pitboss.run {num: 23}, (err, result) ->
      assert.equal 3, result

### Handles processes that take too damn long

    code = """
      while(true) { num % 3 };
    """
    pitboss = new Pitboss code
      timeout: 2000
    pitboss.run {num: 23}, (err, result) ->
      assert.equal "Timeout", err

### Doesn't choke under pressure(or shitty code)

    code = """
      What the fuck am I writing?
    """
    pitboss = new Pitboss code
      timeout: 2000
    pitboss.run {num: 23}, (err, result) ->
      assert.equal "VM Syntax Error: SyntaxError: Unexpected identifier", err

### Doesn't handle this! But 'ulimit' does!

    code = """
      str = ''
      while(true) { str = str + "Memory is a finite resource!" };
    """
    pitboss = new Pitboss code
      timeout: 10000
    pitboss.run {num: 23}, (err, result) ->
      assert.equal "Process failed", err

And since Pitboss forks each process, ulimit kills only the runner
