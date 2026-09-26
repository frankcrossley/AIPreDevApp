# Screens: V6Session · ai-teammate.md: Scrum Master agenda
Feature: Refinement session mode
  The same screen, switched into the room.

  Scenario: The agenda is built for you
    Given a session is planned for Thu 3 Oct
    Then the agenda lists, in order: expiring drafts, divergent read-backs, items near Ready needing the room, blocking questions, new items
    And Ready items are listed as left off

  Scenario: Starting the session changes the screen, not the page
    When I start the session
    Then the header shows live status, attendees and the timer
    And the left column becomes the agenda
    And the right panel shows Talking points in agenda order

  Scenario: Being in the room isn't agreeing
    Given a decision is written during the session
    When I run a stance round
    Then each required person must record agree, concern or object
    And attendance alone records nothing

  Scenario: Timeboxes
    Given an item has 8 minutes left
    When the timebox ends
    Then the Scrum Master offers "Park to async" with an owner and due date

  Scenario: Nothing disappears
    When I end the session
    Then every talking point not reached becomes an async talking point with an owner and due date
    And Jo's capture notes are saved to the session and linked to the items they touched
