"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  allItems,
  allStations,
  isValidRoute,
  itemLabel,
  slimeTypes,
  stationLabels,
  type ActorId,
  type ItemId,
  type StationId,
} from "../../game/core";
import type { PhraseMatch } from "../../game/phrase";
import {
  carriedVoiceTargets,
  voiceTestPhrase,
  voiceTestTaskLabel,
  type CarriedPhraseStyle,
  type VoiceTestExpectedItem,
} from "../../game/voice-test";

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (event: {
    resultIndex: number;
    results: ArrayLike<SpeechResult>;
  }) => void;
  onerror: (event: { error?: string }) => void;
  onend: (event: { timeStamp: number }) => void;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type TestRow = {
  id: number;
  createdAt: string;
  expectedPhrase: string;
  transcript: string;
  sttConfidence: number | null;
  localStatus: string;
  localActor: ActorId | null;
  localItem: ItemId | null;
  localTarget: StationId | null;
  localActorMatch: boolean;
  localItemMatch: boolean;
  localTargetMatch: boolean;
  localAllMatch: boolean;
  localMatches: PhraseMatch[];
};

const actorIds = Object.keys(slimeTypes) as ActorId[];
type Task = {
  item: VoiceTestExpectedItem;
  target: StationId;
  style: CarriedPhraseStyle | null;
  key: string;
};

const tasks: Task[] = allItems.flatMap((item) =>
  allStations
    .filter((target) => isValidRoute(item, target))
    .map((target) => ({
      item,
      target,
      style: null,
      key: `${item}:${target}`,
    })),
).concat(
  carriedVoiceTargets.flatMap((target) =>
    ([
      ["that", "그거"],
      ["holding", "들고 있는 거"],
      ["carrying", "가지고 있는 거"],
    ] as const).map(([style]) => ({
      item: "carried",
      target,
      style,
      key: `carried:${target}:${style}`,
    })),
  ),
);

const commandText = (
  actor: ActorId | null,
  item: ItemId | null,
  target: StationId | null,
) =>
  actor && item && target
    ? `${slimeTypes[actor].name} · ${itemLabel(item)} → ${stationLabels[target]}`
    : actor && target
      ? `${slimeTypes[actor].name} · 현재 든 물품 → ${stationLabels[target]}`
    : "—";

function MatchMarks({
  actor,
  item,
  target,
}: {
  actor: boolean;
  item: boolean;
  target: boolean;
}) {
  return (
    <span className="voice-lab-marks">
      <i data-pass={actor ? "" : undefined}>대상</i>
      <i data-pass={item ? "" : undefined}>물품</i>
      <i data-pass={target ? "" : undefined}>목적지</i>
    </span>
  );
}

const matchLabels: Record<PhraseMatch["field"], string> = {
  actor: "대상",
  color: "색상",
  item: "물품",
  target: "목적지",
};

function MatchExplanation({ matches }: { matches: PhraseMatch[] }) {
  if (!matches.length) {
    return <span className="voice-lab-no-match">매칭 없음</span>;
  }
  return (
    <span className="voice-lab-match-explanation">
      {matches.map((match) => (
        <span key={match.field}>
          <small>{matchLabels[match.field]}</small>
          <b>{match.spoken ?? "(호칭 없음)"}</b>
          {" → "}
          {match.canonical}
          {match.source === "default" && " (기본 대상)"}
        </span>
      ))}
    </span>
  );
}

export default function VoiceLab() {
  const [actor, setActor] = useState<ActorId>("keen");
  const [taskKey, setTaskKey] = useState(tasks[0].key);
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState("E를 누르고 말해 주세요.");
  const [holding, setHolding] = useState(false);
  const [current, setCurrent] = useState<TestRow | null>(null);
  const [recent, setRecent] = useState<TestRow[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const held = useRef(false);
  const startedAt = useRef(0);
  const batchId = useRef("");
  const finalText = useRef("");
  const finalConfidences = useRef<number[]>([]);
  const recognitionError = useRef<string | null>(null);
  const expected = useRef({
    actor,
    item: tasks[0].item,
    target: tasks[0].target,
    style: tasks[0].style,
  });
  const selected = tasks.find((task) => task.key === taskKey) ?? tasks[0];

  useEffect(() => {
    fetch("/api/voice-tests")
      .then(async (response) => {
        const payload = (await response.json()) as {
          recent?: TestRow[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "기록 조회 실패");
        setRecent(payload.recent ?? []);
      })
      .catch((error: unknown) =>
        setHistoryError(
          error instanceof Error ? error.message : "기록 조회 실패",
        ),
      );
  }, []);

  function stopListening() {
    if (!held.current) return;
    held.current = false;
    setHolding(false);
    recognition.current?.stop();
  }

  async function finishListening(
    transcript: string,
    sttConfidence: number | null,
    durationMs: number,
  ) {
    const chosen = expected.current;
    setStatus("인식 결과를 저장하는 중…");
    const gemini = {
      status: "SKIPPED" as const,
      confidence: null,
      commands: [],
      reason:
        recognitionError.current ??
        (transcript
          ? "브라우저 STT 텍스트는 Gemini로 재분석하지 않습니다."
          : "STT 최종 문장이 없습니다."),
    };
    try {
      if (!batchId.current) batchId.current = crypto.randomUUID();
      const response = await fetch("/api/voice-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchId: batchId.current,
          expectedActor: chosen.actor,
          expectedItem: chosen.item,
          expectedTarget: chosen.target,
          expectedPhraseStyle: chosen.style,
          transcript,
          sttConfidence,
          durationMs,
          gemini,
        }),
      });
      const payload = (await response.json()) as {
        result?: TestRow;
        error?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "결과 저장 실패");
      }
      setCurrent(payload.result);
      setRecent((rows) => [payload.result!, ...rows]);
      setStatus("저장 완료 · 다음 문장을 테스트할 수 있습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "결과 저장 실패");
    }
  }

  async function deleteResult(row: TestRow) {
    if (pendingDeleteId !== row.id) {
      setPendingDeleteId(row.id);
      return;
    }
    setHistoryError("");
    try {
      const response = await fetch(`/api/voice-tests?id=${row.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "결과 삭제 실패");
      setRecent((rows) => rows.filter((candidate) => candidate.id !== row.id));
      setCurrent((candidate) => candidate?.id === row.id ? null : candidate);
      setPendingDeleteId(null);
      setStatus("결과를 삭제했습니다.");
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "결과 삭제 실패",
      );
    }
  }

  function startListening(eventTime: number) {
    if (held.current) return;
    const Recognition =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("이 브라우저는 Web Speech API를 지원하지 않습니다.");
      return;
    }
    expected.current = {
      actor,
      item: selected.item,
      target: selected.target,
      style: selected.style,
    };
    held.current = true;
    setHolding(true);
    setLiveText("");
    setCurrent(null);
    setStatus("듣는 중… E를 떼면 저장합니다.");
    startedAt.current = eventTime;
    finalText.current = "";
    finalConfidences.current = [];
    recognitionError.current = null;
    const next = new Recognition();
    next.lang = "ko-KR";
    next.interimResults = true;
    next.continuous = false;
    next.onresult = (event) => {
      let final = "";
      let interim = "";
      const confidences: number[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          final += result[0].transcript;
          if (Number.isFinite(result[0].confidence)) {
            confidences.push(result[0].confidence);
          }
        } else {
          interim += result[0].transcript;
        }
      }
      finalText.current = final;
      finalConfidences.current = confidences;
      setLiveText(`${final}${interim}`);
    };
    next.onerror = (event) => {
      recognitionError.current = event.error || "STT 인식 오류";
    };
    next.onend = (event) => {
      recognition.current = null;
      held.current = false;
      setHolding(false);
      const values = finalConfidences.current;
      void finishListening(
        finalText.current.trim(),
        values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null,
        Math.min(
          60_000,
          Math.max(0, Math.round(event.timeStamp - startedAt.current)),
        ),
      );
    };
    recognition.current = next;
    next.start();
  }

  const startEvent = useEffectEvent(startListening);
  const stopEvent = useEffectEvent(stopListening);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
    const down = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || event.repeat || isTyping(event.target)) {
        return;
      }
      event.preventDefault();
      startEvent(event.timeStamp);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || isTyping(event.target)) return;
      event.preventDefault();
      stopEvent();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      recognition.current?.stop();
    };
  }, []);

  const expectedPhrase = voiceTestPhrase(
    actor,
    selected.item,
    selected.target,
    selected.style,
  );

  return (
    <main className="voice-lab">
      <header className="voice-lab-header">
        <div>
          <p>VOICE DICTIONARY LAB</p>
          <h1>음성 인식 실험실</h1>
          <span>브라우저 STT와 로컬 사전의 단어별 매칭을 기록합니다.</span>
        </div>
        <nav>
          <Link href="/">홈</Link>
          <Link href="/game">게임</Link>
          <a href="/api/voice-tests?format=csv">CSV 다운로드</a>
        </nav>
      </header>

      <section className="voice-lab-console">
        <div className="voice-lab-controls">
          <label>
            대상
            <select
              value={actor}
              onChange={(event) => setActor(event.target.value as ActorId)}
              disabled={holding}
            >
              {actorIds.map((actorId) => (
                <option key={actorId} value={actorId}>
                  {slimeTypes[actorId].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            해야 할 일
            <select
              value={taskKey}
              onChange={(event) => setTaskKey(event.target.value)}
              disabled={holding}
            >
              {tasks.map((task) => (
                <option key={task.key} value={task.key}>
                  {voiceTestTaskLabel(task.item, task.target, task.style)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="voice-lab-prompt">
          <small>말할 문장</small>
          <strong>“{expectedPhrase}”</strong>
        </div>

        <div className="voice-lab-live" data-recording={holding ? "" : undefined}>
          <span className="voice-lab-mic">🎙</span>
          <div>
            <small>{status}</small>
            <strong>{liveText || "실시간 인식 문장이 여기에 표시됩니다."}</strong>
          </div>
          <kbd>E</kbd>
        </div>
      </section>

      {current && (
        <section className="voice-lab-result" aria-live="polite">
          <header>
            <div>
              <small>기대</small>
              <strong>{current.expectedPhrase}</strong>
            </div>
            <div>
              <small>브라우저 STT</small>
              <strong>{current.transcript || "(인식 없음)"}</strong>
              <span>
                신뢰도{" "}
                {current.sttConfidence === null
                  ? "—"
                  : `${Math.round(current.sttConfidence * 100)}%`}
              </span>
            </div>
          </header>
          <div className="voice-lab-result-grid">
            <article data-pass={current.localAllMatch ? "" : undefined}>
              <small>로컬 사전 · {current.localStatus}</small>
              <strong>
                {commandText(
                  current.localActor,
                  current.localItem,
                  current.localTarget,
                )}
              </strong>
              <MatchMarks
                actor={current.localActorMatch}
                item={current.localItemMatch}
                target={current.localTargetMatch}
              />
              <MatchExplanation matches={current.localMatches} />
            </article>
          </div>
        </section>
      )}

      <section className="voice-lab-history">
        <header>
          <div>
            <h2>최근 기록</h2>
            <p>모든 결과를 저장하고, 최근 500건 중 50건을 표시합니다.</p>
          </div>
          <span>{recent.length}건</span>
        </header>
        {historyError && <p className="voice-lab-error">{historyError}</p>}
        <div className="voice-lab-table-wrap">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>기대 문장</th>
                <th>STT</th>
                <th>현재 사전 매칭</th>
                <th>로컬</th>
                <th>정리</th>
              </tr>
            </thead>
            <tbody>
              {recent.slice(0, 50).map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt}</td>
                  <td>{row.expectedPhrase}</td>
                  <td>{row.transcript || "(없음)"}</td>
                  <td>
                    <MatchExplanation matches={row.localMatches} />
                  </td>
                  <td data-pass={row.localAllMatch ? "" : undefined}>
                    {row.localStatus}
                  </td>
                  <td>
                    <span className="voice-lab-delete-actions">
                      <button
                        className="voice-lab-delete"
                        type="button"
                        data-confirm={pendingDeleteId === row.id ? "" : undefined}
                        onClick={() => void deleteResult(row)}
                        aria-label={`${row.createdAt} 음성 결과 ${
                          pendingDeleteId === row.id ? "정말 삭제" : "삭제"
                        }`}
                      >
                        {pendingDeleteId === row.id ? "정말 삭제" : "삭제"}
                      </button>
                      {pendingDeleteId === row.id && (
                        <button
                          className="voice-lab-delete-cancel"
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                        >
                          취소
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={6}>아직 저장된 발화가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
