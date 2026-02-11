import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

// SSE proxy for activity stream WebSocket
// Client connects here via fetch/EventSource — API key stays on the server.
// Server opens WebSocket to Lyzr metrics and forwards events as SSE.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return Response.json(
      { success: false, error: 'session_id query parameter is required' },
      { status: 400 }
    )
  }

  if (!LYZR_API_KEY) {
    return Response.json(
      { success: false, error: 'LYZR_API_KEY not configured on server' },
      { status: 500 }
    )
  }

  // ws is available as transitive dependency of Next.js (used internally for HMR)
  let WS: any
  try {
    WS = (await import('ws')).default
  } catch {
    return Response.json(
      { success: false, error: 'WebSocket not available on server. Install ws package.' },
      { status: 500 }
    )
  }

  const encoder = new TextEncoder()
  const wsUrl = `wss://metrics.studio.lyzr.ai/ws/${sessionId}?x-api-key=${LYZR_API_KEY}`

  const stream = new ReadableStream({
    start(controller) {
      const ws = new WS(wsUrl)

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // Stream already closed by client
        }
      }

      ws.on('open', () => {
        send(JSON.stringify({ _meta: 'connected' }))
      })

      ws.on('message', (raw: Buffer | string) => {
        send(typeof raw === 'string' ? raw : raw.toString())
      })

      ws.on('close', () => {
        send(JSON.stringify({ _meta: 'disconnected' }))
        try { controller.close() } catch {}
      })

      ws.on('error', () => {
        send(JSON.stringify({ _meta: 'error' }))
        try { controller.close() } catch {}
      })

      // Clean up server-side WebSocket when client disconnects
      request.signal.addEventListener('abort', () => {
        ws.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
