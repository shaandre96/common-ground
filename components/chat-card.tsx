export function ChatCard() {
  return (
    <div className="w-full max-w-sm bg-card border border-border rounded-sm overflow-hidden">
      {/* Terracotta top border accent */}
      <div className="h-1 bg-terracotta" />
      
      <div className="p-5 flex flex-col gap-4">
        {/* Header with topic and status */}
        <div className="flex items-center justify-between">
          <span className="text-xs border border-border px-2 py-1 rounded-sm">
            Climate Policy
          </span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-agree" />
            <span className="text-xs text-muted-foreground">Matched</span>
          </div>
        </div>

        {/* Chat bubbles */}
        <div className="flex flex-col gap-3 py-2">
          {/* Them bubble - left aligned */}
          <div className="flex justify-start">
            <div className="bg-sand-dark border border-border px-4 py-3 rounded-tr-md rounded-bl-md rounded-br-md max-w-[85%]">
              <p className="text-sm leading-relaxed">
                I think we need drastic action now, even if it means economic sacrifice.
              </p>
            </div>
          </div>

          {/* Me bubble - right aligned */}
          <div className="flex justify-end">
            <div className="bg-foreground text-primary-foreground px-4 py-3 rounded-tl-md rounded-bl-md rounded-br-md max-w-[85%]">
              <p className="text-sm leading-relaxed">
                I agree on urgency, but gradual transitions might be more sustainable long-term.
              </p>
            </div>
          </div>
        </div>

        {/* Agree/Disagree buttons */}
        <div className="flex gap-2 pt-2">
          <button className="flex-1 text-xs border border-agree/30 text-agree px-3 py-2 rounded-sm hover:bg-agree/5 transition-colors">
            Agree
          </button>
          <button className="flex-1 text-xs border border-terracotta/30 text-terracotta px-3 py-2 rounded-sm hover:bg-terracotta/5 transition-colors">
            Disagree
          </button>
        </div>
      </div>
    </div>
  )
}
