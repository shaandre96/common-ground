const steps = [
  {
    number: "01",
    title: "Pick a topic",
    description: "Choose something you have a view on.",
  },
  {
    number: "02",
    title: "Meet your match",
    description: "Paired with someone who sees it differently.",
  },
  {
    number: "03",
    title: "Talk it out",
    description: "Real conversation, no likes, no algorithms.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-16 md:py-24 border-t border-border"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col gap-3">
              <span className="font-serif text-6xl md:text-7xl italic text-muted-foreground/30">
                {step.number}
              </span>
              <h3 className="font-serif text-xl">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
