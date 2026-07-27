/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

export default function Home() {
  return (
    <main className="home-screen">
      <h1 className="sr-only">터진다! 슬라임 공방</h1>

      <div className="home-stage">
        <img
          className="home-logo"
          src="/home/logo.svg"
          width={782}
          height={402}
          alt="터진다! 슬라임 공방"
        />

        <nav className="home-menu" aria-label="메인 메뉴">
          <Link className="home-menu-button home-start" href="/game">
            <img src="/home/start.svg" width={1555} height={523} alt="시작하기" />
          </Link>
          <details className="home-settings">
            <summary className="home-menu-button">
              <img src="/home/setting.svg" width={964} height={574} alt="설정" />
            </summary>
            <p>
              게임이 시작되면 마이크가 자동으로 켜집니다.
              <br />
              음량은 브라우저나 기기 설정에서 조절해 주세요.
            </p>
          </details>
        </nav>

        <img
          className="home-desk"
          src="/home/potion-desk.svg"
          width={852}
          height={754}
          alt=""
        />
        <img
          className="home-cauldron"
          src="/home/cauldron.svg"
          width={856}
          height={678}
          alt=""
        />
        {/* SVG 내부 벡터 그룹이 서로 다른 박자로 눌리고 늘어난다. */}
        <img
          className="home-slime"
          src="/home/green-slime.svg"
          alt="쫀득하게 숨 쉬는 초록 슬라임"
        />
      </div>
    </main>
  );
}
