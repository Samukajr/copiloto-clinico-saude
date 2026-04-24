import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type CareTrack = 'reabilitacao' | 'transicao' | 'paliativos'
type Audience = 'equipe' | 'cuidador'

const STORAGE_KEY = 'chatgpt-local-history-v1'
const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim()
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, '')

function buildApiUrl(path: string) {
  if (!API_BASE_URL) {
    return path
  }

  return `${API_BASE_URL}${path}`
}

const QUICK_PROMPTS = {
  reabilitacao: [
    'Monte um plano funcional de 7 dias com metas SMART.',
    'Quais sinais de risco de queda devo monitorar hoje?',
  ],
  transicao: [
    'Crie checklist de transicao segura nas proximas 72h.',
    'Sugira roteiro de reconciliacao medicamentosa para alta.',
  ],
  paliativos: [
    'Estruture manejo inicial de dor e dispneia para discussao clinica.',
    'Quais orientacoes essenciais devo passar ao cuidador hoje?',
  ],
} as const

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return []
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .map((item) => ({
          role: item.role as 'user' | 'assistant',
          content: typeof item.content === 'string' ? item.content : '',
        }))
        .filter((item) => item.content.trim().length > 0)
        .slice(-40)
    } catch {
      return []
    }
  })
  const [prompt, setPrompt] = useState('')
  const [careTrack, setCareTrack] = useState<CareTrack>('reabilitacao')
  const [audience, setAudience] = useState<Audience>('equipe')
  const [patientContext, setPatientContext] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesRef = useRef<HTMLElement | null>(null)

  const canSend = useMemo(() => {
    return prompt.trim().length > 0 && !isLoading
  }, [prompt, isLoading])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
  }, [messages])

  useEffect(() => {
    const container = messagesRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, isLoading])

  function clearConversation() {
    setMessages([])
    setError('')
    localStorage.removeItem(STORAGE_KEY)
  }

  async function sendMessage() {
    const userText = prompt.trim()
    if (!userText || isLoading) {
      return
    }

    const nextMessages = [...messages, { role: 'user' as const, content: userText }]
    setMessages(nextMessages)
    setPrompt('')
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages,
          context: {
            careTrack,
            audience,
            patientContext,
          },
        }),
      })

      if (!response.ok) {
        const detailRaw = await response.text()
        try {
          const detailJson = JSON.parse(detailRaw) as { error?: string }
          throw new Error(detailJson.error || 'Falha ao chamar a API de chat.')
        } catch {
          throw new Error(detailRaw || 'Falha ao chamar a API de chat.')
        }
      }

      const data = (await response.json()) as { reply: string }
      setMessages((current) => [...current, { role: 'assistant', content: data.reply }])
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Erro inesperado.'
      setError(`Falha ao consultar API OpenAI. Detalhe tecnico: ${message}`)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'Nao foi possivel gerar resposta agora. Verifique se a API esta publicada e com OPENAI_API_KEY configurada.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function applyQuickPrompt(text: string) {
    setPrompt(text)
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        void sendMessage()
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendMessage()
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Copiloto Clinico</h1>
          <p>Reabilitacao, transicao de cuidados e cuidados paliativos.</p>
        </div>
        <button type="button" className="ghost" onClick={clearConversation} disabled={isLoading || messages.length === 0}>
          Limpar conversa
        </button>
      </header>

      <section className="clinical-panel" aria-label="Contexto clinico">
        <div className="panel-grid">
          <label>
            Linha de cuidado
            <select value={careTrack} onChange={(event) => setCareTrack(event.target.value as CareTrack)}>
              <option value="reabilitacao">Reabilitacao</option>
              <option value="transicao">Transicao</option>
              <option value="paliativos">Paliativos</option>
            </select>
          </label>

          <label>
            Linguagem alvo
            <select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}>
              <option value="equipe">Equipe assistencial</option>
              <option value="cuidador">Cuidador/familia</option>
            </select>
          </label>
        </div>

        <label>
          Contexto do paciente (idade, diagnosticos, funcionalidade, sintomas)
          <textarea
            value={patientContext}
            onChange={(event) => setPatientContext(event.target.value)}
            rows={3}
            placeholder="Ex.: 78 anos, AVC isquemico, dor 7/10, dependencia parcial para AVDs, cuidadora principal filha."
          />
        </label>

        <div className="quick-prompts">
          {QUICK_PROMPTS[careTrack].map((quickText) => (
            <button key={quickText} type="button" className="chip" onClick={() => applyQuickPrompt(quickText)}>
              {quickText}
            </button>
          ))}
        </div>

        <p className="banner-alert">
          Uso profissional assistido por IA. Nao substitui avaliacao clinica, prescricao ou condutas de emergencia.
        </p>
      </section>

      <section className="messages" aria-live="polite" ref={messagesRef}>
        {messages.length === 0 ? (
          <article className="message assistant">
            <p>Envie uma pergunta para iniciar a conversa.</p>
          </article>
        ) : (
          messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <p>{message.content}</p>
            </article>
          ))
        )}

        {isLoading && (
          <article className="message assistant pending">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
          </article>
        )}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Digite sua mensagem"
          rows={3}
        />
        <div className="composer-footer">
          {error ? <span className="error">{error}</span> : <span className="hint">Digite envia, Shift+Enter quebra linha</span>}
          <button type="submit" className="send-btn" disabled={!canSend} aria-label="Enviar mensagem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </main>
  )
}

export default App
