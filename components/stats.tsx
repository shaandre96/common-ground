import { CountUp } from "./count-up";
import { Reveal } from "./reveal";

const stats = [
  {
    value: 14200,
    suffix: "+",
    label: "conversations started",
  },
  {
    value: 91,
    suffix: "",
    label: "countries represented",
  },
  {
    value: 18,
    suffix: " min",
    label: "avg. per session",
  },
];

export function Stats() {
  return (
    <section className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.1}>
              <div className="flex flex-col gap-2">
                <span className="font-serif text-4xl md:text-5xl">
                  <CountUp value={stat.value} suffix={stat.suffix} />
                </span>
                <span className="text-sm text-muted-foreground">
                  {stat.label}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
