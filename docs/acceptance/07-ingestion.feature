# Screens: V5Ingest · ai-teammate.md: extractCandidates, themeSurvey
Feature: Bringing in outside content
  Calls, surveys and tickets become sources and drafts, never agreed content.

  Scenario: A transcript becomes candidate drafts
    Given I upload seed/sources/acme-call.txt from "+ Add source"
    Then I see candidates in the customer's words, each with a timestamp and a suggested item
    And the sales-negotiation line at 21:40 is listed under "Left out" with a reason

  Scenario: Quotes must be real
    Given the model returns a quote that isn't an exact substring of the transcript
    Then that candidate is dropped and a validation event is logged

  Scenario: Surveys become counted themes
    Given I upload seed/sources/survey.csv
    Then I see themes with counts computed from row assignments
    And "Would rather keep a flat fee" is shown even though it argues against the epic

  Scenario: Everything lands as drafts
    When I choose "Send 7 to the tray as drafts"
    Then 7 drafts appear in the right panels of their suggested items, with expiry dates
    And each draft links back to its excerpt
