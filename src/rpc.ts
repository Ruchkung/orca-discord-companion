import { randomUUID } from 'node:crypto'
import { connect as connectSocket, type Socket } from 'node:net'

const Op = { Handshake: 0, Frame: 1, Close: 2 } as const
type Op = typeof Op[keyof typeof Op]

export class RpcError extends Error {
  readonly code: number | null
  constructor(code: number | null, message: string) {
    super(message)
    this.code = code
  }
}

export interface RpcConnection {
  request(cmd: string, args?: object, timeoutMs?: number): Promise<unknown>
  subscribe(event: string): Promise<unknown>
  /** Resolves when Discord or the pipe closes the connection. */
  readonly closed: Promise<void>
  close(): void
}

function frame(op: Op, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload))
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function get(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

function open(path: string): Promise<Socket | null> {
  return new Promise(resolve => {
    const socket = connectSocket(path, () => resolve(socket))
    socket.once('error', () => resolve(null))
  })
}

/** Connects to the first Discord IPC pipe that answers, or returns null when Discord is not running. */
export async function connectRpc(
  paths: string[],
  clientId: string,
  onEvent: (event: string, data: unknown) => void = () => undefined,
  handshakeTimeoutMs = 60_000
): Promise<RpcConnection | null> {
  let socket: Socket | null = null
  for (const path of paths) {
    socket = await open(path)
    if (socket) break
  }
  if (!socket) return null
  const pipe = socket

  const pending = new Map<string, (message: unknown) => void>()
  let buffer = Buffer.alloc(0)
  let ready: (message: unknown) => void = () => undefined
  const readyMessage = new Promise<unknown>(resolve => { ready = resolve })
  const closed = new Promise<void>(resolve => pipe.once('close', () => resolve()))
  void closed.then(() => {
    const error = { evt: 'ERROR', data: { code: null, message: 'Discord closed the connection.' } }
    for (const settle of pending.values()) settle(error)
    pending.clear()
    ready(error)
  })

  pipe.on('error', () => pipe.destroy())
  pipe.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length >= 8) {
      const op = buffer.readInt32LE(0)
      const length = buffer.readInt32LE(4)
      if (buffer.length < 8 + length) break
      let message: unknown
      try {
        message = JSON.parse(buffer.subarray(8, 8 + length).toString('utf8'))
      } catch {
        message = undefined
      }
      buffer = buffer.subarray(8 + length)
      if (op === Op.Close) {
        ready({ evt: 'ERROR', data: get(message, 'message') ? message : { message: 'Discord refused the connection.' } })
        pipe.destroy()
        return
      }
      const nonce = get(message, 'nonce')
      const event = get(message, 'evt')
      if (event === 'READY') ready(message)
      else if (typeof nonce === 'string' && pending.has(nonce)) {
        pending.get(nonce)?.(message)
        pending.delete(nonce)
      } else if (typeof event === 'string') onEvent(event, get(message, 'data'))
    }
  })

  pipe.write(frame(Op.Handshake, { v: 1, client_id: clientId }))
  // Discord answers slowly when one application connects many times in a row.
  const timer = setTimeout(() => {
    ready({ evt: 'ERROR', data: { code: null, message: 'Discord did not answer the connection.' } })
  }, handshakeTimeoutMs)
  const hello = await readyMessage
  clearTimeout(timer)
  if (get(hello, 'evt') === 'ERROR') {
    pipe.destroy()
    const data = get(hello, 'data')
    const code = get(data, 'code')
    throw new RpcError(typeof code === 'number' ? code : null, String(get(data, 'message') ?? 'Discord refused the connection.'))
  }

  function send(cmd: string, args: object, timeoutMs: number, evt?: string): Promise<unknown> {
    const nonce = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(nonce)
        reject(new RpcError(null, 'Discord did not answer ' + cmd + '.'))
      }, timeoutMs)
      pending.set(nonce, message => {
        clearTimeout(timer)
        const data = get(message, 'data')
        if (get(message, 'evt') !== 'ERROR') return resolve(data)
        const code = get(data, 'code')
        reject(new RpcError(typeof code === 'number' ? code : null, String(get(data, 'message') ?? cmd + ' failed.')))
      })
      pipe.write(frame(Op.Frame, { cmd, args, evt, nonce }))
    })
  }

  return {
    closed,
    close: () => pipe.destroy(),
    request: (cmd, args = {}, timeoutMs = 5000) => send(cmd, args, timeoutMs),
    // Discord reads the event name beside the command, not inside its arguments.
    subscribe: event => send('SUBSCRIBE', {}, 5000, event)
  }
}
