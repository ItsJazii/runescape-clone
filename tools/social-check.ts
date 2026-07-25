/**
 * Two-client integration check for the friend list, ignore list and private
 * chat. Needs a running server, so it lives outside `npm test`:
 *
 *   npm start                 # in one terminal
 *   npm run check:social      # in another
 *
 * Logs in as Alice and Bob, then drives the whole social protocol and asserts
 * on what each client receives. Waits are longer than one 600ms game tick
 * because the server flushes each player's outgoing queue once per tick.
 */
import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:43594';

interface Client {
  ws: WebSocket;
  name: string;
  log: string[];
  friends: { name: string; online: boolean }[];
  ignores: string[];
}

function connect(name: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const client: Client = { ws, name, log: [], friends: [], ignores: [] };
    const timer = setTimeout(() => reject(new Error(`${name} never received an init packet`)), 10_000);
    const settle = (err?: Error) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(client);
    };
    ws.on('error', (err) => settle(err));
    // A refused login (already online) closes the socket without an init.
    ws.on('close', () => settle(new Error(`${name} was disconnected before logging in`)));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'login', name })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'msg') client.log.push(`[${m.kind}] ${m.text}`);
      else if (m.t === 'private') client.log.push(`[pm] ${m.outgoing ? 'To' : 'From'} ${m.name}: ${m.text}`);
      else if (m.t === 'friends') client.friends = m.list;
      else if (m.t === 'ignores') client.ignores = m.list;
      else if (m.t === 'init') settle();
    });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = (c: Client, msg: unknown) => c.ws.send(JSON.stringify(msg));

let failures = 0;
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

const alice = await connect('Alice');
const bob = await connect('Bob');
await wait(800);

// These accounts persist between runs, so start from a clean slate.
send(alice, { t: 'friend', action: 'remove', name: 'Bob' });
send(alice, { t: 'ignore', action: 'remove', name: 'Bob' });
send(bob, { t: 'friend', action: 'remove', name: 'Alice' });
send(bob, { t: 'ignore', action: 'remove', name: 'Alice' });
await wait(800);
alice.log.length = 0;
bob.log.length = 0;
console.log(`reset: alice friends=${JSON.stringify(alice.friends)} bob ignores=${JSON.stringify(bob.ignores)}`);

console.log('\n-- friend list --');
send(alice, { t: 'friend', action: 'add', name: 'bob' });
await wait(800);
check('Alice sees Bob as a friend', alice.friends.length === 1, JSON.stringify(alice.friends));
check('Bob resolves to his display name', alice.friends[0]?.name === 'Bob', JSON.stringify(alice.friends));
check('Bob shows as online', alice.friends[0]?.online === true);

send(alice, { t: 'friend', action: 'add', name: 'BOB' });
await wait(800);
check('duplicate add is rejected', alice.friends.length === 1);
check('duplicate add explains why', alice.log.some((l) => l.includes('already on your friend list')));

send(alice, { t: 'friend', action: 'add', name: 'Alice' });
await wait(800);
check('cannot befriend yourself', alice.friends.length === 1);

console.log('\n-- private messages --');
send(alice, { t: 'privateMessage', name: 'Bob', text: 'hello there' });
await wait(800);
check('Alice sees her outgoing pm', alice.log.some((l) => l === '[pm] To Bob: hello there'), alice.log.join(' | '));
check('Bob receives the pm', bob.log.some((l) => l === '[pm] From Alice: hello there'), bob.log.join(' | '));

send(alice, { t: 'privateMessage', name: 'Nobody', text: 'hi' });
await wait(800);
check('offline target is reported', alice.log.some((l) => l.includes('Nobody is not online')));

console.log('\n-- ignore list --');
send(bob, { t: 'ignore', action: 'add', name: 'Alice' });
await wait(800);
check('Bob ignores Alice', bob.ignores.length === 1 && bob.ignores[0] === 'Alice', JSON.stringify(bob.ignores));

const bobBefore = bob.log.length;
send(alice, { t: 'privateMessage', name: 'Bob', text: 'are you there' });
await wait(800);
check('Alice still sees her own pm', alice.log.some((l) => l === '[pm] To Bob: are you there'));
check('Bob receives nothing while ignoring', !bob.log.slice(bobBefore).some((l) => l.includes('are you there')));

const bobBeforeChat = bob.log.length;
send(alice, { t: 'chat', text: 'public hello' });
await wait(800);
check('ignored public chat is filtered', !bob.log.slice(bobBeforeChat).some((l) => l.includes('public hello')));
check('Alice still hears herself', alice.log.some((l) => l.includes('Alice: public hello')));

send(bob, { t: 'friend', action: 'add', name: 'Alice' });
await wait(800);
check('cannot befriend an ignored player', bob.friends.length === 0);
check('and it says why', bob.log.some((l) => l.includes('remove them from your ignore list')));

console.log('\n-- logout notification --');
const aliceBefore = alice.log.length;
bob.ws.close();
await wait(800);
check('Alice is told Bob logged out', alice.log.slice(aliceBefore).some((l) => l.includes('Bob has logged out')));
check('Bob now shows offline', alice.friends[0]?.online === false, JSON.stringify(alice.friends));

console.log('\n-- login notification --');
const aliceBefore2 = alice.log.length;
const bob2 = await connect('Bob');
await wait(800);
check('Alice is told Bob logged in', alice.log.slice(aliceBefore2).some((l) => l.includes('Bob has logged in')));
check('Bob shows online again', alice.friends[0]?.online === true);
check('ignore list persisted across logout', bob2.ignores.includes('Alice'), JSON.stringify(bob2.ignores));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
alice.ws.close();
bob2.ws.close();
process.exit(failures === 0 ? 0 : 1);

