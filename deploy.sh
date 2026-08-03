#!/bin/sh
set -eu

cd "$(dirname "$0")"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI가 필요합니다: https://developers.openai.com/codex/cli" >&2
  exit 1
fi

exec codex exec --ephemeral -C "$PWD" -s danger-full-access -a never - <<'PROMPT'
이 저장소의 현재 작업 내용을 기존 Codex Sites 프로젝트에 배포하라.

- `.openai/hosting.json`의 기존 project_id와 Sites 플러그인을 사용한다.
- 이 스크립트 실행은 현재 사이트의 기존 공개 범위로 배포하는 명시적 승인이다.
- 구현 코드는 수정하지 말고 테스트, 맵 검증, lint, build를 실행한다.
- 로컬 에디터가 저장한 `game/map-data.ts`를 반드시 배포 소스에 포함하고,
  배포용 커밋의 해당 파일이 현재 작업 파일과 같은지 확인한다.
- 검증된 현재 변경 중 `raw/` 밖의 소스·문서·deploy.sh만 의도적으로 커밋한다.
- `raw/`의 수정·미추적 파일과 다른 무관한 사용자 파일은 보존하고 스테이징하지 않는다.
- Sites 호스팅 절차대로 소스를 푸시하고 한 버전만 저장·배포한 뒤 완료까지 확인한다.
- 성공하면 최종 배포 URL을 마지막 줄에 출력한다.
PROMPT
