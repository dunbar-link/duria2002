// ./app/paywall/strongest/page.tsx
import Link from "next/link";

export default function StrongestPaywallPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams?.next ?? "/strongest";

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Strongest 전용 기능</h1>
      <p style={{ marginTop: 12 }}>
        이 기능은 <b>Strongest 플랜</b>에서만 사용할 수 있어요.
      </p>

      <div style={{ marginTop: 16 }}>
        <Link href={`/checkout/strongest?next=${encodeURIComponent(next)}`}>
          결제/업그레이드 하러가기
        </Link>
      </div>

      <div style={{ marginTop: 10 }}>
        <Link href="/">홈으로</Link>
      </div>
    </main>
  );
}