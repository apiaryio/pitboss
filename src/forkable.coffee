vm = require 'vm'
util = require 'util'
clone = require 'clone'

script = null
errorStatus = 0
errorStatusMsg = null
STATUS =
  'FATAL': 1

timeout = undefined

process.on 'message', (msg) ->
  if msg['code']
    if msg['timeout']
      timeout = parseInt(msg['timeout'], 10)
    create(msg['code'])
  else
    run(msg)

create = (code) ->
  code = "\"use strict\";\n#{code}"
  try
    if vm.Script
      script = new vm.Script code, {filename: 'sandbox'}
    else
      script = vm.createScript(code)
  catch err
    # Fatal, never try again
    errorStatus = STATUS['FATAL']
    errorStatusMsg = "VM Syntax Error: #{err}"

run = (msg) ->
  if isFatalError()
    error errorStatusMsg, msg.id
    return false
  unless script
    error "No code to run"
    return false

  msg.context ?= {}
  context = vm.createContext clone(msg.context)

  if msg?.libraries
    if Array.isArray msg?.libraries
      for lib in msg?.libraries
        context[lib] = require lib
    else if typeof(msg?.libraries) == 'object'
      for varName, lib of msg?.libraries
        context[varName] = require lib
    else
      return error "Pitboss error: Libraries must be defined by an array or by an object.", msg.id
  try
    res =
      result: script.runInNewContext(context || {}, timeout: timeout) || null # script can return undefined, ensure it's null
      id: msg.id
    message(res)
  catch err
    error "VM Runtime Error: #{err}", msg.id

isFatalError = ->
  if errorStatus == STATUS['FATAL']
    true
  else
    false

error = (msg, id) ->
  id ||= null
  message
    error: msg
    id: id

message = (msg) ->
  process.send msg
