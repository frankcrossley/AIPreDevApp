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
    Then I see "Priya, Sam and Dan agreed this. Saving reopens it for all three."
    And if he saves, the decision's stances are cleared and requested again
    And the story's lead sign-off is cleared
