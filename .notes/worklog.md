# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

- Implementation assumptions: Monday weeks, inclusive assignment boundaries, weekdays only, and capacity prorated by selected weekdays (weekly_hours / 5). Updating weekly hours changes the person's capacity for all dates; there is no effective-date field.
- Seed inspection: 500 people, 126,195 assignments; many distinct assignment IDs have identical payloads. Sum all records without deduplication or interpreting fractional hours as percentages. Zero-capacity people may still have allocations.
- Save strategy: confirmed PATCH followed by an authoritative active-range refresh. Old numbers are hidden during refresh; failed saves keep the draft. Range requests are aborted and guarded on cleanup so late responses cannot overwrite newer ranges. Navigation is disabled during a save.
- Scale tradeoff: scope SQL to requested dates and render 50 people per page, with name search and an over-capacity filter. All roster totals are still transferred for the range; server pagination and column virtualization are deferred.
