const util = require('util');
const dgram = require('dgram');
const udp = dgram.createSocket('udp4');
const Wifi = require('wpa_supplicant');
// workaround
const Network = Wifi.prototype._getNetwork.call({ networks: [], }, undefined).constructor;

function promisifier(obj, props) {
  props.forEach((v) => {
    obj[v] = util.promisify(obj[v]);
  });
}

function ensure(f) {
  function recursion() {
    return new Promise((resolve, reject) => {
      try {
        if (f())
          return resolve();
        setTimeout(recursion, 500);
      } catch (e) {
        reject(e);
      }
    });
  }
}

promisifier(udp, ['send', 'bind']);
promisifier(Wifi.prototype, ['clear', 'scan']);
promisifier(Network.prototype, ['add', 'select', 'remove', 'connect', 'disconnect']);

const wifi = new Wifi();
const queue = [];

wifi.on('update', () => {
  const cur = wifi.currentNetwork;
  if (cur) {
    console.log(`Connected to ${cur.ssid}`);
  } else {
    console.log('Connected to nothing');
  }
});

async function prepare() {
  udp.on('message', (msg, rinfo) => {
    console.log(`${rinfo.address}:${rinfo.port} -> here: ${msg}`);
    queue.push(msg);
  });
  await udp.bind(0, undefined);
}

async function get() {
  await ensure(() => queue.length);
  return queue.shift();
}

async function command(msg) {
  await udp.send(Buffer.from(msg), 8889, '192.168.10.1');
  await get();
}

async function fix() {
  await command('command');
  await command(`ap ${ssid} ${pass}`);
}

async function scan() {
  await wifi.scan();
  await ensure(() => !wifi.scanning);
  const reg = /^Tello-[A-Z0-9]{6}$/;
  return wifi.networks.filter((w) => w.ssid.match(reg));
}

async function run() {
  await prepare();
  while (true) {
    const res = await scan();
    if (res.length) {
      for (let net of res) {
        console.log(`Found ${net.ssid},${net.frequency},${net.signal}`);
      }
      for (let net of res) {
        console.log(`Connecting to ${net.ssid}`);
        await net.connect();
        await ensure(() => wifi.currentNetwork === net);
        await net.disconnect();
      };
      await ensure(() => !wifi.currentNetwork);
      await new Promise((r) => { setTimeout(r, 15000); });
    } else {
      console.log('Found nothing');
      await new Promise((r) => { setTimeout(r, 5000); });
    }
  }
}

wifi.on('ready', run);
