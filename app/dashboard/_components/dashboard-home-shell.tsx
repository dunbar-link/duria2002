import type { ReactNode } from "react";

export default function DashboardHomeShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: "#FAFAF8",
        border: "0.5px solid #D3D1C7",
        borderRadius: "20px",
        padding: "12px",
      }}
    >
      <div
        style={{
          borderRadius: "18px",
          padding: "10px",
        }}
      >
        {children}
      </div>
    </section>
  );
}