// Lets your interviewer reach the server you are running with `npm start`,
// through a temporary public address that lasts until you press Ctrl+C.
//
//   npm run share
//
// Nothing to sign up for or install: the tunnel runs over the ssh command that
// comes with macOS, Linux and Windows 10 or newer, using localhost.run, or
// Pinggy if that is blocked. Every request must carry the passphrase your
// interviewer gives you, so nobody else who finds the address can use it.

import { spawn, type ChildProcess } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import qrcode from 'qrcode-terminal';

const PASSPHRASE_HEADER = 'x-share-passphrase';
const serverPort = Number(process.env.PORT ?? 3000);

interface Provider {
  name: string;
  args: (port: number) => string[];
  isAddress: (url: URL) => boolean;
  note?: string;
}

const providers: Provider[] = [
  {
    name: 'localhost.run',
    args: (port) => ['-R', `80:localhost:${port}`, 'nokey@localhost.run'],
    isAddress: (url) => url.hostname.endsWith('.lhr.life'),
  },
  {
    // Port 443, for networks that block ssh's usual port 22.
    name: 'Pinggy',
    args: (port) => ['-p', '443', `-R0:localhost:${port}`, 'a.pinggy.io'],
    isAddress: (url) => url.hostname.endsWith('.pinggy.net') || url.hostname.endsWith('.pinggy-free.link'),
    note: 'Pinggy closes free tunnels after 60 minutes. Run npm run share again if it does.',
  },
];

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

async function askPassphrase(): Promise<string> {
  if (process.env.SHARE_PASSPHRASE) return process.env.SHARE_PASSPHRASE;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Passphrase from your interviewer: ')).trim();
  rl.close();
  if (!answer) fail('A passphrase is needed. Ask your interviewer for it.');
  return answer;
}

// Passes requests that carry the passphrase on to the server.
function startGate(passphrase: string): Promise<http.Server> {
  const expected = Buffer.from(passphrase);
  const gate = http.createServer((req, res) => {
    const given = Buffer.from(String(req.headers[PASSPHRASE_HEADER] ?? ''));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'passphrase_required', message: `Send the ${PASSPHRASE_HEADER} header` } }));
      return;
    }
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: `localhost:${serverPort}` };
    delete headers[PASSPHRASE_HEADER];
    const upstream = http.request(
      { host: 'localhost', port: serverPort, method: req.method, path: req.url, headers },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'server_down', message: 'The server is not running. Run npm start.' } }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve) => gate.listen(0, '127.0.0.1', () => resolve(gate)));
}

// Opens the tunnel and resolves with its public address, or null if this
// provider gives none within 20 seconds.
function openTunnel(provider: Provider, gatePort: number, knownHosts: string): Promise<{ ssh: ChildProcess; url: string } | null> {
  return new Promise((resolve) => {
    const ssh = spawn(
      'ssh',
      [
        '-T',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', `UserKnownHostsFile=${knownHosts}`,
        '-o', 'ServerAliveInterval=30',
        '-o', 'ExitOnForwardFailure=yes',
        ...provider.args(gatePort),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const timer = setTimeout(() => done(null), 20_000);
    function done(url: string | null) {
      clearTimeout(timer);
      if (url) return resolve({ ssh, url });
      ssh.kill();
      resolve(null);
    }
    const scan = (chunk: Buffer) => {
      output += chunk.toString();
      for (const match of output.matchAll(/https:\/\/[^\s"'<>]+/g)) {
        const url = URL.canParse(match[0]) ? new URL(match[0]) : null;
        if (url && provider.isAddress(url)) return done(url.origin);
      }
    };
    ssh.stdout.on('data', scan);
    ssh.stderr.on('data', scan);
    ssh.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') fail('npm run share needs the ssh command. On Windows, add the "OpenSSH Client" optional feature.');
      done(null);
    });
    ssh.on('exit', () => done(null));
  });
}

async function reachable(url: string, passphrase: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${url}/healthz`, { headers: { [PASSPHRASE_HEADER]: passphrase } });
      if (res.ok) return true;
    } catch {
      // The address can take a moment to start answering.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

try {
  await fetch(`http://localhost:${serverPort}/healthz`);
} catch {
  fail(`No server is answering on port ${serverPort}. Start it with npm start in another terminal first.`);
}

const passphrase = await askPassphrase();
const gate = await startGate(passphrase);
const gatePort = (gate.address() as AddressInfo).port;
const sshDir = mkdtempSync(join(tmpdir(), 'stacks-share-'));
const knownHosts = join(sshDir, 'known_hosts');

let tunnel: { ssh: ChildProcess; url: string } | null = null;
let provider: Provider | undefined;
for (provider of providers) {
  console.log(`Opening a tunnel with ${provider.name}...`);
  tunnel = await openTunnel(provider, gatePort, knownHosts);
  if (tunnel && (await reachable(tunnel.url, passphrase))) break;
  tunnel?.ssh.kill();
  tunnel = null;
}
if (!tunnel || !provider) {
  rmSync(sshDir, { recursive: true, force: true });
  fail('Could not open a tunnel. Your network may block ssh. Tell your interviewer, and keep going without it.');
}

const shared = tunnel;
console.log(`\nYour server is shared at:\n\n  ${shared.url}\n`);
qrcode.generate(shared.url, { small: true }, (code) => console.log(code));
console.log('Read the address to your interviewer, or let them scan the code.');
if (provider.note) console.log(provider.note);
console.log('Press Ctrl+C to stop sharing.');

const stop = (code: number) => {
  shared.ssh.kill();
  gate.close();
  rmSync(sshDir, { recursive: true, force: true });
  process.exit(code);
};
process.on('SIGINT', () => {
  console.log('\nStopped sharing.');
  stop(0);
});
shared.ssh.on('exit', () => {
  console.error('\nThe tunnel closed. Run npm run share again to get a new address.');
  stop(1);
});
