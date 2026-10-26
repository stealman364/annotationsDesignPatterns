---
'annotations-design-patterns': patch
---

Add a bilingual (ES/EN) documentation site (`/website`, private npm workspace, not published) combining API reference generated from `src/**` via TypeDoc with hand-maintained guides for all 10 public entrypoints. No runtime code changed — comments/JSDoc only, verified against the existing public export surface.
