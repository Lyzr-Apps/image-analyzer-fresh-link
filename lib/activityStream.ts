'use client'

/**
 * Activity Stream Client Utility
 *
 * Real-time activity stream for manager-subagent patterns.
 * Connects to /api/activity-stream (server-side SSE proxy) which handles
 * the Lyzr WebSocket connection — API key never reaches the browser.
 *
 * @example
 * ```tsx
 * import { useAgentActivityStream, ActivityPanel, generateSessionId } from '@/lib/activityStream'
 *
 * const { events, isConnected, activeAgent, status, connect, reset } = useAgentActivityStream()
 *
 * const sessionId = generateSessionId(agentId)
 * connect(sessionId)
 * const result = await callAIAgent(message, agentId, { session_id: sessionId })
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  event_type: 'thinking' | 'processing' | 'llm_generation' | 'completion' | 'error'
  status: 'in_progress' | 'completed' | 'failed'
  trace_id: string
  run_id: string
  session_id: string
  message: string
  timestamp?: string
  agent_name?: string
}

export type ActivityStreamStatus = 'idle' | 'running' | 'completed' | 'error'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique session ID for activity stream + callAIAgent coordination. */
export function generateSessionId(agentId: string): string {
  const random = Math.random().toString(36).substring(2, 14)
  return `${agentId}-${random}`
}

/** Fetch the Lyzr API key from the server-side proxy. Kept for utility use. */
export async function getLyzrApiKey(): Promise<string> {
  try {
    const res = await fetch('/api/lyzr-config')
    const data = await res.json()
    return data.apiKey || ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** React hook for managing an activity stream via server-side SSE proxy. */
export function useAgentActivityStream() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [status, setStatus] = useState<ActivityStreamStatus>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionIdRef = useRef<string>('')

  const processEvent = useCallback((data: ActivityEvent) => {
    setEvents(prev => [...prev, data])

    if (data.event_type === 'processing' && data.status === 'in_progress') {
      setActiveAgent(data.agent_name || data.message || 'Sub-agent')
    }

    if (data.event_type === 'processing' && data.status === 'completed') {
      setActiveAgent(null)
    }

    if (data.event_type === 'completion') {
      setStatus('completed')
      setActiveAgent(null)
    }

    if (data.event_type === 'error') {
      setStatus('error')
    }
  }, [])

  const connect = useCallback((sessionId: string) => {
    // Clean up existing connection
    if (abortRef.current) {
      abortRef.current.abort()
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    setEvents([])
    setStatus('running')
    setActiveAgent(null)
    sessionIdRef.current = sessionId

    const abortController = new AbortController()
    abortRef.current = abortController

    const startStream = async () => {
      try {
        const response = await fetch(
          `/api/activity-stream?session_id=${encodeURIComponent(sessionId)}`,
          { signal: abortController.signal }
        )

        if (!response.ok || !response.body) {
          setIsConnected(false)
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        setIsConnected(true)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data._meta === 'connected') {
                    setIsConnected(true)
                    continue
                  }
                  if (data._meta === 'disconnected' || data._meta === 'error') {
                    setIsConnected(false)
                    continue
                  }
                  processEvent(data as ActivityEvent)
                } catch {
                  // Ignore non-JSON
                }
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
      }

      setIsConnected(false)

      // Auto-reconnect if still running (not completed/error)
      setStatus(prev => {
        if (prev === 'running') {
          reconnectTimeoutRef.current = setTimeout(() => {
            startStream()
          }, 3000)
        }
        return prev
      })
    }

    startStream()
  }, [processEvent])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    setIsConnected(false)
    setStatus('idle')
    setActiveAgent(null)
  }, [])

  const reset = useCallback(() => {
    disconnect()
    setEvents([])
  }, [disconnect])

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return { events, isConnected, activeAgent, status, connect, disconnect, reset }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Pre-built activity panel that renders live activity events. */
export function ActivityPanel({
  events,
  activeAgent,
  status,
  isConnected,
}: {
  events: ActivityEvent[]
  activeAgent: string | null
  status: ActivityStreamStatus
  isConnected: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  if (status === 'idle' && events.length === 0) return null

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            {status === 'completed' && <Check className="w-4 h-4 text-green-500" />}
            {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
            Agent Activity
          </CardTitle>
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
        {activeAgent && (
          <p className="text-xs text-muted-foreground mt-1">
            Currently running: <span className="font-medium text-foreground">{activeAgent}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div ref={scrollRef} className="max-h-48 overflow-y-auto space-y-1.5">
          {Array.isArray(events) && events.map((event, index) => (
            <div key={index} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {event.event_type === 'thinking' && <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />}
                {event.event_type === 'processing' && event.status === 'in_progress' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                {event.event_type === 'processing' && event.status === 'completed' && <Check className="w-3 h-3 text-green-500" />}
                {event.event_type === 'processing' && event.status === 'failed' && <AlertCircle className="w-3 h-3 text-red-500" />}
                {event.event_type === 'llm_generation' && <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />}
                {event.event_type === 'completion' && <Check className="w-3 h-3 text-green-500" />}
                {event.event_type === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
              </span>
              <span className={`${event.event_type === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
                {event.agent_name && <span className="font-medium text-foreground">{event.agent_name}: </span>}
                {event.message}
              </span>
            </div>
          ))}
          {status === 'running' && events.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for agent activity...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
