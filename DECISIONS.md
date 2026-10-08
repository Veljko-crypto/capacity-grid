# Decisions

## What did the spec not tell you?

I treated weeks as Monday to Sunday, with work happening Monday to Friday and assignment start/end dates included. For a partial week, allocation counts only assignment days inside the selected range, and capacity is prorated to the selected working days. Otherwise a short range could make someone look available just because it was being compared with a full week's capacity.

Weekly hours apply to the person across all weeks, including past ones, because the schema has no effective date. The editor makes that clear. After a successful save, I refetch the active range instead of updating every dependent number locally. That adds a request, but keeps the calculations in sync. Failed saves keep the draft; an interrupted request explains that the save may have completed.

## What did you notice that looked wrong?

Eli has zero capacity but still has assigned work. That needs to show as over capacity, rather than an invalid percentage. The seed also contains many separate assignments with identical values. I kept all of them in the totals because different IDs represent separate records; deduplicating would change the supplied data.

I checked the running grid against an independent calculation over the seed, including partial weeks and weekend-only ranges, and exercised a failed save by stopping the API and retrying after restarting it.

## What did the AI get wrong that you caught?

The first version used a direct floating-point comparison to detect overload. Reviewing edge cases exposed that 0.47 hours could become 0.4699999999999999 during capacity calculation, producing a false "0 h over" warning. I asked the AI to fix the calculation and comparison, then added a regression test. Small real overloads now display as "<0.01 h over" instead of being rounded to zero.

## What would you do differently with a week?

I'd move pagination and search to the API, render only visible week columns, and benchmark against a few thousand people over two years. Currently, only 50 people are rendered at once, but the full roster is downloaded. I'd also handle concurrent manager edits: today, the last save wins. Before adding effective-dated capacity, holidays or different working schedules, I'd clarify those rules with the product team.