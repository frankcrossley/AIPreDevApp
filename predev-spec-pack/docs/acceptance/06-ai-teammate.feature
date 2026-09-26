# Screens: V5Shape, V6Story hat notes, V5Lenses · ai-teammate.md · ADR-005, ADR-006
Feature: The AI teammate reshapes and challenges, and never adds a fact

  Scenario: Shaped output links every line to its notes
    Given BILL-150's notes as seeded
    When I switch to the Shaped view
    Then every statement and criterion shows the note or excerpt IDs it came from
    And clicking a reference highlights the source line on the left

  Scenario: The validator rejects invented facts
    Given the model returns a criterion with origin "notes" that mentions "30 days" which appears in no cited ref
    Then the criterion is stored as unconfirmed, with origin "shaper"
    And it is shown dashed with "Not from your notes. Keep, remove or ask."
    And a validation event is logged

  Scenario: The validator rejects unknown references
    Given the model returns a ref that doesn't exist in the input
    Then the whole response is rejected and nothing is stored
    And the user sees "Couldn't reshape this safely. Try again."

  Scenario: Hat-origin criteria need a person
    Given QA suggests "a retried request after a plan change is priced at the original plan"
    Then it is dashed and unconfirmed
    And "criteria_traced" fails until a person keeps or removes it

  Scenario: Hats ask, they don't decide
    Then every hat note ends with a question or cites a source
    And no hat note can create a stance, a sign-off or an agreed decision

  Scenario: Hats are capped and ranked
    Then no item shows more than 3 open notes from one hat
    And notes that would change a check result rank first

  Scenario: Calling a hat directly
    When I type "@architect does this need a new event?" in a note
    Then an Architect note replies under that line, citing ADR-022 if relevant

  Scenario: The Scrum Master is predictable
    Given the same data
    Then the agenda, the expiry dates and the "what blocks Ready" summary are always identical
    # Unit-tested in src/domain/scrum-master.test.ts; no model call
