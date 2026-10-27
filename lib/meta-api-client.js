/**
 * Meta API Client Abstraction
 *
 * Provides:
 * 1. RealMetaApiClient: For live production sending against Meta Graph API.
 * 2. MockMetaApiClient: For automated load testing, failure simulation, and local development.
 *
 * Safety Invariants:
 * - Mock client NEVER invokes external Meta endpoints.
 * - Real client asserts that synthetic/simulation jobs are NEVER dispatched to real Meta endpoints.
 * - Simulation mode requires explicit server-side configuration (process.env.AUTO_DM_SIMULATION_MODE === 'true'
 *   or explicit programmatic injection via setMetaApiClient).
 * - Fails closed if simulation mode is active but mock client cannot be initialized.
 */

// Interface contract documentation
export class MetaApiClient {
  async sendDirectMessage(options) {
    throw new Error('MetaApiClient.sendDirectMessage must be implemented by subclass')
  }
  async sendPublicCommentReply(options) {
    throw new Error('MetaApiClient.sendPublicCommentReply must be implemented by subclass')
  }
  async checkDeliveryStatus(options) {
    throw new Error('MetaApiClient.checkDeliveryStatus must be implemented by subclass')
  }
}

/**
 * Real Meta Graph API Client
 * Strictly used for live production messaging.
 */
export class RealMetaApiClient extends MetaApiClient {
  async sendDirectMessage({
    commentId,
    recipientId,
    text,
    buttonTitle,
    buttonUrl,
    message,
    accessToken,
    platformUserId,
    instagramAccountId,
    isSimulation = false,
  }) {
    // Critical safety guard: Never dispatch simulated/synthetic jobs to live Meta API
    if (
      isSimulation ||
      (commentId && String(commentId).startsWith('sim_')) ||
      (recipientId && String(recipientId).startsWith('sim_'))
    ) {
      throw new Error(
        'CRITICAL SAFETY VIOLATION: RealMetaApiClient received a simulation job. Live Meta API requests are forbidden for synthetic records.'
      )
    }

    const messageText = text || message
    if (!messageText && !buttonUrl) return { sent: false, reason: 'Missing message content' }

    if (accessToken && !accessToken.startsWith('meta_tok_')) {
      const apiVersion = process.env.META_API_VERSION || 'v21.0'
      const igUserId = platformUserId || 'me'
      const endpoint = `https://graph.instagram.com/${apiVersion}/${igUserId}/messages`
      const cleanButtonTitle = (buttonTitle || 'Get Access').trim().slice(0, 20)

      const recipientOptions = []
      if (commentId) recipientOptions.push({ type: 'comment_id', recipient: { comment_id: commentId } })
      if (recipientId) recipientOptions.push({ type: 'user_id', recipient: { id: recipientId } })

      // Attempt 1: Button Template if buttonUrl provided
      if (buttonUrl && cleanButtonTitle) {
        for (const opt of recipientOptions) {
          try {
            const buttonPayload = {
              recipient: opt.recipient,
              message: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'button',
                    text: (messageText || 'Here is your requested resource 👇').trim().slice(0, 640),
                    buttons: [
                      {
                        type: 'web_url',
                        url: buttonUrl,
                        title: cleanButtonTitle,
                      },
                    ],
                  },
                },
              },
            }

            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(buttonPayload),
            })

            const data = await res.json()
            if (res.ok && (data.message_id || data.id)) {
              return { sent: true, messageId: data.message_id || data.id, format: `button_template_${opt.type}` }
            }
          } catch (e) {
            console.warn(`[REAL_META_CLIENT] Button template attempt failed:`, e.message)
          }
        }
      }

      // Attempt 2: Standard Text Message via comment_id or recipientId
      try {
        const primaryRecipient = commentId ? { comment_id: commentId } : { id: recipientId }
        const formattedMessage = buttonUrl
          ? `${messageText}\n\n[ ${cleanButtonTitle} ]\n${buttonUrl}`
          : messageText

        const textPayload = {
          recipient: primaryRecipient,
          message: { text: formattedMessage },
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(textPayload),
        })

        const data = await res.json()
        if (res.ok && (data.message_id || data.id)) {
          return { sent: true, messageId: data.message_id || data.id, format: 'text' }
        }

        const err = data.error || {}
        return {
          sent: false,
          error: err.message || `HTTP ${res.status} Meta API error`,
          code: err.code,
          status: res.status,
        }
      } catch (err) {
        return { sent: false, error: err.message, status: 500 }
      }
    } else {
      // Dev mode placeholder token
      return { sent: true, devMode: true, messageId: `dev_msg_${Date.now()}` }
    }
  }

  async sendPublicCommentReply({ commentId, message, accessToken, isSimulation = false }) {
    if (isSimulation || (commentId && String(commentId).startsWith('sim_'))) {
      throw new Error('CRITICAL SAFETY VIOLATION: RealMetaApiClient received simulation comment reply.')
    }
    if (!commentId || !message) return { sent: false, reason: 'Missing commentId or message' }

    if (accessToken && !accessToken.startsWith('meta_tok_')) {
      try {
        const apiVersion = process.env.META_API_VERSION || 'v21.0'
        const endpoint = `https://graph.instagram.com/${apiVersion}/${commentId}/replies`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ message }),
        })
        const data = await res.json()
        if (res.ok && data.id) {
          return { sent: true, id: data.id, httpStatus: res.status }
        }
        return { sent: false, httpStatus: res.status, error: data.error?.message || 'Meta error', code: data.error?.code }
      } catch (err) {
        return { sent: false, httpStatus: 500, error: err.message }
      }
    } else {
      return { sent: true, devMode: true, httpStatus: 200 }
    }
  }

  async checkDeliveryStatus(options) {
    // In live Meta API, private replies cannot be looked up retroactively by commentId reliably.
    // Conservative safety invariant: return ambiguous: true so that worker recovery halts safely rather than blindly duplicating.
    return { delivered: false, ambiguous: true }
  }
}

/**
 * Mock Meta API Client for Simulation & Load Testing
 * Fully controllable, records every simulated dispatch, and NEVER calls Meta.
 */
export class MockMetaApiClient extends MetaApiClient {
  constructor(options = {}) {
    super()
    this.name = 'MockMetaApiClient'
    this.providerLatencyMs = options.providerLatencyMs || 0
    this.successProbability = options.successProbability !== undefined ? options.successProbability : 1.0
    this.forcedError = options.forcedError || null
    this.timeoutBeforeAcceptance = Boolean(options.timeoutBeforeAcceptance)
    this.timeoutAfterAcceptance = Boolean(options.timeoutAfterAcceptance)
    this.forceAmbiguousDelivery = Boolean(options.forceAmbiguousDelivery)
    this.scenarioHandler = options.scenarioHandler || null

    // Dispatch history / audit trail
    this.dispatches = []
    this.publicReplies = []
  }

  setBehavior(options = {}) {
    if (options.providerLatencyMs !== undefined) this.providerLatencyMs = options.providerLatencyMs
    if (options.successProbability !== undefined) this.successProbability = options.successProbability
    if (options.forcedError !== undefined) this.forcedError = options.forcedError
    if (options.timeoutBeforeAcceptance !== undefined) this.timeoutBeforeAcceptance = options.timeoutBeforeAcceptance
    if (options.timeoutAfterAcceptance !== undefined) this.timeoutAfterAcceptance = options.timeoutAfterAcceptance
    if (options.forceAmbiguousDelivery !== undefined) this.forceAmbiguousDelivery = options.forceAmbiguousDelivery
    if (options.scenarioHandler !== undefined) this.scenarioHandler = options.scenarioHandler
  }

  getDispatches() {
    return [...this.dispatches]
  }

  getDispatchTimestamps() {
    return this.dispatches.map((d) => d.timestamp)
  }

  clearHistory() {
    this.dispatches = []
    this.publicReplies = []
  }

  async sendDirectMessage(options) {
    const startMs = Date.now()

    // 1. Simulated Provider Latency
    if (this.providerLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.providerLatencyMs))
    }

    // 2. Simulated Network Timeout BEFORE acceptance
    if (this.timeoutBeforeAcceptance) {
      const errResult = {
        sent: false,
        error: 'ETIMEDOUT: Connection timed out before request accepted by Meta API',
        code: 'NETWORK_TIMEOUT',
        status: 504,
      }
      this.dispatches.push({
        timestamp: startMs,
        type: 'DM',
        payload: options,
        response: errResult,
        durationMs: Date.now() - startMs,
        success: false,
      })
      return errResult
    }

    // 3. Simulated Timeout AFTER message acceptance (Delivery Ambiguity scenario)
    if (this.timeoutAfterAcceptance) {
      const errResult = {
        sent: false,
        ambiguous: true,
        error: 'TCP connection timed out waiting for HTTP response headers after simulated socket write',
        code: 'DELIVERY_AMBIGUITY',
        status: 504,
      }
      this.dispatches.push({
        timestamp: startMs,
        type: 'DM',
        payload: options,
        response: errResult,
        durationMs: Date.now() - startMs,
        success: false,
        ambiguous: true,
      })
      return errResult
    }

    // 4. Custom scenario handler if registered
    if (typeof this.scenarioHandler === 'function') {
      const result = await this.scenarioHandler(options)
      this.dispatches.push({
        timestamp: startMs,
        type: 'DM',
        payload: options,
        response: result,
        durationMs: Date.now() - startMs,
        success: Boolean(result?.sent),
      })
      return result
    }

    // 5. Forced error simulation (e.g. rate limit code 613, token revoked 190, server error 500)
    if (this.forcedError) {
      const errResult = {
        sent: false,
        error: this.forcedError.message || this.forcedError.error || 'Simulated Meta Error',
        code: this.forcedError.code || null,
        status: this.forcedError.status || 400,
      }
      this.dispatches.push({
        timestamp: startMs,
        type: 'DM',
        payload: options,
        response: errResult,
        durationMs: Date.now() - startMs,
        success: false,
      })
      return errResult
    }

    // 6. Stochastic Failure Probability
    if (this.successProbability < 1.0 && Math.random() > this.successProbability) {
      const errResult = {
        sent: false,
        error: 'Stochastic transient server error from simulated Meta API',
        code: 500,
        status: 500,
      }
      this.dispatches.push({
        timestamp: startMs,
        type: 'DM',
        payload: options,
        response: errResult,
        durationMs: Date.now() - startMs,
        success: false,
      })
      return errResult
    }

    // 7. Successful simulated send
    const simulatedMessageId = `sim_mid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const successResult = {
      sent: true,
      simulated: true,
      messageId: simulatedMessageId,
      format: options.buttonUrl ? 'simulated_button_template' : 'simulated_text',
    }

    this.dispatches.push({
      timestamp: startMs,
      type: 'DM',
      payload: options,
      response: successResult,
      durationMs: Date.now() - startMs,
      success: true,
    })

    return successResult
  }

  async sendPublicCommentReply(options) {
    const simulatedReplyId = `sim_reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const result = { sent: true, simulated: true, id: simulatedReplyId, httpStatus: 200 }
    this.publicReplies.push({ timestamp: Date.now(), options, result })
    return result
  }

  async checkDeliveryStatus({ commentId, recipientId }) {
    if (this.forceAmbiguousDelivery) {
      return { delivered: false, ambiguous: true }
    }

    const match = this.dispatches.find((d) => {
      if (commentId && d.payload?.commentId === commentId) return true
      if (recipientId && d.payload?.recipientId === recipientId) return true
      return false
    })

    if (match && match.success) {
      return {
        delivered: true,
        ambiguous: false,
        providerMessageId: match.response?.messageId || match.response?.id,
        timestamp: match.timestamp,
      }
    }

    return { delivered: false, ambiguous: false }
  }
}

// ------------------------------------------------------------------------------
// Client Factory & Server-Side Simulation Mode Resolver
// ------------------------------------------------------------------------------

let activeCustomClient = null
const realClientInstance = new RealMetaApiClient()

/**
 * Checks if simulation mode is active.
 * Only enabled via explicit server-side configuration.
 */
export function isSimulationMode() {
  if (typeof process === 'undefined' || !process.env) return false
  return process.env.AUTO_DM_SIMULATION_MODE === 'true' || activeCustomClient !== null
}

/**
 * Resolves the appropriate Meta API Client based on environment configuration.
 * Fails closed if simulation mode is requested but cannot be satisfied.
 */
export function getMetaApiClient() {
  if (activeCustomClient) {
    return activeCustomClient
  }

  const isSim = process.env.AUTO_DM_SIMULATION_MODE === 'true'
  if (isSim) {
    try {
      activeCustomClient = new MockMetaApiClient()
      console.log('[META_API_CLIENT] Initialized MockMetaApiClient (Simulation Mode Active)')
      return activeCustomClient
    } catch (e) {
      // Fail closed: Never silently fall back to real client in simulation mode!
      throw new Error(`CRITICAL CONFIGURATION ERROR: Simulation mode enabled but failed to initialize mock client: ${e.message}`)
    }
  }

  return realClientInstance
}

/**
 * Injects a custom mock client for automated test suites.
 */
export function setMetaApiClient(client) {
  if (client && !(client instanceof MetaApiClient)) {
    throw new Error('Injected client must extend MetaApiClient')
  }
  activeCustomClient = client
}

/**
 * Resets back to default resolver state.
 */
export function resetMetaApiClient() {
  activeCustomClient = null
}
