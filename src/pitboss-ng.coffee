path = require 'path'
{fork, exec} = require 'child_process'
{EventEmitter}  = require 'events'

exports.Pitboss = class Pitboss
  constructor: (code, options) ->
    @runner = new Runner(code, options)
    @queue = []
    @runner.on 'completed', @next.bind(@)

  run: ({context, libraries}, callback) ->
    @queue.push({context: context, libraries: libraries, callback: callback})
    @next()
    return

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
    unless @options.rssizeCommand
      if process.platform is 'darwin'
        @options.rssizeCommand = 'ps -p PID -o rss='
      else if process.platform is 'linux'
        @options.rssizeCommand = 'ps -p PID -o rssize='
    @launchFork()
    @running = false
    @callback = null
    super()

  launchFork: ->
    @proc = fork(path.join(__dirname, '../lib/forkable.js'))
    @proc.on 'message', @messageHandler
    @proc.on 'exit', @failedForkHandler
    @rssizeCommand = @options.rssizeCommand.replace('PID',@proc.pid)
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

  kill: ->
    @proc.kill("SIGKILL") if @proc and @proc.connected
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
    exec @rssizeCommand, (err, stdout, stderr) =>
      err = err || stderr

      if err
        console.error "Command #{@rssizeCommand} failed:", err

      if (not err) and parseInt(stdout, 10) > @options.memoryLimit
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

