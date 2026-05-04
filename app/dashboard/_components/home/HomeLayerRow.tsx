"use client";

type Person = {
  id: string;
  name: string;
  emoji?: string;
  urgent?: boolean;
};

export default function HomeLayerRow({
  title,
  countText,
  people,
}: {
  title: string;
  countText: string;
  people: Person[];
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      {/* LEFT */}
      <div className="flex gap-3">
        {people.map((p) => (
          <div key={p.id} className="flex flex-col items-center">
            <div className="relative w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-xl">
              {p.emoji || p.name[0]}

              {p.urgent && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-red-400 rounded-full" />
              )}
            </div>
            <div className="text-xs mt-1">{p.name}</div>
          </div>
        ))}
      </div>

      {/* RIGHT */}
      <div className="text-sm text-gray-400">{countText}</div>
    </div>
  );
}