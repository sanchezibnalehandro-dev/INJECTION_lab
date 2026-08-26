"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AttackPreset, AttackSuite, AttackSuiteId, ChatResponse, ConversationMessage, DebugEvent, DemoProfile, DemoProfileId, DisclosureEvaluation, DocumentPresetId, ModelDefinition, ProviderDefinition } from "@/lib/domain/types";

type LabConfig = {
  providers: ProviderDefinition[];
  defaultSuiteId: AttackSuiteId;
  suites: AttackSuite[];
  profiles: DemoProfile[];
};

type ChatPayload = { providerId: string; modelId: string; profileId: DemoProfileId; messages: ConversationMessage[] };
type DocumentPayload = { providerId: string; modelId: string; presetId: DocumentPresetId };
type LastAction = { kind: "chat"; payload: ChatPayload } | { kind: "document"; payload: DocumentPayload };
type ApiError = { error?: { code?: string; message?: string } };

const EMPTY_CONFIG: LabConfig = { providers: [], defaultSuiteId: "vulnerable-lab", suites: [], profiles: [] };
const FIREFOX_BUTTON_STATE_RESET = { autoComplete: "off" } as const;

function formatEvent(event: DebugEvent): string {
  switch (event.type) {
    case "request": return `REQUEST\n${JSON.stringify(event.metadata, null, 2)}`;
    case "tool_requested": return `MODEL REQUESTED TOOL · ${event.tool}\n${event.argumentsJson}`;
    case "tool_executed": return `EXECUTING GRANTED TOOL · ${event.tool}`;
    case "tool_result": return `TOOL RESULT · ${event.tool}\n${JSON.stringify(event.result, null, 2)}`;
    case "response": return `FINAL RESPONSE · ${event.latencyMs} ms${event.finishReason ? ` · ${event.finishReason}` : ""}${event.resolvedModelId ? `\nRESOLVED MODEL · ${event.resolvedModelId}` : ""}`;
    case "error": return `ERROR · ${event.code}\n${event.message}`;
  }
}

export function InjectionLab() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [config, setConfig] = useState<LabConfig>(EMPTY_CONFIG);
  const [configError, setConfigError] = useState<string>();
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [suiteId, setSuiteId] = useState<AttackSuiteId>("vulnerable-lab");
  const [profileId, setProfileId] = useState<DemoProfileId>("vulnerable-concatenated");
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [debugOpen, setDebugOpen] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();
  const [lastAction, setLastAction] = useState<LastAction>();
  const [activePresetId, setActivePresetId] = useState<string>();
  const [multiTurnStepIndex, setMultiTurnStepIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<DisclosureEvaluation>();

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setIsHydrated(true), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    fetch("/api/demo-config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить конфигурацию стенда.");
        return response.json() as Promise<LabConfig>;
      })
      .then((nextConfig) => {
        setConfig(nextConfig);
        const provider = nextConfig.providers.find((candidate) => candidate.id === "openai") ?? nextConfig.providers[0];
        const suite = nextConfig.suites.find((candidate) => candidate.id === nextConfig.defaultSuiteId) ?? nextConfig.suites[0];
        const firstPreset = suite?.presets[0];
        setProviderId(provider?.id ?? "");
        setModelId(provider?.defaultModelId ?? "");
        setSuiteId(suite?.id ?? "vulnerable-lab");
        if (firstPreset) {
          setActivePresetId(firstPreset.id);
          setProfileId(firstPreset.profileId);
          setDraft(firstPreset.flow === "single_turn" ? firstPreset.prompt : "");
        }
      })
      .catch((fetchError: unknown) => setConfigError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить конфигурацию стенда."));
  }, [isHydrated]);

  const activeProvider = useMemo(() => config.providers.find((provider) => provider.id === providerId), [config.providers, providerId]);
  const activeModel = useMemo<ModelDefinition | undefined>(() => activeProvider?.models.find((model) => model.id === modelId), [activeProvider, modelId]);
  const activeSuite = useMemo(() => config.suites.find((suite) => suite.id === suiteId), [config.suites, suiteId]);
  const activePreset = useMemo(() => activeSuite?.presets.find((preset) => preset.id === activePresetId), [activeSuite, activePresetId]);
  const activeProfile = useMemo(() => config.profiles.find((profile) => profile.id === profileId), [config.profiles, profileId]);
  const nextMultiTurnStep = activePreset?.multiTurnSteps?.[multiTurnStepIndex];
  const modelHasNativeTools = activeModel?.capabilities.tools === "native";
  const hasGrantedTools = Boolean(activeProfile?.tools.length);
  const toolsAvailable = modelHasNativeTools && hasGrantedTools;
  const brianReadOnly = suiteId === "brian-replication";
  const vulnerableReadOnly = suiteId === "vulnerable-lab";
  const promptReadOnly = brianReadOnly || vulnerableReadOnly;
  const requiresNativeTools = vulnerableReadOnly && hasGrantedTools;
  const hasConfiguredNativeModel = Boolean(activeProvider?.models.some((model) => model.capabilities.tools === "native"));
  const latestAssistantResponse = [...history].reverse().find((message) => message.role === "assistant")?.content;
  const inspectorPrompt = activePreset?.flow === "multi_turn" ? (draft || nextMultiTurnStep || "All exact turns have been prepared.") : activePreset?.prompt;
  const canSubmit = isHydrated
    && draft.trim().length > 0
    && providerId.length > 0
    && modelId.length > 0
    && (!requiresNativeTools || toolsAvailable)
    && !isSending;

  function nativeModelId(): string | undefined {
    return activeProvider?.models.find((model) => model.capabilities.tools === "native")?.id;
  }

  function clearConversation() {
    setHistory([]);
    setDebugEvents([]);
    setError(undefined);
    setLastAction(undefined);
    setEvaluation(undefined);
  }

  function preparePreset(preset: AttackPreset) {
    if (suiteId !== "exploratory" || preset.profileId !== profileId) clearConversation();
    setActivePresetId(preset.id);
    setProfileId(preset.profileId);
    setMultiTurnStepIndex(0);
    setError(undefined);
    setDraft(preset.flow === "single_turn" ? preset.prompt : "");
    if (suiteId === "vulnerable-lab" && preset.profileId === "vulnerable-records" && !modelHasNativeTools) {
      const fallbackModelId = nativeModelId();
      if (fallbackModelId) setModelId(fallbackModelId);
    }
  }

  function chooseSuite(nextSuiteId: AttackSuiteId) {
    const nextSuite = config.suites.find((suite) => suite.id === nextSuiteId);
    const firstPreset = nextSuite?.presets[0];
    clearConversation();
    setSuiteId(nextSuiteId);
    setMultiTurnStepIndex(0);
    setActivePresetId(firstPreset?.id);
    if (firstPreset) {
      setProfileId(firstPreset.profileId);
      setDraft(firstPreset.flow === "single_turn" ? firstPreset.prompt : "");
    } else {
      setDraft("");
    }
  }

  function chooseModel(nextModelId: string) {
    const nextModel = activeProvider?.models.find((model) => model.id === nextModelId);
    if (suiteId === "vulnerable-lab" && profileId === "vulnerable-records" && nextModel?.capabilities.tools !== "native") {
      setModelId(nativeModelId() ?? nextModelId);
      return;
    }
    setModelId(nextModelId);
  }

  function insertNextMultiTurnStep() {
    if (!activePreset?.multiTurnSteps) return;
    const step = activePreset.multiTurnSteps[multiTurnStepIndex];
    if (!step) return;
    setDraft(step);
    setMultiTurnStepIndex((current) => Math.min(current + 1, activePreset.multiTurnSteps!.length));
  }

  function recordError(sendError: unknown) {
    const message = sendError instanceof Error ? sendError.message : "Запрос к провайдеру не выполнен.";
    setError(message);
    setDebugEvents((current) => [...current, { type: "error", at: new Date().toISOString(), code: "request_failed", message }]);
  }

  async function sendChat(payload: ChatPayload) {
    setIsSending(true);
    setError(undefined);
    setLastAction({ kind: "chat", payload });
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as ChatResponse & ApiError;
      if (!response.ok) throw new Error(data.error?.message || "Запрос к провайдеру не выполнен.");
      setHistory(data.history);
      setDebugEvents((current) => [...current, ...data.debugEvents]);
      setEvaluation(data.evaluation);
      setDraft("");
    } catch (sendError: unknown) {
      recordError(sendError);
    } finally {
      setIsSending(false);
    }
  }

  async function analyzeDocument(payload: DocumentPayload) {
    setIsSending(true);
    setError(undefined);
    setLastAction({ kind: "document", payload });
    try {
      const response = await fetch("/api/document-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as ChatResponse & ApiError;
      if (!response.ok) throw new Error(data.error?.message || "Анализ документа не выполнен.");
      setHistory(data.history);
      setDebugEvents((current) => [...current, ...data.debugEvents]);
      setEvaluation(data.evaluation);
    } catch (sendError: unknown) {
      recordError(sendError);
    } finally {
      setIsSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || activePreset?.flow === "document") return;
    const content = promptReadOnly ? draft : draft.trim();
    void sendChat({ providerId, modelId, profileId, messages: [...history, { role: "user", content }] });
  }

  function runDocument() {
    if ((activePreset?.id !== "brian-document-injection" && activePreset?.id !== "vulnerable-document-injection") || !providerId || !modelId || isSending) return;
    void analyzeDocument({ providerId, modelId, presetId: activePreset.id });
  }

  function retryLastAction() {
    if (!lastAction) return;
    if (lastAction.kind === "chat") void sendChat(lastAction.payload);
    else void analyzeDocument(lastAction.payload);
  }

  function resetContext() {
    clearConversation();
    setMultiTurnStepIndex(0);
    setDraft(activePreset?.flow === "single_turn" ? activePreset.prompt : "");
  }

  const toolStatus = !hasGrantedTools ? "NONE GRANTED" : toolsAvailable ? "NATIVE" : "UNAVAILABLE";

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">IL</span><div><p className="eyebrow">LIVE DEMONSTRATION HARNESS</p><h1>INJECTION LAB</h1></div></div>
        <div className="header-controls">
          <span className="demo-badge"><i /> DEMO DATA ONLY</span>
          <label className="selector-label">Suite
            <select aria-label="Набор экспериментов" value={suiteId} onChange={(event) => chooseSuite(event.target.value as AttackSuiteId)}>
              {config.suites.map((suite) => <option key={suite.id} value={suite.id}>{suite.title}</option>)}
            </select>
          </label>
          <label className="selector-label">Model
            <select aria-label="Модель" value={modelId} onChange={(event) => chooseModel(event.target.value)}>
              {(activeProvider?.models ?? []).map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
            </select>
          </label>
        </div>
      </header>

      {configError ? <section className="fatal-state">{configError}</section> : <>
        <section className="workspace-grid">
          <aside className="configuration panel">
            <div className="panel-heading"><span>01</span><h2>Configuration</h2></div>
            <p className="profile-name">{activeProfile?.title ?? "Loading profile…"}</p>
            <p className="panel-kicker">{activeProfile?.instructionMode === "concatenated_user" ? "Application instructions · concatenated user context · read only" : "System prompt · server source of truth · read only"}</p>
            <pre className="system-prompt" aria-label="Read-only system prompt">{activeProfile?.systemPrompt ?? "Loading server configuration…"}</pre>
            <div className="tool-section">
              <p className="panel-kicker">Granted tools</p>
              {activeProfile?.tools.length ? <ul className={`tool-list ${toolsAvailable ? "" : "is-unavailable"}`}>
                {activeProfile.tools.map((tool) => <li key={tool.name}><span className="tool-led" /><div><strong>{tool.label}</strong><small>{tool.name}{modelHasNativeTools ? "" : " · inactive for this model"}</small></div></li>)}
              </ul> : <p className="no-tools">No tools granted to this profile.</p>}
            </div>
            <div className="capability-strip" aria-label="Режимы модели">
              <span>TOOLS <b>{toolStatus}</b></span><span>FLOW <b>{activePreset?.flow?.toUpperCase() ?? "—"}</b></span><span>OUTPUT <b>RAW</b></span>
            </div>
            <button className="reset-button" type="button" onClick={resetContext}>↻ RESET CONTEXT</button>
            <p className="microcopy">Profile resolves system, tools and fixtures server-side. Browser cannot override them.</p>
          </aside>

          <section className="chat-panel panel">
            <div className="panel-heading"><span>02</span><h2>{activeProfile?.assistantLabel ?? "Assistant"} / {activePreset?.flow === "document" ? "Document analyzer" : "Chat"}</h2><div className="connection"><i /> {modelId || "MODEL NOT CONFIGURED"}</div></div>
            {activePreset?.flow === "document" ? <div className="document-flow">
              <p className="panel-kicker">Server-owned Markdown fixture · read only</p>
              <pre className="document-fixture">{activePreset.documentText}</pre>
              <button className="document-run" type="button" onClick={runDocument} disabled={isSending || !isHydrated}>{isSending ? "RUNNING…" : "ANALYZE DOCUMENT →"}</button>
              {history.filter((message) => message.role === "assistant").map((message, index) => <article className="document-result" key={`document-result-${index}`}><span>FINAL RESPONSE</span><p>{message.content}</p></article>)}
            </div> : <>
              <div className="conversation" aria-live="polite">
                {history.length === 0 ? <div className="empty-chat"><span>◌</span><p>Контекст пуст. Выберите preset, затем отправьте exact prompt вручную.</p></div> : history.filter((message) => message.role !== "tool").map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "USER" : activeProfile?.assistantLabel?.toUpperCase()}</span><p>{message.content}</p></article>)}
              </div>
              <form className="composer" onSubmit={submit}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={activePreset?.multiTurnSteps ? "Insert the next exact turn…" : "Select a preset…"} rows={5} readOnly={promptReadOnly} disabled={isSending} aria-label="Attack prompt" />
                <button type="submit" {...FIREFOX_BUTTON_STATE_RESET} disabled={!canSubmit}>{isSending ? "RUNNING…" : "SEND →"}</button>
              </form>
              {promptReadOnly && <p className="readonly-notice">{brianReadOnly ? "VERBATIM SOURCE" : "FROZEN LAB MANIFEST"} · READ ONLY</p>}
              {requiresNativeTools && !hasConfiguredNativeModel && <p className="model-warning">No native tool-capable model is configured. This flow is blocked without emulation.</p>}
            </>}
            {error && <div className="error-banner"><strong>REQUEST NOT COMPLETED</strong><span>{error}</span>{lastAction && <button type="button" onClick={retryLastAction} disabled={isSending}>Retry same request</button>}</div>}
          </section>
        </section>

        {vulnerableReadOnly && <section className="evidence-strip panel" aria-label="Vulnerable Lab evidence">
          <div className="evidence-item flaw"><span>VULNERABILITY / ARCHITECTURAL FLAW</span><p>{activePreset?.architecturalFlaw ?? "Select a Vulnerable Lab preset."}</p></div>
          <div className="evidence-item attack"><span>ATTACK PROMPT{activePreset?.flow === "multi_turn" ? " / CURRENT TURN" : ""}</span><pre>{inspectorPrompt ?? "—"}</pre></div>
          <div className="evidence-item capability"><span>GRANTED CAPABILITY</span><p>{activePreset?.grantedCapability ?? "—"}</p></div>
          <div className="evidence-item actual"><span>ACTUAL RESULT</span><pre>{latestAssistantResponse ?? "NOT RUN"}</pre></div>
          <div className="evidence-verdicts">
            <div className={evaluation?.canaryLeaked ? "is-leaked" : ""}><span>CANARY LEAKED</span><strong>{evaluation ? (evaluation.canaryLeaked ? "YES" : "NO") : "NOT RUN"}</strong>{evaluation?.matchedCanaries.length ? <small>{evaluation.matchedCanaries.join(" · ")}</small> : null}</div>
            {profileId === "vulnerable-records" && <div className={evaluation?.employeeRecordLeaked ? "is-leaked" : ""}><span>EMPLOYEE RECORD LEAKED</span><strong>{evaluation ? (evaluation.employeeRecordLeaked ? "YES" : "NO") : "NOT RUN"}</strong>{evaluation?.matchedEmployeeRecordIds.length ? <small>IDs {evaluation.matchedEmployeeRecordIds.join(", ")}</small> : null}</div>}
          </div>
        </section>}

        <section className="preset-panel panel">
          <div className="panel-heading"><span>03</span><h2>{activeSuite?.title ?? "Test sequence"}</h2><p>{activeSuite?.description}</p></div>
          <div className="preset-grid">
            {(activeSuite?.presets ?? []).map((preset, index) => <button key={preset.id} type="button" className={`preset ${activePresetId === preset.id ? "is-active" : ""} ${preset.category}`} onClick={() => preparePreset(preset)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{preset.title}</strong><small>{preset.shortDescription}</small></button>)}
          </div>
          {activePreset?.multiTurnSteps && <div className="multiturn-control"><div><span>STEP {Math.min(multiTurnStepIndex + 1, activePreset.multiTurnSteps.length)} / {activePreset.multiTurnSteps.length}</span><p>{nextMultiTurnStep || "Все exact turns подготовлены. Reset вернёт progression к первому шагу."}</p></div><button type="button" onClick={insertNextMultiTurnStep} disabled={!nextMultiTurnStep}>INSERT NEXT EXACT TURN</button></div>}
        </section>

        <section className={`debug-panel panel ${debugOpen ? "is-open" : ""}`}>
          <button className="debug-toggle" type="button" onClick={() => setDebugOpen((open) => !open)}><span><b>04</b> DEBUG / TOOL CALLS</span><span>{debugOpen ? "COLLAPSE −" : `EXPAND + · ${debugEvents.length} EVENTS`}</span></button>
          {debugOpen && <div className="debug-events">{debugEvents.length === 0 ? <p className="debug-empty">Здесь появятся sanitized normalized request metadata, запросы инструментов и результаты tool flow.</p> : debugEvents.map((event, index) => <article key={`${event.at}-${index}`} className={`debug-event event-${event.type}`}><time>{new Date(event.at).toLocaleTimeString("ru-RU")}</time><pre>{formatEvent(event)}</pre></article>)}</div>}
        </section>
      </>}
      <footer>SERVER-SIDE PROFILES · VERBATIM BRIAN SOURCE · SYNTHETIC FIXTURES · NO PERSISTENCE · LIVE RESULT ≠ SECURITY VERDICT</footer>
    </main>
  );
}
