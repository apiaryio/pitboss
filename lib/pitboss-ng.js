const path = require('path');
const os = require('os');
const { fork, exec } = require('child_process');
const { EventEmitter } = require('events');

const clone = require('clone');
const pusage = require('pidusage');
const csvParse = require('csv-parse');

const isWin = ['win', 'win32', 'win64'].includes(os.platform());
const forkableJsPath = path.join(__dirname, '../lib/forkable.js');
const cwd = process.cwd();

exports.Pitboss = class Pitboss {
  constructor(code, options) {
    this.runner = new exports.Runner(code, options);
    this.queue = [];
    this.runner.on('completed', this.next.bind(this));
  }

  run({ context, libraries }, callback) {
    this.queue.push({
      context: context,
      libraries: libraries,
      callback: callback
    });
    this.next();
  }

  kill() {
    if (this.runner) {
      this.runner.kill(1);
    }
  }

  next() {
    if (this.runner.running) {
      return false;
    }
    const c = this.queue.shift();
    if (c) {
      this.runner.run({
        context: c.context,
        libraries: c.libraries
      }, c.callback);
    }
  }

};

// Can only run one at a time due to the blocking nature of VM
// Need to queue this up outside of the process since it's over an async channel
exports.Runner = class Runner extends EventEmitter {
  constructor(code, options = {}) {
    super();
    this.run = this.run.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.messageHandler = this.messageHandler.bind(this);

    // try to launch the subprocess again, BUT notify callback (if any)
    this.failedForkHandler = this.failedForkHandler.bind(this);

    this.timeout = this.timeout.bind(this);
    this.memoryExceeded = this.memoryExceeded.bind(this);
    this.notifyCompleted = this.notifyCompleted.bind(this);
    this.winMemory = this.winMemory.bind(this);

    this.code = code;

    this.options = clone(options);
    this.options.memoryLimit = options.memoryLimit != null ? options.memoryLimit : 64 * 1024; // memoryLimit is in kBytes, so 64 MB here
    this.options.timeout = options.timeout != null ? options.timeout : 500;
    this.options.heartBeatTick = options.heartBeatTick != null ? options.heartBeatTick : 100;

    this.callback = null;
    this.running = false;
  }

  launchFork(readyCb) {
    if (this.proc) {
      if (typeof this.proc.removeAllListeners === "function") {
        this.proc.removeAllListeners('exit');
        this.proc.removeAllListeners('message');
      }
      if (this.proc.connected) {
        this.proc.kill('SIGTERM');
      }
    }
    this.forkableIsReady = readyCb;

    this.proc = fork(forkableJsPath, { env: {}, cwd, execArgv: [] });

    this.proc.on('message', this.messageHandler);
    this.proc.on('exit', this.failedForkHandler);

    this.proc.send({
      code: this.code,
      timeout: this.options.timeout + 100
    });
  }

  run({ context, libraries }, callback) {
    if (this.running) {
      return false;
    }

    this.launchFork(() => {
      const id = `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
      const msg = {
        context,
        libraries,
        id,
      };

      this.callback = callback || false;
      this.startTimer();
      this.running = id;
      this.proc.send(msg);
      id;
    });
  }

  disconnect() {
    if (this.proc && this.proc.connected) {
      this.proc.disconnect();
    }
  }

  kill(dieWithoutRestart) {
    if (this.proc && this.proc.connected) {
      if (dieWithoutRestart) {
        this.proc.removeAllListeners('exit');
        this.proc.removeAllListeners('message');
      }
      this.proc.kill("SIGTERM");
    }
    this.closeTimer();
  }

  messageHandler(msg) {
    if (msg === 'ready') {
      this.forkableIsReady();
      return;
    }

    this.running = false;
    this.closeTimer();
    this.emit('result', msg);
    if (this.callback) {
      const cb = this.callback;
      this.callback = false;
      if (msg.error) {
        cb(msg.error);
      } else {
        cb(null, msg.result);
      }
    }
    this.notifyCompleted();
  }

  failedForkHandler() {
    this.running = false;
    this.closeTimer(this.timer);
    const error = this.currentError || "Process Failed";
    this.emit('failed', error);
    this.launchFork(this.forkableIsReady);
    if (this.callback) {
      this.callback(error);
    }
    this.notifyCompleted();
  }

  timeout() {
    if (this.currentError == null) {
      this.currentError = "Timedout";
    }
    this.kill();
  }

  memoryExceeded() {
    if (!this.proc || this.proc.pid == null) {
      return;
    }

    const pid = this.proc.pid;

    if (isWin) {
      this.winMemory(pid, (err, stats = []) => {
        if (err) {
          if (this.running) { // still running and some error occurs
            console.error("Process memory usage command failed", err);
          }
        }
        if (!err && (stats && stats[0] && stats[0].memUsage > this.options.memoryLimit)) {
          this.currentError = "MemoryExceeded";
          this.kill();
        }
      });
      return;
    }

    pusage(pid, (err, stat = {}) => {
      if (err) {
        if (this.running) { // still running and some error occurs
          console.error("Process memory usage command failed", err);
        }
      }
      pusage.clear();
      // memoryLimit is in kBytes, whereas stat.memory in bytes
      if (!err && stat.memory > (this.options.memoryLimit * 1024)) {
        this.currentError = "MemoryExceeded";
        this.kill();
      }
    });
  }

  notifyCompleted() {
    this.running = false;
    this.emit('completed');
  }

  startTimer() {
    this.closeTimer();
    this.timer = setTimeout(this.timeout, this.options['timeout']);
    this.memoryTimer = setInterval(this.memoryExceeded, this.options['heartBeatTick']);
  }

  closeTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
  }

  winMemory(pid, cb) {
    const taskListPath = 'tasklist.exe ';

    const taskList = (arg, taskListCallback) => {
      exec(`${taskListPath}${arg}`, function taskListExecuted(err, stdout) {
        taskListCallback(err, stdout);
      });
    };

    const procStat = (procStatCallback) => {
      const arg = `/fi "PID eq ${pid}" /fo CSV`;
      const stats = [];
      taskList(arg, function taskListDone(err, stdout = '') {
        if (err || !stdout) {
          return;
        }
        csvParse(stdout, {
          skip_empty_lines: true
        }, function csvParseDone(err, rows = []) {
          if (err) {
            procStatCallback(err, stats);
            return;
          }
          if (rows.length > 0) {
            rows.forEach((row) => {
              let memVal;
              if (!(parseInt(row[1], 10) === pid)) {
                return;
              }
              if (row[4]) {
                memVal = `${row[4] || ''}`.toLowerCase().replace(',', '.').trim();
                if (memVal.includes('k')) {
                  memVal = 1000 * parseInt(memVal.slice(0, -1)); // because it was 1234.567 k
                } else if (memVal.includes('m')) {
                  memVal = 1000 * 1000 * parseInt(memVal.slice(0, -1), 10); // because it was 1234.567 M
                } else {
                  memVal = 1000 * parseFloat(memVal.slice(0, -1));
                }
              } else {
                // kiloBytes by default
                memVal = parseFloat(row[4]);
              }
              stats.push({
                name: row[0],
                pid: pid,
                memUsage: memVal
              });
            });
            procStatCallback(err, stats);
          } else {
            // fail silently
            procStatCallback(err, stats);
          }
        });
      });
    };
    procStat(cb);
  }

};
