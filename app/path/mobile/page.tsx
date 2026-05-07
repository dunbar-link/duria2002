import { Suspense } from "react";
import MobilePathClient from "./mobile-path-client";

export default function MobilePathPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f6f1ea] px-4 py-5 text-neutral-900">
          <div className="mx-auto flex min-h-[360px] max-w-md items-center justify-center rounded-3xl border border-white/70 bg-white/80 p-6 text-sm text-neutral-500 shadow-sm">
            연결 정보를 불러오는 중...
          </div>
        </main>
      }
    >
      <MobilePathClient />
    </Suspense>
  );
}
