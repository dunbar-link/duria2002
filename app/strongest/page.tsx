// ./app/strongest/page.tsx

export default function StrongestPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        Strongest 전용 영역
      </h1>

      <p style={{ marginTop: 12 }}>
        JWT 통과 성공. 이 페이지는 strongest 플랜만 접근 가능.
      </p>
    </main>
  );
}