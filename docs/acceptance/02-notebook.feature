# Screens: V6Story · ADR-002
Feature: The notebook
  People write freely. Structure is added by typing or selecting, and can be removed.

  Scenario Outline: A prefix turns a line into an item chip
    Given I am editing BILL-150
    When I type "<prefix>" at the start of a line followed by text
    Then the line becomes a <type> item with a chip
    And it appears in the right panel under "<panel section>"

    Examples:
      | prefix     | type       | panel section    |
      | decision:  | decision   | Decisions needed |
      | ?          | question   | Talking points   |
      | assume:    | assumption | Talking points   |
      | risk:      | risk       | Talking points   |

  Scenario: Selecting text offers "Turn into"
    When I select a sentence
    Then a toolbar offers Decision, Question, Assumption, Risk and Story
    And choosing one creates the item linked to that text

  Scenario: Structure can be removed
    Given a line is a decision item
    When I choose "Turn back into plain text"
    Then the chip is removed, the text remains, and the item is archived with its history

  Scenario: Questions can be marked blocking
    When I mark "What happens on a downgrade mid-cycle?" as blocking
    Then it shows a BLOCKING chip
    And Built right fails "no_blocking_questions" with a link to it

  Scenario: Editing agreed content reopens it
    Given the decision "Upgrades apply immediately, charged by the day" is agreed by Priya, Sam and Dan
    When Dan edits its text
    Then his edit is saved as a suggestion, and the agreed decision is unchanged
    When Priya accepts the suggestion
    Then she sees "Priya, Sam and Dan agreed this. Accepting reopens it for all three."
    And if she accepts, the decision's stances are cleared and requested again
    And the story's lead sign-off is cleared

  # Added after bolt 2 (ADR-025, ADR-026, ADR-027)
  Scenario: Only the lead edits directly
    Given I am viewing as Marcus on BILL-150, whose lead is Priya
    When I add a line
    Then it is saved as my suggestion, shown dashed with "Your suggestion" and its expiry
    And Priya sees it under the line it follows, with Accept and Reject

  Scenario: A prefix can be escaped
    When I type "risk: " and then press Backspace
    Then the chip is removed and "risk: " stays as plain text
    And pasted text that starts with a prefix never becomes a chip

  Scenario: Deleting a line others cite
    Given "Immediately means both the plan and the invoice line" and a criterion cite the decision line
    When Priya deletes the decision line
    Then she sees what cites it before saving
    And confirming adds a talking point for each to realign its source
