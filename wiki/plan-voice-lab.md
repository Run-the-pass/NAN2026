---
type: plan
status: superseded
updated: 2026-07-28
sources:
  - raw/voice-command-discussion-summary-revised.md
  - raw/slime-workshop-resource-production-design.md
---

# 음성 인식 실험실 계획

> Gemini 텍스트 재분석 범위는
> [음성 실험실 매칭 근거·정리 계획](plan-voice-lab-diagnostics.md)에서
> 바로잡았다. 현재는 브라우저 STT를 로컬 사전에만 사용한다.

## 목표

게임과 분리된 `/voice-lab`에서 필요한 명령 조합을 실제로 말해 보고,
브라우저 STT·로컬 사전·Gemini가 각각 무엇을 반환했는지 저장한다.
누적 결과를 표와 CSV로 확인해 자주 틀리는 발음을 `game/phrase.ts`에
빠르게 반영할 수 있게 한다.

## 사용자 흐름

```text
슬라임 선택
→ 해야 할 일 선택 (물품 + 목적지)
→ 화면에 기준 문장 표시
→ 스페이스바를 누르고 발화
→ 누르는 동안 중간 STT 문장 실시간 표시
→ 스페이스바를 떼면 최종 문장 확정
→ 로컬 사전 결과와 Gemini 결과를 나란히 표시
→ 기대값과 필드별 비교 후 D1에 자동 저장
→ 최근 기록 확인 또는 CSV 다운로드
```

## 선택 가능한 조합

- 대상: 너드, 날쌘, 쫑긋, 일꾼
- 해야 할 일: 현재 코어의 유효 경로만 사용한다.
  - 붉은·파란 약초 → 양조기, 마법 테이블, 제출대, 쓰레기통
  - 붉은·파란 물약 → 제출대, 쓰레기통
  - 붉은·파란 스크롤 → 제출대, 쓰레기통
- 기준 문장은 현재 게임 명령과 같은 `슬라임 이름 + 물품 + 목적지`로
  생성한다. 새 명령 목록을 따로 관리하지 않는다.

## 저장 데이터

`voice_test_results` D1 테이블에 다음을 저장한다.

- 테스트 묶음 ID와 생성 시각
- 기대한 actor, item, target, 기준 문장
- 브라우저 STT 최종 문장
- 로컬 사전의 matched/unmatched와 actor, item, target
- Gemini의 OK/UNKNOWN/ERROR와 actor, item, target, confidence, reason
- actor, item, target 각각의 일치 여부와 전체 일치 여부

API는 허용된 actor·item·target과 문자열 길이를 다시 검증한다. 실험실
페이지와 저장·조회·CSV API는 기존 ChatGPT 사용자 인증을 요구하되,
사용자 이메일은 결과 테이블에 저장하지 않는다.

## 구현 범위

1. `/voice-lab` 클라이언트 페이지
   - 대상·해야 할 일 선택, 기준 문장, 스페이스바 푸시투토크
   - 실시간 중간 문장, 최종 문장, 로컬/Gemini 비교 결과
   - 최근 결과 표, 필드별 정답 표시, CSV 다운로드
2. 기존 함수 재사용
   - `allItems`, `allStations`, `isValidRoute`, `matchPhrase`,
     `validateEnvelope`, 슬라임·물품·설비 라벨
   - Web Speech API는 사전 개선의 원자료인 브라우저 STT 결과를 얻는
     데만 사용한다.
3. `/api/voice-tests`
   - POST: 신뢰 경계 검증 후 결과 저장
   - GET: 최근 기록 JSON 또는 동일 열의 CSV 반환
4. D1 스키마와 마이그레이션
5. 홈 화면에서 실험실로 가는 작은 링크

## 구현하지 않을 범위

- 원본 오디오 저장·재생과 R2 추가
- 자동으로 `game/phrase.ts`를 수정하는 기능
- 차트, 사용자 관리, 복잡한 필터·페이지네이션
- 게임 화면에 실험 UI 삽입

## 완료 조건

- 라운드나 게임 상태 없이 `/voice-lab`에서 모든 유효 명령 조합을
  선택할 수 있다.
- 라운드 시작 또는 페이지 진입만으로 마이크가 켜지지 않는다.
  스페이스바 누름 동안만 STT가 동작하고 중간 문장이 갱신된다.
- 발화 종료 뒤 기대값, 브라우저 STT, 로컬 사전, Gemini 결과와 actor,
  item, target별 일치 여부가 한 화면에 표시된다.
- 성공·불일치·UNKNOWN·서버 오류 결과가 모두 유실 없이 D1에 저장된다.
- 저장 API가 허용 목록 밖 값과 과도하게 긴 문자열을 거부한다.
- 최근 결과를 표로 확인하고 UTF-8 CSV로 다운로드할 수 있다.
- 파서·API 검증 테스트, 변경 파일 lint, 프로덕션 빌드와 실제 마이크
  발화 검증을 통과한다.
