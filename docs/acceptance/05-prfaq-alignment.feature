# Screens: V6Epic · domain.md: PRFAQ agreement · ai-teammate.md: assessReadBack
Feature: Building the right thing
  The epic's PRFAQ anchors every story. Agreement is measured with read-backs, not assumed.

  Scenario: Customer FAQ answers link to the stories that deliver them
    Then "What if I change plan mid-month?" links to BILL-150
    And "Will my bill jump?" links to BILL-151 and shows it's still open

  Scenario: The customer quote is real
    Then the quote block shows the excerpt's source and locator
    And it can't be edited except by choosing a different excerpt

  Scenario: Read-backs are required from every member
    Given I am viewing as Security, who has no read-back
    Then I'm asked to write one line: what are we building, and why?

  Scenario: Divergent read-backs are flagged
    Given Dan's read-back is "Hourly billing so customers see live cost."
    Then it is assessed as diverges, with a note explaining what the PRFAQ says instead
    And a "Talk it through" action adds it to the next session's agenda

  Scenario: Pasting the headline doesn't count
    When someone's read-back is over 85% similar to a PRFAQ sentence
    Then it is marked "too close to the page, say it in your own words"

  Scenario: Stories that serve no promise are flagged
    Then BILL-163 appears under "serves no promise" with Add a promise, Move to its own epic and Drop it

  Scenario: The PRFAQ can't be agreed early
    Given one read-back diverges and the flat-fee internal FAQ is unanswered
    Then "Agree the PRFAQ" is disabled, with both reasons listed
    And no story in BILL-142 can pass "team_aligned"
