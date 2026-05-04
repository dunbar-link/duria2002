// FULL REPLACEMENT

export default function DashboardHomeHeader() {
  return (
    <div
      style={{
        background: "#FAFAF8",
        borderBottom: "0.5px solid #D3D1C7",
        padding: "10px 14px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700 }}>던바링크</div>
          <div style={{ fontSize: 12, color: "#888780" }}>
            DUNBAR LINK
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#2C2C2A",
              color: "#F1EFE8",
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                background: "#1D9E75",
                borderRadius: "50%",
              }}
            />
            알림 ON
          </div>

          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#F1EFE8",
              border: "0.5px solid #D3D1C7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            💬
          </div>
        </div>
      </div>
    </div>
  );
}