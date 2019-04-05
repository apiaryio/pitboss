const vm = require('vm');
const util = require('util');
const clone = require('clone');

let script = null;
let errorStatusMsg = null;
let errorStatus = 0;
let timeout = undefined;

const STATUS = { FATAL: 1 };

process.on('message', function onMessage(msg) {
  if (msg['code']) {
    if (msg['timeout']) {
      timeout = parseInt(msg['timeout'], 10);
    }
    create(msg['code']);
  } else {
    run(msg);
  }
});

function create(code) {
  var codeForVm, err;
  codeForVm = `"use strict";\n${code}`;
  try {
    if (vm.Script) {
      script = new vm.Script(codeForVm, {
        filename: 'sandbox',
        timeout
      });
    } else {
      script = vm.createScript(codeForVm);
    }
  } catch (err) {
    // Fatal, never try again
    errorStatus = STATUS['FATAL'];
    errorStatusMsg = `VM Syntax Error: ${err}`;
  }
};

function run(msg) {
  if (isFatalError()) {
    error(errorStatusMsg, msg.id);
    return false;
  }

  if (!script) {
    error("No code to run");
    return false;
  }

  if (msg.context == null) {
    msg.context = {};
  }

  const context = vm.createContext(clone(msg.context));

  if (msg.libraries) {
    if (Array.isArray(msg.libraries)) {
      msg.libraries.forEach((lib) => {        
        context[lib] = require(lib);
      });
    } else if (typeof msg.libraries === 'object') {
      Object.keys(msg.libraries).forEach((libKey) => {
        context[libKey] = require(msg.libraries[libKey]);
      });
    } else {
      return error("Pitboss error: Libraries must be defined by an array or by an object.", msg.id);
    }
  }
  try {
    const res = {
      result: script.runInNewContext(context || {}, {
        timeout: timeout
      }) || null, // script can return undefined, ensure it's null
      id: msg.id
    };
    message(res);
  } catch (err) {
    error(`VM Runtime Error: ${err}`, msg.id);
  }
};

function isFatalError() {
  if (errorStatus === STATUS['FATAL']) {
    return true;
  } else {
    return false;
  }
};

function error(msg, id = null) {
  return message({
    error: msg,
    id
  });
};

function message(msg) {
  process.send(msg);
};
