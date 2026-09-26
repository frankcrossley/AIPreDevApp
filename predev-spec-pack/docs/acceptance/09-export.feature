# Screens: V5Ready · ADR-004
Feature: Ready in Jira (simulated)

  Scenario: Exporting a Ready story
    Given BILL-150 is ready
    When Priya chooses "Send to Jira"
    Then an export JSON and markdown file are produced with the statement, criteria, decisions and citations
    And the story's state is exported

  Scenario: The sprint rule refuses items that aren't Ready
    Given BILL-160 is a draft
    When anyone chooses "Move to sprint" on BILL-160
    Then it is refused with "Not Ready" and a link to its checks

  Scenario: Jira-side drift reopens the item
    Given BILL-152 is exported
    When I trigger "Simulate Jira edit to criteria" from the debug menu
    Then BILL-152 returns to in_refinement and its sign-off is cleared
    And the right panel offers "Pull in as a draft" or "Revert in Jira"
