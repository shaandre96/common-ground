const stats = [
  {
    value: "14,200+",
    label: "conversations started",
  },
  {
    value: "91",
    label: "countries represented",
  },
  {
    value: "18 min",
    label: "avg. per session",
  },
];

export function Stats() {
  return (
    <section className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2">
              <span className="font-serif text-4xl md:text-5xl">
                {stat.value}
              </span>
              <span className="text-sm text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
