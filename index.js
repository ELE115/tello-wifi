#!/usr/bin/node

const util = require('util');
const dgram = require('dgram');
const udp = dgram.createSocket('udp4');

function promisifier(obj, props) {
  props.forEach((v) => {
    obj[v] = util.promisify(obj[v]);
  });
}

function ensure(f, to) {
  return new Promise((resolve, reject) => {
    function recursion() {
      try {
        if (f())
          return resolve();
        if (to === undefined || to-- > 0)
          setTimeout(recursion, 100);
        else
          reject({ timeout: true });
      } catch (e) {
        reject(e);
      }
    }
    recursion();
  });
}

promisifier(udp, ['send', 'bind']);

const queue = [];

async function prepare() {
  udp.on('message', (msg, rinfo) => {
    console.log(`${rinfo.address}:${rinfo.port} -> here: \x1b[1;33m${msg}\x1b[0m`);
    queue.push(msg);
  });
  console.log('binding');
  await udp.bind(0, undefined);
}

async function get(to) {
  try {
    await ensure(() => queue.length, to);
  } catch (e) {
    if (e.timeout)
      return undefined;
    throw e;
  }
  return queue.shift();
}

async function command(msg, match, to) {
  while (to === undefined || to-- >= 0) {
    console.log(`here -> 192.168.10.1:8889: \x1b[1;32m${msg}\x1b[0m`);
    await udp.send(Buffer.from(msg), 8889, '192.168.10.1');
    const res = await get(25);
    if (res && res.toString('utf-8') === match)
      return;
  }
  console.error('Timeout');
  proces.exit(1);
}

async function fix() {
  await command('command', 'ok');
  await command(`ap ${process.argv[2]} ${process.argv[3]}`, 'OK,drone will reboot in 3s');
  await new Promise((resolve) => { setTimeout(resolve, 500); });
  console.log('Finished!');
  process.exit(0);
}

prepare().then(fix).catch((err) => {
  console.error(err);
  process.exit(114);
});
