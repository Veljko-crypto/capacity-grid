# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

- Implementation assumptions: Monday weeks, inclusive assignment boundaries, weekdays only, and capacity prorated by selected weekdays (weekly_hours / 5). Updating weekly hours changes the person's capacity for all dates; there is no effective-date field.
- Seed inspection: 500 people, 126,195 assignments; many distinct assignment IDs have identical payloads. Sum all records without deduplication or interpreting fractional hours as percentages. Zero-capacity people may still have allocations.
- Save strategy: confirmed PATCH followed by an authoritative active-range refresh. Old numbers are hidden during refresh; failed saves keep the draft. Range requests are aborted and guarded on cleanup so late responses cannot overwrite newer ranges. Navigation is disabled during a save.
- Scale tradeoff: scope SQL to requested dates and render 50 people per page, with name search and an over-capacity filter. All roster totals are still transferred for the range; server pagination and column virtualization are deferred.

- Verification: `python tests/verify_api.py` compares every person's allocations against independent Decimal arithmetic over the fixed seed for full weeks, partial weeks, a weekend-only range, and an empty future range; all passed. Invalid dates/bodies/IDs, zero and fractional-hour persisted updates also passed. The seeded two-year response (105 columns x 500 people) took about 0.46 seconds locally; this is not a production benchmark.
- Browser verification: inspected starter totals (Ana 40/0/30, Bo 0/32/8, Cem 0/4/12, Dee 0/45/40, Eli 0/20/0). Changed Dee 40 -> 32 and saw 13h and 8h over; stopped the API to verify a failed save preserves the 40h draft, restarted and retried successfully. Original values restored. Confirmed week navigation, over-capacity filter (41 people in starter range), and Jan 7-13 selection (3 and 2 working days, 24h and 16h capacity for a 40h person).
- Frontend verification: four Vitest tests cover date validation, partial/zero capacity, an out-of-order fetch ignoring abort, failed-save retry and failed refresh after confirmed save. TypeScript and production build passed. Initial test run exposed jsdom lacking scrollIntoView; mocked that browser API in the test environment.
- Local development snag: Docker's Windows bind mount exposed updated files but Vite continued serving cached source; restarting only the web service resolved it. Date submission reads named form fields directly, ensuring the range uses the values displayed by native date inputs. No fixed run-environment files were modified.
- Remaining tradeoffs: client pagination bounds rows, but two years still renders up to 105 columns for 50 people and downloads the entire roster. Production work would add server pagination/search, query benchmarks at realistic scale, column virtualization, effective-dated capacity if required, and multi-manager conflict handling (currently last write wins). Display hours round to two decimals; stored values are not rounded. DECISIONS.md remains human-authored and untouched.
