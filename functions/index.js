import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import OpenAI from 'openai'

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
})

const app = express()
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
const requestTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000)
const maxInputChars = Number(process.env.MAX_INPUT_CHARS || 4000)
const maxMessages = Number(process.env.MAX_MESSAGES || 20)
const demoModeEnabled = process.env.DEMO_MODE === 'true'

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20)
const ipWindowCounter = new Map()

const emergencyTerms = [
  'dor no peito',
  'falta de ar intensa',
  'saturacao muito baixa',
  'convulsao',
  'hemorragia',
  'sangramento ativo',
  'perda de consciencia',
  'ideacao suicida',
  'parada cardiorrespiratoria',
]

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }

  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function enforceRateLimit(req, res) {
  const now = Date.now()
  const ip = getClientIp(req)
  const current = ipWindowCounter.get(ip)

  if (!current || now > current.expiresAt) {
    ipWindowCounter.set(ip, {
      count: 1,
      expiresAt: now + rateLimitWindowMs,
    })
    return true
  }

  if (current.count >= rateLimitMaxRequests) {
    const waitMs = Math.max(0, current.expiresAt - now)
    res.setHeader('Retry-After', String(Math.ceil(waitMs / 1000)))
    res.status(429).json({ error: 'Muitas requisicoes. Tente novamente em instantes.' })
    return false
  }

  current.count += 1
  return true
}

function sanitizeMessages(inputMessages) {
  if (!Array.isArray(inputMessages)) {
    return []
  }

  return inputMessages
    .slice(-maxMessages)
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : 'user'
      const content = typeof item?.content === 'string' ? item.content.trim() : ''
      return {
        role,
        content: content.slice(0, maxInputChars),
      }
    })
    .filter((item) => item.content.length > 0)
}

function parseError(error) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500
    if ('error' in error && typeof error.error === 'object' && error.error && 'message' in error.error) {
      const nestedMessage = error.error.message
      if (typeof nestedMessage === 'string') {
        return {
          status,
          message: nestedMessage,
        }
      }
    }
    if ('message' in error && typeof error.message === 'string') {
      return {
        status,
        message: error.message,
      }
    }
  }

  if (error instanceof Error) {
    return {
      status: 500,
      message: error.message,
    }
  }

  return {
    status: 500,
    message: 'Erro interno',
  }
}

function sanitizeContext(inputContext) {
  const careTrack =
    inputContext?.careTrack === 'transicao' || inputContext?.careTrack === 'paliativos'
      ? inputContext.careTrack
      : 'reabilitacao'

  const audience = inputContext?.audience === 'cuidador' ? 'cuidador' : 'equipe'
  const patientContext = typeof inputContext?.patientContext === 'string' ? inputContext.patientContext.trim().slice(0, 1600) : ''

  return {
    careTrack,
    audience,
    patientContext,
  }
}

function hasEmergencySignal(text) {
  const lower = text.toLowerCase()
  return emergencyTerms.some((term) => lower.includes(term))
}

function getTrackInstruction(careTrack) {
  if (careTrack === 'transicao') {
    return 'Foque em transicao de cuidado, reconciliacao medicamentosa, follow-up em 72h/7 dias e prevencao de readmissao.'
  }

  if (careTrack === 'paliativos') {
    return 'Foque em alivio de sintomas, plano centrado em objetivos de cuidado, comunicacao com familia e sinais de deterioracao.'
  }

  return 'Foque em reabilitacao funcional, metas SMART, prevencao de complicacoes e plano multiprofissional.'
}

function buildSystemPrompt(context) {
  const audienceStyle =
    context.audience === 'cuidador'
      ? 'Use linguagem simples para cuidador/familia e destaque quando procurar equipe.'
      : 'Use linguagem tecnica objetiva para equipe multiprofissional.'

  return [
    'Voce e um copiloto clinico para reabilitacao, transicao de cuidados e cuidados paliativos.',
    'Nunca substitua julgamento clinico presencial, nunca prescreva dose especifica sem avaliacao profissional e nao forneca diagnostico definitivo.',
    'Quando houver risco agudo, priorize orientacao imediata para acionar servico de emergencia local.',
    getTrackInstruction(context.careTrack),
    audienceStyle,
    'Responda sempre em portugues do Brasil com estrutura:',
    '1) Resumo do caso',
    '2) Plano sugerido em passos',
    '3) Alertas de risco e escalonamento',
    '4) Checklist rapido para proxima visita/planto',
  ].join(' ')
}

function hasUsableOpenAiKey() {
  const rawApiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!rawApiKey) {
    return false
  }

  const blockedMarkers = ['sua_chave', 'your_key', 'placeholder']
  const lower = rawApiKey.toLowerCase()
  return !blockedMarkers.some((marker) => lower.includes(marker))
}

function getOpenAiKey() {
  return (process.env.OPENAI_API_KEY || '').trim()
}

app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: openAiModel,
    demoMode: demoModeEnabled,
    provider: 'firebase-functions',
  })
})

app.post('/api/chat', async (req, res) => {
  try {
    if (!enforceRateLimit(req, res)) {
      return
    }

    const sanitizedMessages = sanitizeMessages(req.body?.messages)
    const context = sanitizeContext(req.body?.context)

    if (sanitizedMessages.length === 0) {
      return res.status(400).json({ error: 'Nenhuma mensagem valida foi enviada.' })
    }

    const lastUserMessage = sanitizedMessages.filter((item) => item.role === 'user').at(-1)
    if (lastUserMessage && hasEmergencySignal(lastUserMessage.content)) {
      return res.json({
        reply:
          'Alerta de risco agudo identificado. Oriente avaliacao medica imediata e acione o servico de emergencia local (SAMU 192 no Brasil) conforme protocolo institucional. Em seguida, registre sinais vitais e timeline de sintomas para handoff da equipe.',
      })
    }

    if (!hasUsableOpenAiKey() && !demoModeEnabled) {
      return res.status(500).json({
        error: 'OPENAI_API_KEY nao configurada para Cloud Functions. Ative DEMO_MODE=true para testes sem chave.',
      })
    }

    if (!hasUsableOpenAiKey() && demoModeEnabled) {
      return res.json({
        reply: `Modo demo ativo no Firebase na trilha ${context.careTrack}. Recebi: "${lastUserMessage?.content || ''}". Configure OPENAI_API_KEY para respostas reais.`,
      })
    }

    const client = new OpenAI({ apiKey: getOpenAiKey() })
    const completion = await Promise.race([
      client.chat.completions.create({
        model: openAiModel,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(context),
          },
          ...(context.patientContext
            ? [
                {
                  role: 'system',
                  content: `Contexto clinico informado: ${context.patientContext}`,
                },
              ]
            : []),
          ...sanitizedMessages,
        ],
        temperature: 0.7,
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Tempo limite excedido ao consultar a OpenAI.'))
        }, requestTimeoutMs)
      }),
    ])

    const reply = completion?.choices?.[0]?.message?.content?.trim()

    if (!reply) {
      return res.status(502).json({ error: 'A OpenAI nao retornou texto.' })
    }

    return res.json({ reply })
  } catch (error) {
    const parsed = parseError(error)
    return res.status(parsed.status).json({ error: parsed.message })
  }
})

export const api = onRequest(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  app,
)
