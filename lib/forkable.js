const { VM } = require('vm2');
const clone = require('clone');

let sandboxedCode = null;
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
  sandboxedCode = `"use strict";\n${code}\n`;
};

function run(msg) {
  if (isFatalError()) {
    error(errorStatusMsg, msg.id);
    return false;
  }

  if (!sandboxedCode) {
    error("No code to run");
    return false;
  }

  if (msg.context == null) {
    msg.context = {};
  }

  const sandbox = clone(msg.context) || {};

  if (msg.libraries) {
    if (Array.isArray(msg.libraries)) {
      msg.libraries.forEach((lib) => {
        sandbox[lib] = require(lib);
      });
    } else if (typeof msg.libraries === 'object') {
      Object.keys(msg.libraries).forEach((libKey) => {
        sandbox[libKey] = require(msg.libraries[libKey]);
      });
    } else {
      return error("Pitboss error: Libraries must be defined by an array or by an object.", msg.id);
    }
  }

  try {
    script = new VM({
      sandbox,
      timeout,
    });

    const result = script.run(sandboxedCode) || null;
    const res = {
      result: result, // script can return undefined, ensure it's null
      id: msg.id,
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

message('ready');
