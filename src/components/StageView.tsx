"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttackPreset, AttackSuite, ConversationMessage, DebugEvent, DemoProfile, DisclosureEvaluation, ModelDefinition } from "@/lib/domain/types";
import styles from "./StageView.module.css";

type DrawerKind = "system" | "tools" | "why" | "debug";

type StageViewProps = {
  suite?: AttackSuite;
  preset?: AttackPreset;
  profile?: DemoProfile;
  models: ModelDefinition[];
  modelId: string;
  history: ConversationMessage[];
  debugEvents: DebugEvent[];
  evaluation?: DisclosureEvaluation;
  multiTurnStepIndex: number;
  nextMultiTurnStep?: string;
  isSending: boolean;
  isHydrated: boolean;
  error?: string;
  requiresNativeTools: boolean;
  hasConfiguredNativeModel: boolean;
  onChooseModel: (modelId: string) => void;
  onChoosePreset: (preset: AttackPreset) => void;
  onReset: () => void;
  onRunDocument: () => void;
  onRunPrompt: (content: string, advanceMultiTurn: boolean) => void;
  onRetry: () => void;
  onOpenLab: () => void;
};

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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export function StageView({
  suite,
  preset,
  profile,
  models,
  modelId,
  history,
  debugEvents,
  evaluation,
  multiTurnStepIndex,
  nextMultiTurnStep,
  isSending,
  isHydrated,
  error,
  requiresNativeTools,
  hasConfiguredNativeModel,
  onChooseModel,
  onChoosePreset,
  onReset,
  onRunDocument,
  onRunPrompt,
  onRetry,
  onOpenLab,
}: StageViewProps) {
  const [drawer, setDrawer] = useState<DrawerKind>();
  const presets = suite?.presets ?? [];
  const activeIndex = Math.max(0, presets.findIndex((candidate) => candidate.id === preset?.id));
  const assistantMessages = history.filter((message) => message.role === "assistant");
  const hasRun = assistantMessages.length > 0;
  const messageRows = history.filter((message) => message.role !== "tool");
  const latestAssistantIndex = useMemo(() => {
    for (let index = messageRows.length - 1; index >= 0; index -= 1) {
      if (messageRows[index].role === "assistant") return index;
    }
    return -1;
  }, [messageRows]);

  const visibleToolEvents = debugEvents
    .filter((event) => event.type === "tool_requested" || event.type === "tool_executed" || event.type === "tool_result")
    .slice(-4);

  const isMultiTurn = preset?.flow === "multi_turn";
  const isDocument = preset?.flow === "document";
  const multiTurnTotal = preset?.multiTurnSteps?.length ?? 0;
  const currentPrompt = isDocument
    ? preset?.documentText ?? ""
    : isMultiTurn
      ? nextMultiTurnStep ?? "Все шаги отправлены. Сбросьте контекст, чтобы повторить сценарий."
      : preset?.prompt ?? "";

  const primaryDisabled = !isHydrated
    || isSending
    || !preset
    || (requiresNativeTools && !hasConfiguredNativeModel)
    || (isMultiTurn ? !nextMultiTurnStep : hasRun);

  const primaryLabel = isSending
    ? "RUNNING…"
    : isDocument
      ? "ANALYZE DOCUMENT →"
      : isMultiTurn
        ? `SEND TURN ${Math.min(multiTurnStepIndex + 1, Math.max(multiTurnTotal, 1))} →`
        : "RUN ATTACK →";

  function chooseRelative(offset: number) {
    if (!presets.length) return;
    const nextIndex = activeIndex + offset;
    if (nextIndex < 0 || nextIndex >= presets.length) return;
    onChoosePreset(presets[nextIndex]);
  }

  function runPrimary() {
    if (primaryDisabled || !preset) return;
    if (isDocument) {
      onRunDocument();
      return;
    }
    if (isMultiTurn) {
      if (nextMultiTurnStep) onRunPrompt(nextMultiTurnStep, true);
      return;
    }
    onRunPrompt(preset.prompt, false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        setDrawer(undefined);
        return;
      }
      if (drawer) return;

      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (presets[index]) {
          event.preventDefault();
          onChoosePreset(presets[index]);
        }
        return;
      }

      switch (event.key.toLowerCase()) {
        case "arrowleft": event.preventDefault(); chooseRelative(-1); break;
        case "arrowright": event.preventDefault(); chooseRelative(1); break;
        case "enter": event.preventDefault(); runPrimary(); break;
        case " ":
          if (isMultiTurn) {
            event.preventDefault();
            runPrimary();
          }
          break;
        case "r": event.preventDefault(); onReset(); break;
        case "d": event.preventDefault(); setDrawer("debug"); break;
        case "s": event.preventDefault(); setDrawer("system"); break;
        case "t": event.preventDefault(); setDrawer("tools"); break;
        case "w": event.preventDefault(); setDrawer("why"); break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, drawer, isMultiTurn, nextMultiTurnStep, onChoosePreset, onReset, presets, primaryDisabled]);

  const disclosureObserved = evaluation?.disclosureObserved ?? false;
  const canaryState = evaluation ? (evaluation.canaryLeaked ? "DETECTED" : "NO") : "NOT RUN";
  const employeeState = evaluation ? (evaluation.employeeRecordLeaked ? "DETECTED" : "NO") : "NOT RUN";

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>IL</span>
          <div className={styles.brandText}><small>LIVE DEMONSTRATION</small><strong>INJECTION LAB</strong></div>
        </div>
        <div className={styles.scenario}>
          <span className={styles.scenarioIndex}>{String(activeIndex + 1).padStart(2, "0")} / {String(Math.max(presets.length, 1)).padStart(2, "0")}</span>
          <h1>{preset?.title ?? "Loading scenario…"}</h1>
        </div>
        <div className={styles.topActions}>
          <label className={styles.modelSelect}>Model
            <select value={modelId} onChange={(event) => onChooseModel(event.target.value)} aria-label="Модель для демонстрации">
              {models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
            </select>
          </label>
          <button className={styles.modeButton} type="button" onClick={onOpenLab}>LAB MODE</button>
        </div>
      </header>

      <section className={styles.mainGrid}>
        <article className={`${styles.panel} ${styles.attackPanel}`}>
          <span className={styles.kicker}>{isDocument ? "UNTRUSTED DOCUMENT" : isMultiTurn ? "CURRENT TURN" : "ATTACK PROMPT"}</span>
          <div>
            <h2>{preset?.title ?? "—"}</h2>
            <p className={styles.description}>{preset?.shortDescription ?? ""}</p>
          </div>
          <pre className={styles.promptBox}>{currentPrompt || "—"}</pre>
          <div className={styles.promptMeta}>
            <span>{isDocument ? "DOCUMENT FIXTURE" : isMultiTurn ? `TURN ${Math.min(multiTurnStepIndex + 1, Math.max(multiTurnTotal, 1))} / ${multiTurnTotal}` : "FROZEN LAB MANIFEST"}</span>
            {isMultiTurn && <span className={styles.turnProgress} aria-label="Прогресс multi-turn сценария">
              {Array.from({ length: multiTurnTotal }, (_, index) => <i key={index} className={`${styles.turnDot} ${index < multiTurnStepIndex ? styles.turnDotDone : ""}`} />)}
            </span>}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.responsePanel}`}>
          <div className={styles.responseHeader}>
            <div className={styles.responseIdentity}><small>MODEL OUTPUT</small><strong>{profile?.assistantLabel ?? "Assistant"}</strong></div>
            <div className={styles.connection}><i /> {modelId || "MODEL NOT CONFIGURED"}</div>
          </div>
          <div className={styles.conversation} aria-live="polite">
            {messageRows.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>◌</div><p>Сценарий готов. Запустите атаку и смотрите только на то, что модель реально сделает в этом прогоне.</p></div> : messageRows.map((message, index) => {
              const isLatest = index === latestAssistantIndex && message.role === "assistant";
              return <article key={`${message.role}-${index}`} className={`${styles.message} ${message.role === "user" ? styles.messageUser : ""} ${isLatest ? styles.messageLatest : ""}`}>
                <span className={styles.messageLabel}>{message.role === "user" ? "USER" : profile?.assistantLabel?.toUpperCase() ?? "ASSISTANT"}</span>
                <p>{message.content}</p>
              </article>;
            })}
          </div>
          <div className={styles.toolFlow}>
            <span className={styles.toolFlowLabel}>TOOL FLOW</span>
            {visibleToolEvents.length === 0 ? <span className={styles.noToolFlow}>{profile?.tools.length ? "No tool call in this run yet." : "No tools granted for this scenario."}</span> : visibleToolEvents.map((event, index) => {
              if (event.type === "tool_requested") return <span key={`${event.at}-${index}`} className={styles.toolCard}>REQUESTED · {event.tool}</span>;
              if (event.type === "tool_executed") return <span key={`${event.at}-${index}`} className={styles.toolCard}>EXECUTING · {event.tool}</span>;
              if (event.type === "tool_result") return <span key={`${event.at}-${index}`} className={`${styles.toolCard} ${styles.toolCardResult}`}>RESULT RETURNED · {event.tool}</span>;
              return null;
            })}
          </div>
        </article>
      </section>

      <section className={styles.verdictBar} aria-label="Leak detection for current run">
        <div className={styles.verdictLead}>
          <span className={`${styles.statusDot} ${evaluation ? (disclosureObserved ? styles.statusLeak : styles.statusClean) : ""}`} />
          <small>CURRENT RUN</small>
          <strong>{evaluation ? (disclosureObserved ? "DISCLOSURE DETECTED IN THIS RUN" : "NO MATCHED DISCLOSURE IN FINAL RESPONSE") : "NOT RUN YET"}</strong>
        </div>
        <div className={`${styles.verdictItem} ${evaluation?.canaryLeaked ? styles.verdictItemLeak : ""}`}><small>CANARY</small><strong>{canaryState}</strong></div>
        {profile?.id === "vulnerable-records" && <div className={`${styles.verdictItem} ${evaluation?.employeeRecordLeaked ? styles.verdictItemLeak : ""}`}><small>EMPLOYEE RECORD</small><strong>{employeeState}</strong></div>}
      </section>

      <nav className={styles.controls} aria-label="Управление демонстрацией">
        <button className={styles.controlButton} type="button" onClick={() => chooseRelative(-1)} disabled={activeIndex <= 0}>← PREV</button>
        <button className={`${styles.controlButton} ${styles.dangerButton}`} type="button" onClick={onReset}>RESET <span className={styles.hotkey}>R</span></button>
        <button className={`${styles.controlButton} ${styles.primary}`} type="button" onClick={runPrimary} disabled={primaryDisabled}>{primaryLabel}</button>
        <button className={styles.controlButton} type="button" onClick={() => chooseRelative(1)} disabled={activeIndex >= presets.length - 1}>NEXT →</button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("system")}>SYSTEM <span className={styles.hotkey}>S</span></button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("why")}>WHY? <span className={styles.hotkey}>W</span></button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("debug")}>DEBUG <span className={styles.hotkey}>D</span></button>
      </nav>

      {requiresNativeTools && !hasConfiguredNativeModel && <div className={styles.errorBanner}><strong>MODEL CAPABILITY</strong><span>No native tool-capable model is configured. This scenario is blocked without emulation.</span></div>}
      {error && <div className={styles.errorBanner}><strong>REQUEST FAILED</strong><span>{error}</span><button type="button" onClick={onRetry} disabled={isSending}>Retry</button></div>}

      {drawer && <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(undefined); }}>
        <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Presenter detail panel">
          <div className={styles.drawerHeader}><span>PRESENTER DETAIL</span><h2>{drawer === "system" ? "System prompt" : drawer === "tools" ? "Granted tools" : drawer === "why" ? "Why this can work" : "Debug / tool trace"}</h2><button className={styles.drawerClose} type="button" onClick={() => setDrawer(undefined)} aria-label="Закрыть">×</button></div>
          <div className={styles.drawerBody}>
            {drawer === "system" && <pre>{profile?.systemPrompt ?? "No system prompt loaded."}</pre>}
            {drawer === "tools" && (profile?.tools.length ? <ul className={styles.toolList}>{profile.tools.map((tool) => <li key={tool.name}><strong>{tool.label}</strong><small>{tool.name}</small><small>{tool.description}</small></li>)}</ul> : <p>No tools are granted to this profile.</p>)}
            {drawer === "why" && <div><p>{preset?.architecturalFlaw ?? "This preset does not define a separate architectural-flaw note."}</p>{preset?.grantedCapability && <p style={{ marginTop: 16 }}><strong>Granted capability:</strong><br />{preset.grantedCapability}</p>}</div>}
            {drawer === "debug" && <div className={styles.debugList}>{debugEvents.length ? debugEvents.map((event, index) => <article className={styles.debugEvent} key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString("ru-RU")}</time><pre>{formatEvent(event)}</pre></article>) : <p>No debug events yet.</p>}</div>}
          </div>
        </aside>
      </div>}
    </main>
  );
}
