TASK: Same system, same role, same output contract. Now the DASHBOARD module. IDs: TC-DASH-001, TC-DASH-002, …

REQUIRED COVERAGE — every item, explicitly:
1. Widget loading
2. Data accuracy
3. Filter / sort behaviour
4. Responsive layout
5. Permission-based visibility

CONSTRAINTS:
- Data accuracy must compare the UI to a SOURCE OF TRUTH: the API response, or data the test seeded itself. Reading a number off the screen and comparing it to the same screen proves nothing.
- Filters: assert BOTH directions. The list narrows, every remaining note belongs to the filter, AND no matching note is missing. A count alone passes a filter that returns the wrong rows.
- Sort: there is no sort control. State the ordering you expect as an @assumption, and test it as behaviour (what happens to the order when a note changes), not only as a static snapshot.
- Responsive: assert what a user feels (horizontal scrolling, controls still usable), never pixel widths of specific elements.
- Permission visibility: this app has no roles. Interpret "permission" as what a logged-out visitor and a different user can reach. Test direct URLs — hiding a link is not access control.
- Each case seeds its own notes through the API. Never depend on pre-existing data.

OUTPUT CONTRACT: as for Login, with a Scenario Outline for the category filter across Home / Work / Personal. 8 to 11 scenarios.

SELF-CHECK: as for Login.
