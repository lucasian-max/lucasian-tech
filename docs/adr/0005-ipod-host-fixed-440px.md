# 0005 — Pin the iPod host to 440×692 so the component never self-scales

- Status: Accepted
- Date: 2026-11-21
- Deciders: Mridul Vijay
- Supersedes: none

## Context

The vendor component contains a container query along the lines of `@container ipod (width < 360px)` that reduces its internal `--ipod-scale` to `0.75`. During boot the host element can be measured at width `0` before CSS has settled. The component then applies the small-width scale, and when the host reaches its real width the device visibly grows — reported by users as the device "zooming in" after load.

The site already scales the whole set for short viewports through `--set-scale` on `.set`, so the component does not need to scale itself.

## Decision

Pin the host and its ancestors to the component's native size in site CSS:

```css
#stage web-music-ipod {
  display: block;
  width: 440px;
  height: 692px;
}

.set,
.chassis-rig {
  width: 440px;
  height: 692px;
}
```

All responsive scaling is applied outside the component via `--set-scale` on `.set` (media queries for height and width) and the chassis tilt transform. The host width never drops below `440px`, so the container query never selects the `0.75` branch and `--ipod-scale` stays `1`.

`tests/zoom-check.mjs` asserts the contract at desktop (`1440×900`), phone (`390×844`), and small (`360×800`) viewports: host width is exactly `440` and the computed inner `--ipod-scale` is exactly `1`.

## Consequences

- The device renders at its designed pixel size and is scaled only by the outer layout, so boot does not change its apparent scale.
- Any future change to the device's native dimensions must update `.set`, `.chassis-rig`, the host rule, and `tests/zoom-check.mjs` together.
- The component's internal responsive branch is intentionally unused on this site. Patching the vendor bundle to remove it would be a larger maintenance burden than pinning the host.
- The fixed `440×692` box means very narrow viewports rely on `--set-scale` and `overflow: hidden` rather than reflowing the device.

## Alternatives considered

- **Let the component self-scale** — causes the visible zoom jump and produces a smaller device than intended; rejected.
- **Set the width in JavaScript after boot** — introduces a flash of the wrong size and a race with the component's first layout; rejected.
- **Patch the container query in the bundle** — vendor churn on every upgrade and risk to compiled Svelte output; rejected.
- **Transform-scale the host** — conflicts with the chassis tilt transform and pointer hit-testing; rejected.
