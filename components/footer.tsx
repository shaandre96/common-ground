import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="font-serif text-lg">
            Common<span className="text-terracotta">·</span>Ground
          </Link>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link 
              href="#" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link 
              href="#" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link 
              href="#" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </Link>
          </div>

          {/* Tagline */}
          <p className="text-sm text-muted-foreground italic">
            Built to bridge the gap.
          </p>
        </div>
      </div>
    </footer>
  )
}
