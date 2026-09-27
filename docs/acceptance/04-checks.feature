# Screens: V6Checks, V6Story meters · domain.md: Floor checks · ADR-007
Feature: Right thing and Built right
  Two computed checks gate Ready. Neither can be set by hand.

  Scenario: Meters reflect computed results
    Given BILL-150 as seeded
    Then Right thing shows 4 of 5, failing "team_aligned"
    And Built right shows 5 of 8

  Scenario: Every failing line links to its fix
    When I open the checks
    And I click "No blocking questions · downgrade mid-cycle"
    Then the notebook scrolls to that question and highlights it

  Scenario: Floor checks can't be removed
    When I edit the Story template
    Then floor checks are listed but can't be unticked
    And team checks can be added or removed

  Scenario: Ready needs both checks and the lead
    Given all checks pass on BILL-150
    Then "Sign off as Ready" is enabled only for Priya
    When Priya signs off
    Then BILL-150's state is ready

  Scenario: There is no way to force Ready
    Then no API route or UI control sets a story to ready without passing checks and the lead's sign-off
    # Enforced with a unit test on the state machine and an API test on the route
