/** Native Node 22 adapter; constructing the factory never opens a connection. */
export function createDiscoveryConnect(WebSocketClass) {
  return endpoint => {
    const url = new URL(endpoint);
    if (url.origin !== 'wss://api.iran.liara.ir' || url.pathname !== '/v1/exec' || url.hash || typeof WebSocketClass !== 'function') throw Error('transport_rejected');
    const listeners = new Map();
    let socket;
    const emit = (name, value) => { for (const listener of listeners.get(name) || []) listener(value); };
    const reject = () => { emit('error', 'transport_rejected'); try { socket.close(); } catch { /* redacted */ } };
    try { socket = new WebSocketClass(endpoint); socket.binaryType = 'arraybuffer'; } catch { throw Error('transport_rejected'); }
    socket.addEventListener('open', () => emit('open'));
    socket.addEventListener('message', event => {
      const data = event.data;
      const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data.byteLength : null;
      if (bytes === null || bytes > 8192) return reject();
      emit('message', data);
    });
    socket.addEventListener('error', reject);
    socket.addEventListener('close', event => emit('close', event.code));
    return {
      on(name, listener) { if (!['open','message','error','unexpected-response','close'].includes(name)) throw Error('transport_rejected'); const list = listeners.get(name) || []; list.push(listener); listeners.set(name, list); },
      send(text) { try { socket.send(text); } catch { throw Error('transport_rejected'); } },
      close() { try { socket.close(); } catch { /* redacted */ } },
    };
  };
}
