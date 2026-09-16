/**
 * Below 1024px the 53 tools had no route at all: the rail is `hidden lg:flex`
 * and there was no drawer, so the only way in was a 63x27px unlabelled
 * magnifier. This pins the drawer that replaced it, and the two layout rules
 * that were measured broken at 390px alongside it.
 *
 * Source-text assertions, which is what this repo can do without a DOM (no
 * jsdom, no testing-library). The BEHAVIOUR — focus trapped over 60 tabs,
 * Escape restoring focus to the trigger, the back button closing the drawer,
 * no horizontal overflow — was verified in a real Chromium at 390x844; these
 * tests exist so a later edit cannot quietly take the markup back. Every
 * assertion below was run against the pre-fix source and fails there.
 */
import { describe, it, expect } from 'vitest'
import shell from '../components/AppShell.tsx?raw'
import home from '../pages/Home.tsx?raw'
import footer from '../components/SiteFooter.tsx?raw'

const count = (hay: string, needle: string) => hay.split(needle).length - 1

describe('the source actually loaded', () => {
  it('is the component and not an empty string', () => {
    expect(shell.length).toBeGreaterThan(4000)
    expect(home.length).toBeGreaterThan(4000)
    expect(footer.length).toBeGreaterThan(800)
  })
})

describe('mobile nav drawer', () => {
  it('is a labelled modal dialog', () => {
    expect(shell).toContain('role="dialog"')
    expect(shell).toContain('aria-modal="true"')
    expect(shell).toContain('aria-label="Tool navigation"')
  })

  it('gives the trigger a target to point at', () => {
    // aria-controls naming an id that no element ever carries is a reference
    // to nothing — it has to resolve while the drawer is open.
    expect(shell).toContain('aria-controls="nav-drawer"')
    expect(shell).toContain('id="nav-drawer"')
  })

  it('reports its own state on the trigger', () => {
    expect(shell).toContain('aria-expanded={nav}')
    expect(shell).toContain('aria-label="Open navigation"')
  })

  it('locks the page behind it from scrolling', () => {
    expect(shell).toContain("document.body.style.overflow = 'hidden'")
  })

  it('traps focus rather than shipping an eighth overlay that does not', () => {
    expect(shell).toContain('useFocusTrap')
  })

  it('paints the wordmark once, not once per header', () => {
    // The first cut reused <Sidebar> AND added a header of its own, so the
    // drawer opened with CIVENGG above CIVENGG TOOLKIT. Scoped to NavDrawer:
    // the rail and the top bar legitimately carry one each.
    const drawer = shell.slice(shell.indexOf('function NavDrawer'), shell.indexOf('export function AppShell'))
    expect(drawer.length).toBeGreaterThan(400)
    expect(count(drawer, '{BRAND_MARK}')).toBe(0)
    expect(drawer).toContain('<Sidebar')
  })

  it('closes itself when a tool is chosen', () => {
    expect(shell).toContain('onNavigate={onClose}')
    expect(shell).toContain('onClick={onNavigate}')
  })

  it('closes on a route change it did not cause, without an effect', () => {
    // The back button is the route change the drawer cannot see. Adjusted
    // during render (React's "adjusting state when a prop changes"); an
    // effect here paints the drawer over the new page for one frame and is
    // rejected by react-hooks/set-state-in-effect.
    expect(shell).toContain('if (navRoute !== pathname) { setNavRoute(pathname); setNav(false) }')
    expect(shell).not.toMatch(/useEffect\(\(\) => \{ setNav\(false\) \}/)
  })

  it('gives the drawer phone-sized rows and leaves the rail alone', () => {
    // One class string for both: the drawer only exists below lg and the rail
    // only at lg and up, so the viewport does the switching.
    expect(shell).toContain('min-h-[44px]')
    expect(shell).toContain('lg:min-h-0')
  })
})

describe('header at 390px', () => {
  it('lets the breadcrumb shrink so the action group cannot paint over it', () => {
    // It had min-w-0 but no flex-1, so it never shrank: a measured 40px
    // overlap. The action group is flex-none from the other side.
    expect(shell).toContain('flex min-w-0 flex-1 items-center gap-2')
    expect(shell).toContain('ml-auto flex flex-none items-center')
  })
})

describe('hero at 390px', () => {
  it('stacks the search box and the CTA instead of squeezing both', () => {
    const row = home.match(/<div className="mt-7 flex[^"]*"/)?.[0] ?? ''
    expect(row).toContain('flex-col')
    expect(row).toContain('sm:flex-row')
  })

  it('drops the example queries where there is no line to hold them', () => {
    // The long label wrapped to four lines at 390px and pushed the row 60px
    // tall. The prompt alone below sm; the examples return at sm.
    expect(home).toContain('className="sm:hidden"')
    expect(home).toContain('className="hidden sm:inline"')
  })
})

describe('tap targets (WCAG 2.5.8, 24x24 minimum)', () => {
  it('gives every footer link a 24px row', () => {
    // MATCHES THE PROPERTY, NOT THE MARKUP'S SPELLING. The first version of
    // this guard looked for literal `<Link to="/path"` elements, so it saw
    // nothing at all once the links were generated from an array — and, worse,
    // a generated link carrying NO min-h would have passed it silently. It now
    // reads every link element in the file, however its target is written.
    const links = footer.match(/<(?:Link|a) [^>]*className="[^"]*"/g) ?? []
    expect(links.length, 'the footer must still contain link elements').toBeGreaterThan(0)
    for (const l of links) expect(l, l.slice(0, 60)).toContain('min-h-[24px]')
  })

  it('carries every destination the footer is responsible for', () => {
    // The count used to ride on the markup; it rides on the routes now. These
    // are the legal + product destinations a payment provider looks for, so
    // losing one to a refactor is a compliance problem, not a layout one.
    for (const route of ['/pricing', '/docs', '/validation', '/terms', '/privacy', '/refunds', '/contact']) {
      expect(footer, `footer lost ${route}`).toContain(`'${route}'`)
    }
  })

  it('does not leave footer links on a 20px pitch', () => {
    // 16px link + 4px gap = 20px, which fails the size rule AND 2.5.8's
    // spacing exception. A 24px row clears the size rule outright, whatever
    // the gap — so the guard is on the row, not on one spelling of the gap.
    expect(footer).not.toContain('space-y-1 text-[12.5px]')
    expect(footer).toMatch(/min-h-\[24px\]/)
  })

  it('gives the root breadcrumb a 24px row', () => {
    expect(shell).toMatch(/<Link to="\/" className="inline-flex min-h-\[24px\][^"]*">Workbench<\/Link>/)
  })
})
