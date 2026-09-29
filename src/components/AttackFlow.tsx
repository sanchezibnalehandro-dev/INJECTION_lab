"use client";

import styles from "./AttackFlow.module.css";

type NodeTone = "trusted" | "attack" | "data" | "model" | "neutral";
type EdgeKind = "main" | "tool";

type FlowNode = {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  tone: NodeTone;
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  kind?: EdgeKind;
};

type FlowGraph = {
  caption: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

type AttackFlowProps = {
  presetId?: string;
  isSending: boolean;
  hasEvaluation: boolean;
  disclosureObserved: boolean;
  multiTurnStepIndex: number;
  multiTurnTotal: number;
  toolName?: string;
  toolResultSummary?: string;
  hasGrantedTools: boolean;
};

const DIRECT_GRAPH: FlowGraph = {
  caption: "Инструкции приложения, секрет и пользовательский ввод сходятся в одном контексте.",
  nodes: [
    { id: "system", label: "СИСТЕМНЫЕ\nИНСТРУКЦИИ", x: 8, y: 18, tone: "trusted" },
    { id: "secret", label: "СЕКРЕТ", x: 8, y: 50, tone: "data" },
    { id: "attack", label: "ВВОД\nПОЛЬЗОВАТЕЛЯ", x: 8, y: 82, tone: "attack" },
    { id: "context", label: "КОНТЕКСТ", x: 38, y: 50, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 64, y: 50, tone: "model" },
    { id: "response", label: "ОТВЕТ", x: 89, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "system-context", from: "system", to: "context" },
    { id: "secret-context", from: "secret", to: "context" },
    { id: "attack-context", from: "attack", to: "context" },
    { id: "context-model", from: "context", to: "model" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

const STRUCTURED_GRAPH: FlowGraph = {
  caption: "Требование строгой структуры конкурирует с текстовым правилом нераскрытия.",
  nodes: [
    { id: "system", label: "ПРАВИЛО\nНЕРАСКРЫТИЯ", x: 8, y: 25, tone: "trusted" },
    { id: "secret", label: "КОНФИГУРАЦИЯ\n+ СЕКРЕТ", x: 8, y: 75, tone: "data" },
    { id: "attack", label: "JSON-СХЕМА", x: 31, y: 75, tone: "attack" },
    { id: "context", label: "КОНТЕКСТ", x: 41, y: 35, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 66, y: 50, tone: "model" },
    { id: "response", label: "ОТВЕТ", x: 90, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "system-context", from: "system", to: "context" },
    { id: "secret-context", from: "secret", to: "context" },
    { id: "attack-context", from: "attack", to: "context" },
    { id: "context-model", from: "context", to: "model" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

const ROLEPLAY_GRAPH: FlowGraph = {
  caption: "Легитимно звучащая роль меняет рамку задачи внутри того же контекста.",
  nodes: [
    { id: "system", label: "СИСТЕМНОЕ\nПРАВИЛО", x: 8, y: 25, tone: "trusted" },
    { id: "secret", label: "СЕКРЕТ", x: 8, y: 75, tone: "data" },
    { id: "attack", label: "РОЛЬ\nАУДИТОРА", x: 31, y: 75, tone: "attack" },
    { id: "context", label: "КОНТЕКСТ", x: 41, y: 35, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 66, y: 50, tone: "model" },
    { id: "response", label: "ОТВЕТ", x: 90, y: 50, tone: "neutral" },
  ],
  edges: STRUCTURED_GRAPH.edges,
};

const COMBINED_GRAPH: FlowGraph = {
  caption: "Роль аудитора и обязательный формат одновременно давят на одно текстовое ограничение.",
  nodes: [
    { id: "system", label: "СИСТЕМНОЕ\nПРАВИЛО", x: 7, y: 18, tone: "trusted" },
    { id: "secret", label: "СЕКРЕТ", x: 7, y: 50, tone: "data" },
    { id: "role", label: "РОЛЬ\nАУДИТОРА", x: 7, y: 82, tone: "attack" },
    { id: "schema", label: "JSON-СХЕМА", x: 29, y: 82, tone: "attack" },
    { id: "context", label: "КОНТЕКСТ", x: 40, y: 45, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 65, y: 50, tone: "model" },
    { id: "response", label: "ОТВЕТ", x: 90, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "system-context", from: "system", to: "context" },
    { id: "secret-context", from: "secret", to: "context" },
    { id: "role-context", from: "role", to: "context" },
    { id: "schema-context", from: "schema", to: "context" },
    { id: "context-model", from: "context", to: "model" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

const MULTI_TURN_GRAPH: FlowGraph = {
  caption: "Безобидные шаги накапливаются в истории, после чего модель использует доступ к приватным записям.",
  nodes: [
    { id: "history", label: "ИСТОРИЯ\nДИАЛОГА", x: 9, y: 50, tone: "attack" },
    { id: "model", label: "МОДЕЛЬ", x: 35, y: 50, tone: "model" },
    { id: "tool", label: "ИНСТРУМЕНТ", x: 60, y: 22, tone: "trusted" },
    { id: "records", label: "ПРИВАТНЫЕ\nЗАПИСИ", x: 60, y: 78, tone: "data" },
    { id: "response", label: "ОТВЕТ", x: 89, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "history-model", from: "history", to: "model" },
    { id: "model-tool", from: "model", to: "tool", kind: "tool" },
    { id: "tool-records", from: "tool", to: "records", kind: "tool" },
    { id: "records-model", from: "records", to: "model", kind: "tool" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

const PAYLOAD_GRAPH: FlowGraph = {
  caption: "Чувствительные поля маскируются под отдельные части, а затем собираются обратно в один результат.",
  nodes: [
    { id: "parts", label: "A · B · C · D · E", sublabel: "безобидные части", x: 8, y: 50, tone: "attack" },
    { id: "assembly", label: "СБОРКА Z", x: 27, y: 50, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 47, y: 50, tone: "model" },
    { id: "tool", label: "ИНСТРУМЕНТ", x: 68, y: 22, tone: "trusted" },
    { id: "records", label: "ПРИВАТНЫЕ\nЗАПИСИ", x: 68, y: 78, tone: "data" },
    { id: "response", label: "ОТВЕТ", x: 91, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "parts-assembly", from: "parts", to: "assembly" },
    { id: "assembly-model", from: "assembly", to: "model" },
    { id: "model-tool", from: "model", to: "tool", kind: "tool" },
    { id: "tool-records", from: "tool", to: "records", kind: "tool" },
    { id: "records-model", from: "records", to: "model", kind: "tool" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

const DOCUMENT_GRAPH: FlowGraph = {
  caption: "Обычный документ переносит внутрь контекста инструкцию, которой там быть не должно.",
  nodes: [
    { id: "document", label: "ДОКУМЕНТ", sublabel: "обычный текст", x: 8, y: 28, tone: "trusted" },
    { id: "injection", label: "⚠ ИНСТРУКЦИЯ", sublabel: "внутри документа", x: 8, y: 74, tone: "attack" },
    { id: "context", label: "КОНТЕКСТ\nДОКУМЕНТА", x: 39, y: 50, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 65, y: 50, tone: "model" },
    { id: "response", label: "ОТВЕТ", x: 90, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "document-context", from: "document", to: "context" },
    { id: "injection-context", from: "injection", to: "context" },
    { id: "context-model", from: "context", to: "model" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

const GENERIC_GRAPH: FlowGraph = {
  caption: "Упрощённый маршрут текущего запроса через контекст модели.",
  nodes: [
    { id: "user", label: "ПОЛЬЗОВАТЕЛЬ", x: 10, y: 50, tone: "attack" },
    { id: "context", label: "КОНТЕКСТ", x: 38, y: 50, tone: "neutral" },
    { id: "model", label: "МОДЕЛЬ", x: 65, y: 50, tone: "model" },
    { id: "response", label: "ОТВЕТ", x: 90, y: 50, tone: "neutral" },
  ],
  edges: [
    { id: "user-context", from: "user", to: "context" },
    { id: "context-model", from: "context", to: "model" },
    { id: "model-response", from: "model", to: "response" },
  ],
};

function graphForPreset(presetId?: string): FlowGraph {
  switch (presetId) {
    case "vulnerable-direct-override": return DIRECT_GRAPH;
    case "vulnerable-structured-json": return STRUCTURED_GRAPH;
    case "vulnerable-roleplay": return ROLEPLAY_GRAPH;
    case "vulnerable-combined": return COMBINED_GRAPH;
    case "vulnerable-multi-turn": return MULTI_TURN_GRAPH;
    case "vulnerable-payload-splitting": return PAYLOAD_GRAPH;
    case "vulnerable-document-injection": return DOCUMENT_GRAPH;
    default: return GENERIC_GRAPH;
  }
}

function edgePath(from: FlowNode, to: FlowNode): string {
  const dx = to.x - from.x;
  const controlX = from.x + dx * 0.52;
  const verticalBend = Math.abs(to.y - from.y) > 8 ? (from.y + to.y) / 2 : from.y;
  return `M ${from.x} ${from.y} Q ${controlX} ${verticalBend} ${to.x} ${to.y}`;
}

function nodeClass(tone: NodeTone): string {
  switch (tone) {
    case "trusted": return styles.nodeTrusted;
    case "attack": return styles.nodeAttack;
    case "data": return styles.nodeData;
    case "model": return styles.nodeModel;
    default: return styles.nodeNeutral;
  }
}

export function AttackFlow({
  presetId,
  isSending,
  hasEvaluation,
  disclosureObserved,
  multiTurnStepIndex,
  multiTurnTotal,
  toolName,
  toolResultSummary,
  hasGrantedTools,
}: AttackFlowProps) {
  const graph = graphForPreset(presetId);
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const toolWasUsed = Boolean(toolName);
  const outcome = hasEvaluation ? (disclosureObserved ? "leak" : "clean") : isSending ? "busy" : "ready";
  const statusLabel = outcome === "leak" ? "УТЕЧКА" : outcome === "clean" ? "БЕЗ УТЕЧКИ" : outcome === "busy" ? "ВЫПОЛНЯЕТСЯ" : "ГОТОВ";

  return (
    <section className={styles.wrap} aria-label="Путь атаки">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span>ПУТЬ АТАКИ</span>
          <small>{graph.caption}</small>
        </div>
        <div className={`${styles.status} ${styles[`status_${outcome}`]}`}><i />{statusLabel}</div>
      </header>

      <div className={styles.canvas}>
        <svg className={styles.wires} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="attack-flow-arrow" markerWidth="7" markerHeight="7" refX="5.4" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L7,3.5 L0,7 z" className={styles.arrowHead} />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const path = edgePath(from, to);
            const isFinal = edge.to === "response";
            const toolMuted = edge.kind === "tool" && hasEvaluation && !toolWasUsed;
            const stateClass = toolMuted
              ? styles.edgeMuted
              : isFinal && hasEvaluation
                ? disclosureObserved ? styles.edgeLeak : styles.edgeClean
                : isSending ? styles.edgeActive : hasEvaluation ? styles.edgeDone : styles.edgePreview;
            return (
              <g key={edge.id}>
                <path d={path} className={`${styles.edge} ${stateClass}`} vectorEffect="non-scaling-stroke" markerEnd="url(#attack-flow-arrow)" />
                {isSending && !toolMuted && <circle r="0.72" className={styles.packet}>
                  <animateMotion dur={edge.kind === "tool" ? "1.35s" : "1.7s"} repeatCount="indefinite" path={path} />
                </circle>}
              </g>
            );
          })}
        </svg>

        {graph.nodes.map((node) => {
          const isResponse = node.id === "response";
          const isTool = node.id === "tool";
          const isHistory = node.id === "history";
          const dynamicSublabel = isHistory && multiTurnTotal > 0
            ? `шаг ${Math.min(multiTurnStepIndex, multiTurnTotal)} / ${multiTurnTotal}`
            : isTool && toolName
              ? `${toolName}()`
              : isResponse && hasEvaluation
                ? disclosureObserved ? "обнаружено раскрытие" : "совпавших раскрытий нет"
                : node.sublabel;
          const nodeState = isResponse && hasEvaluation
            ? disclosureObserved ? styles.nodeLeak : styles.nodeClean
            : isTool && hasEvaluation && hasGrantedTools && !toolWasUsed
              ? styles.nodeDimmed
              : "";
          return (
            <div
              key={node.id}
              className={`${styles.node} ${nodeClass(node.tone)} ${nodeState}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <strong>{node.label.split("\n").map((line, index) => <span key={`${node.id}-${index}`}>{line}</span>)}</strong>
              {dynamicSublabel && <small>{dynamicSublabel}</small>}
            </div>
          );
        })}
      </div>

      <footer className={styles.meta}>
        <span><i className={styles.legendPreview} /> весь маршрут</span>
        <span><i className={styles.legendAttack} /> недоверенный ввод</span>
        {toolName && <span className={styles.metaAccent}>ИНСТРУМЕНТ: {toolName}</span>}
        {toolResultSummary && <span className={styles.metaResult}>{toolResultSummary}</span>}
      </footer>
    </section>
  );
}
