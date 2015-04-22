path = require 'path'
{fork, exec} = require 'child_process'
{EventEmitter}  = require 'events'

exports.Pitboss = class Pitboss extends EventEmitter
  constructor: (code, options) ->
    @runner = new Runner(code, options)
    @runner.on 'completed', =>
      @next()
    @q = []

  run: ({context, libraries}, callback) ->
    @q.push({context: context, libraries: libraries, callback: callback})
    @next()

  next: ->
    return false if @runner.running
    c = @q.shift()
    if c
      @runner.run({context: c.context, libraries: c.libraries}, c.callback)

# Can only run one at a time due to the blocking nature of VM
# Need to queue this up outside of the process since it's over an async channel
exports.Runner = class Runner extends EventEmitter
  constructor: (@code, @options) ->
    @options ||= {}
    @options.timeout ||= 500
    @options.heartBeatTick ||= 100
    @options.memoryLimit ||= 1024*1024
    unless @options.rssizeCommand
      if process.platform is 'darwin'
        @options.rssizeCommand = 'ps -p PID -o rss='
      else if process.platform is 'linux'
        @options.rssizeCommand = 'ps -p PID -o rssize='
    @launchFork()
    @running = false
    @callback = null

  launchFork: ->
    @proc = fork(path.join(__dirname, '../lib/forkable.js'), [], {cwd: path.join(__dirname, '..')})
    @proc.on 'message', @messageHandler
    @proc.on 'exit', @failedForkHandler
    @rssizeCommand = @options.rssizeCommand.replace('PID',@proc.pid)
    @proc.send {code: @code, timeout: (@options.timeout + 100)}

  run: ({context, libraries}, callback) ->
    return false if @running
    id = Date.now().toString() + Math.floor(Math.random() * 1000)
    msg =
      context: context
      libraries: libraries
      id: id
    @callback = callback || false
    @startTimer()
    @running = id
    @proc.send msg
    id

  disconnect: ->
    @proc.disconnect() if @proc and @proc.connected

  kill: ->
    @proc.kill("SIGKILL") if @proc and @proc.connected
    @closeTimer()

  messageHandler: (msg) =>
    @running = false
    @closeTimer()
    @emit 'result', msg
    if @callback
      if msg.error
        @callback(msg.error)
      else
        @callback(null, msg.result)
    @notifyCompleted()

  failedForkHandler: =>
    @running = false
    @closeTimer(@timer)
    @launchFork()
    error = @currentError || "Process Failed"
    @emit 'failed', error
    @callback(error) if @callback
    @notifyCompleted() if @callback

  timeout: =>
    @currentError ?= "Timedout"
    @kill()

  memoryExceeded: =>
    exec @rssizeCommand, (err, stdout, stderr) =>
      err = err || stderr

      if err
        console.error "Command #{@rssizeCommand} failed:", err

      if (not err) and parseInt(stdout, 10) > @options.memoryLimit
        @currentError = "MemoryExceeded"
        @kill()
      return
    return

  notifyCompleted: ->
    @emit 'completed'

  startTimer: ->
    @closeTimer()
    @timer = setTimeout(@timeout, @options['timeout'])
    @memoryTimer = setInterval(@memoryExceeded, @options['heartBeatTick'])

  closeTimer: ->
    clearTimeout(@timer) if @timer
    clearInterval(@memoryTimer) if @memoryTimer

