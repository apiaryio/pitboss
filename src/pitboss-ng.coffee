path = require 'path'
{fork} = require 'child_process'
{EventEmitter}  = require 'events'
pusage = require 'pidusage'

exports.Pitboss = class Pitboss
  constructor: (code, options) ->
    @runner = new Runner(code, options)
    @queue = []
    @runner.on 'completed', @next.bind(@)

  run: ({context, libraries}, callback) ->
    @queue.push({context: context, libraries: libraries, callback: callback})
    @next()
    return

  kill: ->
    @runner?.kill(1)

  next: ->
    return false if @runner.running
    c = @queue.shift()
    if c
      @runner.run({context: c.context, libraries: c.libraries}, c.callback)
    return

# Can only run one at a time due to the blocking nature of VM
# Need to queue this up outside of the process since it's over an async channel
exports.Runner = class Runner extends EventEmitter
  constructor: (@code, @options) ->
    @options ||= {}
    @options.memoryLimit ||= 64*1024 # memoryLimit is in kBytes, so 64 MB here
    @options.timeout ||= 500
    @options.heartBeatTick ||= 100
    @callback = null
    @running = false
    @launchFork()
    super()

  launchFork: ->
    if @proc
      @proc.removeAllListeners? 'exit'
      @proc.removeAllListeners? 'message'
      if @proc.connected
        @proc.kill('SIGTERM')
    @proc = fork(path.join(__dirname, '../lib/forkable.js'))
    @proc.on 'message', @messageHandler
    @proc.on 'exit', @failedForkHandler
    @proc.send {code: @code, timeout: (@options.timeout + 100)}
    return

  run: ({context, libraries}, callback) =>
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

  disconnect: =>
    @proc.disconnect() if @proc and @proc.connected
    return

  kill: (dieWithoutRestart) ->
    if @proc and @proc.connected
      if dieWithoutRestart
        @proc.removeAllListeners 'exit'
        @proc.removeAllListeners 'message'
      @proc.kill("SIGTERM")
    @closeTimer()
    return

  messageHandler: (msg) =>
    @running = false
    @closeTimer()
    @emit 'result', msg
    if @callback
      cb = @callback
      @callback = false
      if msg.error
        cb(msg.error)
      else
        cb(null, msg.result)
    @notifyCompleted()
    return

  # try to launch the subprocess again, BUT notify callback (if any)
  failedForkHandler: =>
    @running = false
    @closeTimer(@timer)
    @launchFork()
    error = @currentError || "Process Failed"
    @emit 'failed', error
    @callback(error) if @callback
    @notifyCompleted()
    return

  timeout: =>
    @currentError ?= "Timedout"
    @kill()
    return

  memoryExceeded: =>
    unless @proc?.pid
      return

    pid = @proc.pid
    pusage.stat @proc.pid, (err, stat = {}) =>
      if err
        if @running # still running and some error occurs
          console.error "Process memory usage command failed", err

      pusage.unmonitor(pid)

      # memoryLimit is in kBytes, whereas stat.memory in bytes
      if (not err) and stat.memory > (@options.memoryLimit * 1024)
        @currentError = "MemoryExceeded"
        @kill()
      return
    return

  notifyCompleted: =>
    @running = false
    @emit 'completed'
    return

  startTimer: ->
    @closeTimer()
    @timer = setTimeout(@timeout, @options['timeout'])
    @memoryTimer = setInterval(@memoryExceeded, @options['heartBeatTick'])
    return

  closeTimer: ->
    if @timer
      clearTimeout(@timer)
      @timer = null
    if @memoryTimer
      clearInterval(@memoryTimer)
      @memoryTimer = null
    return

