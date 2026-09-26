# Screens: V6Story, V5Tray (merged into the right panel) · domain.md: Draft rules
Feature: Everything that needs you, on the right
  Drafts, decisions needed, talking points and discovery themes live beside the notebook.

  Scenario: The panel is ranked
    Given BILL-150 has open decisions, hat notes, drafts and discovery items
    Then the panel shows, in order: the Scrum Master summary, Decisions needed, Talking points, From discovery
    And sections with nothing in them are hidden

  Scenario: Drafts from outside a session are time-bound
    Given Mei adds "Should the invoice explain the proration?" outside a session
    Then it appears as a dashed draft card with "expires in N days"
    And N is the earlier of the template's expiry and the next session

  Scenario: Only the lead can triage
    Given I am viewing as Sam
    Then the draft's Accept, Merge and Reject actions are disabled with the reason "Priya is the lead"
    When I switch to Priya and choose Accept
    Then the draft becomes an unagreed block on BILL-150
    And no agreed content is changed

  Scenario: Expired drafts are archived, not deleted
    Given a draft passes its expiry without triage
    Then it leaves the panel
    And it can be found under Activity with a Restore action

  Scenario: Product hat suggests a better home
    Given a discovery quote about department budgets is suggested for BILL-150
    Then the card shows "PM · Fits BILL-160 better" with a "Move it there" action
