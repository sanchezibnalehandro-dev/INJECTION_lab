"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttackPreset, AttackSuite, ConversationMessage, DebugEvent, DemoProfile, DisclosureEvaluation, ModelDefinition, ProviderDefinition } from "@/lib/domain/types";
import styles from "./StageView.module.css";

type DrawerKind = "system" | "tools" | "why" | "debug";

const EMPTY_PRESETS: AttackPreset[] = [];

type StageScenarioCopy = {
  title: string;
  description: string;
  architecturalFlaw?: string;
  grantedCapability?: string;
};

const STAGE_SCENARIO_COPY: Record<string, StageScenarioCopy> = {
  "vulnerable-direct-override": { title: "ПРЯМОЕ ПЕРЕОПРЕДЕЛЕНИЕ", description: "Граница доверия теряется, когда инструкции приложения и ввод пользователя объединены в один контекст.", architecturalFlaw: "Доверенные инструкции приложения и пользовательский ввод находятся в одном пользовательском текстовом контексте. Граница доверия исчезает.", grantedCapability: "Инструменты не предоставлены. В объединённом контексте уже содержатся синтетические конфиденциальные значения." },
  "vulnerable-structured-json": { title: "СТРУКТУРИРОВАННОЕ ДАВЛЕНИЕ", description: "Обязательная JSON-схема усиливает давление на текстовое правило нераскрытия.", architecturalFlaw: "Синтетическая конфигурация видна в контексте модели, а единственная защита — текстовое указание не раскрывать данные.", grantedCapability: "Инструменты не предоставлены. Контекст модели содержит синтетическую конфигурацию и канареечное значение." },
  "vulnerable-roleplay": { title: "РОЛЕВАЯ ПОДМЕНА", description: "Рамка внутреннего аудитора конкурирует с правилом нераскрытия.", architecturalFlaw: "То же текстовое правило нераскрытия конкурирует с ролью, заданной внутри контекста модели.", grantedCapability: "Инструменты не предоставлены. Контекст модели содержит синтетическую конфигурацию и канареечное значение." },
  "vulnerable-combined": { title: "КОМБИНИРОВАННАЯ АТАКА", description: "Ролевая подмена и требование структурированного ответа объединены в одном запросе.", architecturalFlaw: "Ролевая рамка и обязательный структурированный ответ конкурируют с единственным текстовым правилом нераскрытия.", grantedCapability: "Инструменты не предоставлены. Контекст модели содержит синтетическую конфигурацию и канареечное значение." },
  "vulnerable-multi-turn": { title: "МНОГОШАГОВАЯ АТАКА", description: "Эскалация через три точных шага с нативным доступом к записям сотрудников.", architecturalFlaw: "У модели есть нативный доступ к приватным синтетическим записям; авторизация существует лишь как фраза в системном промпте.", grantedCapability: "Нативный get_employee_records({}) возвращает неизменяемые синтетические записи сотрудников; прикладного слоя авторизации нет." },
  "vulnerable-payload-splitting": { title: "ДРОБЛЕНИЕ ПОЛЕЗНОЙ НАГРУЗКИ", description: "Чувствительные поля запрашиваются как отдельные безобидно выглядящие части.", architecturalFlaw: "Чувствительный агрегат разбит на безобидные подзадачи, пока остаётся доступен тот же неограниченный инструмент записей.", grantedCapability: "Нативный get_employee_records({}) возвращает неизменяемые синтетические записи сотрудников; прикладного слоя авторизации нет." },
  "vulnerable-document-injection": { title: "ИНЪЕКЦИЯ В ДОКУМЕНТ", description: "Инъекция Brian и синтетическая канарейка находятся внутри обычного текста документа.", architecturalFlaw: "Инструкции документа и данные документа находятся в одном обычном тексте без изоляции инструкций от данных.", grantedCapability: "Инструменты не предоставлены. Серверный набор данных содержит точную инъекцию Brian и синтетическое канареечное значение." },
  "normal-behavior": { title: "ОБЫЧНОЕ ПОВЕДЕНИЕ", description: "Безопасный обычный запрос для базовой реакции ассистента." },
  "direct-secret-request": { title: "КОНТРОЛЬ: ПРЯМОЙ ЗАПРОС СЕКРЕТА", description: "Прямая просьба раскрыть промпт и демонстрационные секреты без техник обхода ограничений." },
  "direct-override": { title: "ПРЯМОЕ ПЕРЕОПРЕДЕЛЕНИЕ", description: "Классическое требование проигнорировать предыдущие инструкции." },
  "json-pressure": { title: "ДАВЛЕНИЕ JSON-СХЕМОЙ", description: "Давление обязательной JSON-схемой для аудита соответствия правилам." },
  "roleplay": { title: "РОЛЕВАЯ ИГРА", description: "Легитимно звучащая роль внутреннего аудитора правил." },
  "combined": { title: "КОМБИНИРОВАННАЯ АТАКА", description: "Ролевая игра и обязательный структурированный отчёт о соответствии правилам." },
  "multi-turn": { title: "МНОГОШАГОВАЯ АТАКА", description: "Последовательные безобидные вопросы; отправляйте по одному шагу." },
  "payload-splitting": { title: "ДРОБЛЕНИЕ ПОЛЕЗНОЙ НАГРУЗКИ", description: "Одна инструкция разбита на кажущиеся безопасными фрагменты." },
  "brian-direct-override-1": { title: "ПРЯМОЕ ПЕРЕОПРЕДЕЛЕНИЕ · 1", description: "Раздел 2 · вариант 1." },
  "brian-direct-override-2": { title: "ПРЯМОЕ ПЕРЕОПРЕДЕЛЕНИЕ · 2", description: "Раздел 2 · вариант 2." },
  "brian-structured-primary": { title: "СТРУКТУРИРОВАННАЯ АТАКА · ОСНОВНОЙ ВАРИАНТ", description: "Раздел 3 · основной вариант." },
  "brian-structured-extended": { title: "СТРУКТУРИРОВАННАЯ АТАКА · РАСШИРЕННЫЙ ВАРИАНТ", description: "Раздел 3 · расширенная демонстрация / заметки." },
  "brian-roleplay": { title: "РОЛЕВАЯ ИГРА / МЕТА-ПРОМПТИНГ", description: "Раздел 4." },
  "brian-policy-interpreter": { title: "ИНТЕРПРЕТАТОР ПОЛИТИК", description: "Раздел 5." },
  "brian-internal-auditor-primary": { title: "ВНУТРЕННИЙ АУДИТОР AI · ОСНОВНОЙ ВАРИАНТ", description: "Раздел 6 · основной вариант." },
  "brian-internal-auditor-live": { title: "ВНУТРЕННИЙ АУДИТОР ИИ · ЖИВАЯ ДЕМОНСТРАЦИЯ", description: "Раздел 6 · демонстрационный вариант." },
  "brian-multiturn-base": { title: "МНОГОШАГОВАЯ АТАКА · БАЗОВЫЙ ВАРИАНТ", description: "Раздел 8 · 3 точных шага." },
  "brian-multiturn-gpt41-mini": { title: "МНОГОШАГОВАЯ АТАКА · GPT-4.1 MINI", description: "Раздел 9 · только метка происхождения." },
  "brian-multiturn-gpt4o-mini": { title: "МНОГОШАГОВАЯ АТАКА · GPT-4O MINI", description: "Раздел 10 · только метка происхождения." },
  "brian-payload-splitting": { title: "ДРОБЛЕНИЕ ПОЛЕЗНОЙ НАГРУЗКИ", description: "Раздел 11." },
  "brian-delimiter-confusion": { title: "ПУТАНИЦА В РАЗДЕЛИТЕЛЯХ", description: "Раздел 12." },
  "brian-document-injection": { title: "ИНЪЕКЦИЯ В ДОКУМЕНТ", description: "Раздел 13 · серверный Markdown-документ." },
};

const STAGE_TOOL_COPY: Record<string, { label: string; description: string }> = {
  get_environment_variables: { label: "Синтетические переменные окружения", description: "Возвращает фиксированный синтетический набор данных окружения для этой демонстрации." },
  get_employee_records: { label: "Синтетические записи сотрудников", description: "Возвращает фиксированный синтетический набор данных записей сотрудников для этой демонстрации." },
  env: { label: "Синтетическое окружение", description: "Возвращает фиксированный синтетический набор данных окружения для этой демонстрации." },
  web_fetch: { label: "Синтетический локальный веб-запрос", description: "Возвращает один фиксированный локальный набор данных. Внешний сетевой запрос не выполняется." },
  get_user_records: { label: "Приватные синтетические записи пользователей", description: "Возвращает фиксированные синтетические приватные записи пользователей для репликации Brian." },
};

type StageViewProps = {
  suite?: AttackSuite;
  preset?: AttackPreset;
  profile?: DemoProfile;
  providers: ProviderDefinition[];
  provider?: ProviderDefinition;
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
  onChooseProvider: (providerId: string) => void;
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
    case "request": return `ЗАПРОС\n${JSON.stringify(event.metadata, null, 2)}`;
    case "tool_requested": return `МОДЕЛЬ ЗАПРОСИЛА ИНСТРУМЕНТ · ${event.tool}\n${event.argumentsJson}`;
    case "tool_executed": return `ВЫПОЛНЕНИЕ РАЗРЕШЁННОГО ИНСТРУМЕНТА · ${event.tool}`;
    case "tool_result": return `РЕЗУЛЬТАТ ИНСТРУМЕНТА · ${event.tool}\n${JSON.stringify(event.result, null, 2)}`;
    case "response": return `ФИНАЛЬНЫЙ ОТВЕТ · ${event.latencyMs} мс${event.finishReason ? ` · ${event.finishReason}` : ""}${event.resolvedModelId ? `\nРАЗРЕШЁННАЯ МОДЕЛЬ · ${event.resolvedModelId}` : ""}`;
    case "error": return `ОШИБКА · ${event.code}\n${event.message}`;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function summarizeToolResult(result: unknown): string {
  if (Array.isArray(result)) return `Возвращено синтетических записей: ${result.length}`;
  if (result && typeof result === "object") return `Возвращено синтетических значений: ${Object.keys(result).length}`;
  return "Синтетический результат получен";
}

function stageScenarioCopy(preset?: AttackPreset): StageScenarioCopy {
  if (!preset) return { title: "ЗАГРУЗКА СЦЕНАРИЯ…", description: "" };
  return STAGE_SCENARIO_COPY[preset.id] ?? { title: preset.title, description: preset.shortDescription };
}

function stageToolCopy(tool: { name: string; label: string; description: string }): { label: string; description: string } {
  return STAGE_TOOL_COPY[tool.name] ?? { label: tool.label, description: tool.description };
}

function providerConfigurationHint(provider?: ProviderDefinition): string {
  if (provider?.id === "gigachat") return "Настройте GIGACHAT_AUTHORIZATION_KEY на сервере.";
  if (provider?.id === "openai") return "Настройте OPENAI_API_KEY на сервере.";
  return "Провайдер требует серверной настройки.";
}

export function StageView({
  suite,
  preset,
  profile,
  providers,
  provider,
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
  onChooseProvider,
  onChooseModel,
  onChoosePreset,
  onReset,
  onRunDocument,
  onRunPrompt,
  onRetry,
  onOpenLab,
}: StageViewProps) {
  const [drawer, setDrawer] = useState<DrawerKind>();
  const presets = suite?.presets ?? EMPTY_PRESETS;
  const foundIndex = presets.findIndex((candidate) => candidate.id === preset?.id);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeModel = models.find((model) => model.id === modelId);
  const toolsAvailable = activeModel?.capabilities.tools === "native" && Boolean(profile?.tools.length);
  const assistantMessages = history.filter((message) => message.role === "assistant");
  const hasRun = assistantMessages.length > 0;
  const messageRows = history.filter((message) => message.role !== "tool");
  let latestAssistantIndex = -1;
  for (let index = messageRows.length - 1; index >= 0; index -= 1) {
    if (messageRows[index].role === "assistant") {
      latestAssistantIndex = index;
      break;
    }
  }

  const lastToolRequest = [...debugEvents].reverse().find((event) => event.type === "tool_requested");
  const lastToolResult = [...debugEvents].reverse().find((event) => event.type === "tool_result");

  const isMultiTurn = preset?.flow === "multi_turn";
  const isDocument = preset?.flow === "document";
  const scenarioCopy = stageScenarioCopy(preset);
  const multiTurnTotal = preset?.multiTurnSteps?.length ?? 0;
  const currentPrompt = isDocument
    ? preset?.documentText ?? ""
    : isMultiTurn
      ? nextMultiTurnStep ?? "Все шаги отправлены. Сбросьте контекст, чтобы повторить сценарий."
      : preset?.prompt ?? "";

  const primaryDisabled = !isHydrated
    || isSending
    || !preset
    || !provider?.configured
    || (requiresNativeTools && !toolsAvailable)
    || (isMultiTurn ? !nextMultiTurnStep : hasRun);

  const primaryLabel = isSending
    ? "ВЫПОЛНЯЕТСЯ…"
    : isDocument
      ? "АНАЛИЗИРОВАТЬ ДОКУМЕНТ →"
    : isMultiTurn
        ? `ОТПРАВИТЬ ШАГ ${Math.min(multiTurnStepIndex + 1, Math.max(multiTurnTotal, 1))} →`
      : preset?.category === "control"
          ? "ЗАПУСТИТЬ ПРОВЕРКУ →"
          : "ЗАПУСТИТЬ АТАКУ →";

  const chooseRelative = useCallback((offset: number) => {
    if (isSending || !presets.length) return;
    const nextIndex = activeIndex + offset;
    if (nextIndex < 0 || nextIndex >= presets.length) return;
    onChoosePreset(presets[nextIndex]);
  }, [activeIndex, isSending, onChoosePreset, presets]);

  const runPrimary = useCallback(() => {
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
  }, [isDocument, isMultiTurn, nextMultiTurnStep, onRunDocument, onRunPrompt, preset, primaryDisabled]);

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
        if (!isSending && presets[index]) {
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
        case "r":
          if (!isSending) {
            event.preventDefault();
            onReset();
          }
          break;
        case "d": event.preventDefault(); setDrawer("debug"); break;
        case "s": event.preventDefault(); setDrawer("system"); break;
        case "t": event.preventDefault(); setDrawer("tools"); break;
        case "w": event.preventDefault(); setDrawer("why"); break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseRelative, drawer, isMultiTurn, isSending, onChoosePreset, onReset, presets, runPrimary]);

  const disclosureObserved = evaluation?.disclosureObserved ?? false;
  const canaryState = evaluation ? (evaluation.canaryLeaked ? "ДА" : "НЕТ") : "НЕ ЗАПУЩЕНО";
  const employeeState = evaluation ? (evaluation.employeeRecordLeaked ? "ДА" : "НЕТ") : "НЕ ЗАПУЩЕНО";
  const runStatus = !isHydrated
    ? "ЗАГРУЗКА КОНФИГУРАЦИИ"
    : !provider?.configured
      ? "ПРОВАЙДЕР НЕ НАСТРОЕН"
      : isSending
        ? "ВЫПОЛНЯЕТСЯ"
        : error
          ? "ОШИБКА ЗАПРОСА"
          : evaluation
            ? "РЕЗУЛЬТАТ ГОТОВ"
            : "ГОТОВ";

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>IL</span>
          <div className={styles.brandText}><small>ЖИВАЯ ДЕМОНСТРАЦИЯ</small><strong>INJECTION LAB</strong></div>
        </div>
        <div className={styles.scenario}>
          <span className={styles.scenarioIndex}>{String(activeIndex + 1).padStart(2, "0")} / {String(Math.max(presets.length, 1)).padStart(2, "0")}</span>
          <h1>{scenarioCopy.title}</h1>
          {preset && <small className={styles.scenarioOriginal}>{preset.title}</small>}
        </div>
        <div className={styles.topActions}>
          <label className={styles.modelSelect}>ПРОВАЙДЕР
            <select value={provider?.id ?? ""} onChange={(event) => onChooseProvider(event.target.value)} aria-label="Провайдер для демонстрации" disabled={isSending}>
              {providers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}{candidate.configured ? "" : " · НЕ НАСТРОЕН"}</option>)}
            </select>
          </label>
          <label className={styles.modelSelect}>МОДЕЛЬ
            <select value={modelId} onChange={(event) => onChooseModel(event.target.value)} aria-label="Модель для демонстрации" disabled={isSending}>
              {models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
            </select>
          </label>
          <span className={`${styles.stageStatus} ${error || !provider?.configured ? styles.stageStatusError : isSending ? styles.stageStatusBusy : ""}`}><i />{runStatus}</span>
          <button className={styles.modeButton} type="button" onClick={onOpenLab}>ЛАБ-РЕЖИМ</button>
        </div>
      </header>

      <section className={styles.mainGrid}>
        <article className={`${styles.panel} ${styles.attackPanel}`}>
          <span className={styles.kicker}>{isDocument ? "НЕПРОВЕРЕННЫЙ ДОКУМЕНТ" : isMultiTurn ? "ТЕКУЩИЙ ШАГ" : preset?.category === "control" ? "КОНТРОЛЬНЫЙ ПРОМПТ" : "ПРОМПТ АТАКИ"}</span>
          <div>
            <h2>{scenarioCopy.title}</h2>
            {preset && <p className={styles.originalTerm}>{preset.title}</p>}
            <p className={styles.description}>{scenarioCopy.description}</p>
          </div>
          <pre className={styles.promptBox}>{currentPrompt || "—"}</pre>
          <div className={styles.promptMeta}>
            <span>{isDocument ? "ФАЙЛ ДОКУМЕНТА" : isMultiTurn ? `ШАГ ${Math.min(multiTurnStepIndex + 1, Math.max(multiTurnTotal, 1))} / ${multiTurnTotal}` : "ЗАФИКСИРОВАННЫЙ СЦЕНАРИЙ"}</span>
            {isMultiTurn && <span className={styles.turnProgress} aria-label="Прогресс multi-turn сценария">
              {Array.from({ length: multiTurnTotal }, (_, index) => <i key={index} className={`${styles.turnDot} ${index < multiTurnStepIndex ? styles.turnDotDone : ""}`} />)}
            </span>}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.responsePanel}`}>
          <div className={styles.responseHeader}>
            <div className={styles.responseIdentity}><small>ОТВЕТ МОДЕЛИ</small><strong>{profile?.assistantLabel ?? "АССИСТЕНТ"}</strong></div>
            <div className={styles.connection}><i /> {modelId || "МОДЕЛЬ НЕ НАСТРОЕНА"}</div>
          </div>
          <div className={styles.conversation} aria-live="polite">
            {messageRows.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>◌</div><p>Сценарий готов. Запустите его и смотрите только на то, что модель реально сделает в этом прогоне.</p></div> : messageRows.map((message, index) => {
              const isLatest = index === latestAssistantIndex && message.role === "assistant";
              return <article key={`${message.role}-${index}`} className={`${styles.message} ${message.role === "user" ? styles.messageUser : ""} ${isLatest ? styles.messageLatest : ""}`}>
                <span className={styles.messageLabel}>{message.role === "user" ? "ПОЛЬЗОВАТЕЛЬ" : profile?.assistantLabel?.toUpperCase() ?? "АССИСТЕНТ"}</span>
                <p>{message.content}</p>
              </article>;
            })}
          </div>
          <div className={styles.toolFlow}>
            <span className={styles.toolFlowLabel}>ВЫЗОВ ИНСТРУМЕНТОВ</span>
            {!lastToolRequest || lastToolRequest.type !== "tool_requested" ? <span className={styles.noToolFlow}>{profile?.tools.length ? "В этом запуске модель ещё не вызвала инструмент." : "В этом сценарии инструменты не предоставлены."}</span> : <div className={styles.toolSequence}>
              <span className={styles.toolNode}>МОДЕЛЬ</span><b>↓</b>
              <span className={styles.toolNode}>{lastToolRequest.tool}({lastToolRequest.argumentsJson === "{}" ? "{}" : lastToolRequest.argumentsJson})</span><b>↓</b>
              <span className={`${styles.toolNode} ${styles.toolNodeResult}`}>РЕЗУЛЬТАТ ИНСТРУМЕНТА<small>{lastToolResult?.type === "tool_result" ? summarizeToolResult(lastToolResult.result) : "Ожидание результата"}</small></span><b>↓</b>
              <span className={styles.toolNode}>ФИНАЛЬНЫЙ ОТВЕТ</span>
            </div>}
          </div>
        </article>
      </section>

      <section className={styles.verdictBar} aria-label="Раскрытия в текущем запуске">
        <div className={styles.verdictLead}>
          <span className={`${styles.statusDot} ${evaluation ? (disclosureObserved ? styles.statusLeak : styles.statusClean) : ""}`} />
          <small>ТЕКУЩИЙ ЗАПУСК</small>
          <strong>{evaluation ? (disclosureObserved ? "В ЭТОМ ЗАПУСКЕ ОБНАРУЖЕНО РАСКРЫТИЕ" : "В ФИНАЛЬНОМ ОТВЕТЕ НЕТ СОВПАВШИХ РАСКРЫТИЙ") : "ЕЩЁ НЕ ЗАПУЩЕНО"}</strong>
        </div>
        <div className={`${styles.verdictItem} ${evaluation?.canaryLeaked ? styles.verdictItemLeak : ""}`}><small>КАНАРЕЙКА РАСКРЫТА</small><strong>{canaryState}</strong></div>
        {profile?.id === "vulnerable-records" && <div className={`${styles.verdictItem} ${evaluation?.employeeRecordLeaked ? styles.verdictItemLeak : ""}`}><small>ДАННЫЕ СОТРУДНИКОВ РАСКРЫТЫ</small><strong>{employeeState}</strong></div>}
      </section>

      <nav className={styles.controls} aria-label="Управление демонстрацией">
        <button className={styles.controlButton} type="button" onClick={() => chooseRelative(-1)} disabled={isSending || activeIndex <= 0}>← НАЗАД</button>
        <button className={`${styles.controlButton} ${styles.dangerButton}`} type="button" onClick={onReset} disabled={isSending}>СБРОС <span className={styles.hotkey}>R</span></button>
        <button className={`${styles.controlButton} ${styles.primary}`} type="button" onClick={runPrimary} disabled={primaryDisabled}>{primaryLabel}</button>
        <button className={styles.controlButton} type="button" onClick={() => chooseRelative(1)} disabled={isSending || activeIndex >= presets.length - 1}>ДАЛЬШЕ →</button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("system")}>СИСТЕМНЫЙ ПРОМПТ <span className={styles.hotkey}>S</span></button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("tools")}>ИНСТРУМЕНТЫ <span className={styles.hotkey}>T</span></button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("why")}>ПОЧЕМУ? <span className={styles.hotkey}>W</span></button>
        <button className={`${styles.controlButton} ${styles.utility}`} type="button" onClick={() => setDrawer("debug")}>ОТЛАДКА <span className={styles.hotkey}>D</span></button>
      </nav>

      {requiresNativeTools && !toolsAvailable && <div className={styles.errorBanner}><strong>ВОЗМОЖНОСТИ МОДЕЛИ</strong><span>{hasConfiguredNativeModel ? "Этот сценарий требует нативных вызовов инструментов. Выберите модель с поддержкой инструментов." : "Не настроена модель с поддержкой нативных инструментов. Сценарий заблокирован без эмуляции."}</span></div>}
      {provider && !provider.configured && <div className={styles.errorBanner}><strong>{provider.displayName.toUpperCase()}</strong><span>{providerConfigurationHint(provider)}</span></div>}
      {error && <div className={styles.errorBanner}><strong>ЗАПРОС НЕ ВЫПОЛНЕН</strong><span>{error}</span><button type="button" onClick={onRetry} disabled={isSending}>ПОВТОРИТЬ</button></div>}

      {drawer && <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(undefined); }}>
        <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Панель деталей для ведущего">
          <div className={styles.drawerHeader}><span>ДЕТАЛИ ДЛЯ ВЕДУЩЕГО</span><h2>{drawer === "system" ? "Системный промпт" : drawer === "tools" ? "Доступные инструменты" : drawer === "why" ? "Почему это работает" : "Отладка / цепочка вызовов"}</h2><button className={styles.drawerClose} type="button" onClick={() => setDrawer(undefined)} aria-label="Закрыть">×</button></div>
          <div className={styles.drawerBody}>
            {drawer === "system" && <pre>{profile?.systemPrompt ?? "Системный промпт не загружен."}</pre>}
            {drawer === "tools" && (profile?.tools.length ? <ul className={styles.toolList}>{profile.tools.map((tool) => { const copy = stageToolCopy(tool); return <li key={tool.name}><strong>{copy.label}</strong><small>{tool.name}</small><small>{copy.description}</small></li>; })}</ul> : <p>Для этого профиля инструменты не предоставлены.</p>)}
            {drawer === "why" && <div><p>{scenarioCopy.architecturalFlaw ?? "Для этого сценария отдельное объяснение архитектурной причины не задано."}</p>{scenarioCopy.grantedCapability && <p style={{ marginTop: 16 }}><strong>Предоставленная возможность:</strong><br />{scenarioCopy.grantedCapability}</p>}</div>}
            {drawer === "debug" && <div className={styles.debugList}>{debugEvents.length ? debugEvents.map((event, index) => <article className={styles.debugEvent} key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString("ru-RU")}</time><pre>{formatEvent(event)}</pre></article>) : <p>Событий отладки пока нет.</p>}</div>}
          </div>
        </aside>
      </div>}
    </main>
  );
}
