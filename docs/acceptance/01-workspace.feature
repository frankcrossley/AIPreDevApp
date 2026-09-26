# Screens: V6Story, V6Epic · ADR-001, ADR-003
Feature: One workspace
  Everything happens on one three-column screen.

  Scenario: Selecting a story keeps the user on the same screen
    Given the backlog shows epic BILL-142 with its stories
    When I select BILL-150 in the left column
    Then the centre shows the BILL-150 notebook
    And the right panel shows "For this item" with a count
    And the URL changes but the layout does not

  Scenario: Selecting an epic swaps the centre and right panel contents
    When I select BILL-142
    Then the centre shows its PRFAQ
    And the right panel opens on the Alignment tab

  Scenario: Backlog rows show state at a glance
    Then each story row shows its state and its Right thing and Built right counts
    And BILL-163 is marked "Not in the PRFAQ"
    And BILL-152 is marked Ready

  Scenario: Switching who I'm acting as
    When I choose "Viewing as: Marcus" in the header
    Then stances, triage and read-backs are recorded as Marcus
