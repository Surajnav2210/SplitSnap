import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Pills everywhere (docs/DESIGN.md, section 5). Primary is near-black in light
// mode and near-white in dark mode; the blue accent is reserved for focus,
// links and selection, never for button fills.
// Each variant sets its own border color: buttonVariants() is also used
// without cn() merging (on <Link>/<label>), so base and variant must not conflict.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border bg-clip-padding font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/85",
        outline:
          "border-input bg-card text-foreground hover:border-foreground/25 hover:bg-muted",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-border",
        ghost: "border-transparent text-foreground hover:bg-muted",
        destructive: "border-transparent text-destructive hover:bg-destructive/10",
        link: "border-transparent rounded-md px-0! text-accent underline-offset-4 hover:underline",
      },
      size: {
        // 36px visual; the ::before extends the hit area to 44px.
        sm: "h-9 gap-1.5 px-3.5 text-sm before:absolute before:inset-x-0 before:-inset-y-1",
        default: "h-11 gap-2 px-5 text-[15px]",
        lg: "h-12 gap-2 px-6 text-[15px]",
        icon: "size-11",
        "icon-sm": "size-9 before:absolute before:-inset-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
